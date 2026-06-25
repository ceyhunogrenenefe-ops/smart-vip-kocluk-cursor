import { supabaseAdmin } from './supabase-admin.js';
import { resolveBbbMeetingDurationMinutes } from './bbb.js';
import {
  ensureBbbMeetingAlive,
  buildBbbAttendeeJoinUrl,
  parseBbbJoinCredentials,
  parseBbbMeetingIdFromJoinUrl,
  isBbbConfigured,
  isBbbAutoMeetingLink
} from './bbb.js';
import { patchRowMeetingLinks } from './bbb-join-handler.js';
import { sessionEndUtcMs, wallTimeToUtcMs } from './class-session-end-ms.js';
import { signBbbGuestJoinToken, guestJoinPageUrl } from './bbb-guest-token.js';
import { upsertGuestJoinShortCode } from './guest-join-short-link.js';
import { formatGuestInviteShareText } from './guest-join-share-text.js';

const GUEST_JOIN_OPEN_MINUTES_BEFORE = 15;
const GUEST_JOIN_CLOSE_MINUTES_AFTER = 60;

function sanitizeGuestName(raw) {
  const name = String(raw || '')
    .trim()
    .replace(/[<>"\\]/g, '')
    .slice(0, 64);
  return name || 'Misafir';
}

export function guestJoinWindowForClassSession(session, nowMs = Date.now()) {
  const startMs = wallTimeToUtcMs(session.lesson_date, session.start_time);
  const endMs = sessionEndUtcMs(session.lesson_date, session.start_time, session.end_time);
  if (startMs == null || endMs == null) return { ok: false, reason: 'invalid_schedule' };
  const openFrom = startMs - GUEST_JOIN_OPEN_MINUTES_BEFORE * 60 * 1000;
  const openUntil = endMs + GUEST_JOIN_CLOSE_MINUTES_AFTER * 60 * 1000;
  if (nowMs < openFrom) return { ok: false, reason: 'too_early', openFrom, openUntil };
  if (nowMs > openUntil) return { ok: false, reason: 'expired', openFrom, openUntil };
  return { ok: true, openFrom, openUntil };
}

export function guestJoinWindowForTeacherLesson(lesson, nowMs = Date.now()) {
  const startMs = wallTimeToUtcMs(lesson.date, lesson.start_time);
  const endMs = sessionEndUtcMs(lesson.date, lesson.start_time, lesson.end_time);
  if (startMs == null || endMs == null) return { ok: false, reason: 'invalid_schedule' };
  const openFrom = startMs - GUEST_JOIN_OPEN_MINUTES_BEFORE * 60 * 1000;
  const openUntil = endMs + GUEST_JOIN_CLOSE_MINUTES_AFTER * 60 * 1000;
  if (nowMs < openFrom) return { ok: false, reason: 'too_early', openFrom, openUntil };
  if (nowMs > openUntil) return { ok: false, reason: 'expired', openFrom, openUntil };
  return { ok: true, openFrom, openUntil };
}

async function loadClassSession(id) {
  const { data, error } = await supabaseAdmin.from('class_sessions').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function loadTeacherLesson(id) {
  const { data, error } = await supabaseAdmin.from('teacher_lessons').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function teacherDisplayName(teacherId) {
  if (!teacherId) return 'Öğretmen';
  const { data } = await supabaseAdmin.from('users').select('name,email').eq('id', teacherId).maybeSingle();
  return data?.name || data?.email || 'Öğretmen';
}

async function buildClassGuestJoinUrl(session, guestName) {
  if (String(session.status || '') === 'cancelled') {
    throw new Error('Bu ders iptal edilmiş.');
  }
  const window = guestJoinWindowForClassSession(session);
  if (!window.ok) {
    if (window.reason === 'too_early') throw new Error('Ders henüz başlamadı. Derse 15 dakika kala tekrar deneyin.');
    if (window.reason === 'expired') throw new Error('Bu ders için katılım süresi dolmuş.');
    throw new Error('Ders zamanı geçersiz.');
  }
  if (!isBbbConfigured()) throw new Error('BBB sunucusu yapılandırılmamış.');

  const subject = String(session.subject || 'Grup dersi').trim();
  const meetingKeyPrefix = `cljoin${String(session.id || '').replace(/-/g, '')}`;
  let durationMinutes = resolveBbbMeetingDurationMinutes(0);
  if (session.start_time && session.end_time) {
    const [sh, sm] = String(session.start_time).split(':').map(Number);
    const [eh, em] = String(session.end_time).split(':').map(Number);
    const mins = eh * 60 + em - (sh * 60 + sm);
    if (mins > 0) durationMinutes = resolveBbbMeetingDurationMinutes(mins);
  }

  const attendeeLink = String(session.meeting_link || '').trim();
  const moderatorLink = session.meeting_link_moderator ? String(session.meeting_link_moderator).trim() : null;

  const ensured = await ensureBbbMeetingAlive({
    attendeeLink: isBbbAutoMeetingLink(attendeeLink) ? attendeeLink : attendeeLink,
    moderatorLink,
    meetingName: subject,
    attendeeName: guestName,
    moderatorName: await teacherDisplayName(String(session.teacher_id || '')),
    durationMinutes,
    meetingKeyPrefix,
    storedMeetingId: session.bbb_meeting_id
  });

  if (ensured.refreshed) {
    await patchRowMeetingLinks('class_sessions', session.id, {
      meeting_link: ensured.attendeeLink,
      ...(ensured.moderatorLink ? { meeting_link_moderator: ensured.moderatorLink } : {}),
      ...(ensured.meetingId ? { bbb_meeting_id: ensured.meetingId } : {}),
      ...(ensured.attendeePW ? { bbb_attendee_pw: ensured.attendeePW } : {})
    });
  } else if (ensured.meetingId && !String(session.bbb_meeting_id || '').trim()) {
    await patchRowMeetingLinks('class_sessions', session.id, {
      meeting_link: ensured.attendeeLink,
      ...(ensured.moderatorLink ? { meeting_link_moderator: ensured.moderatorLink } : {}),
      bbb_meeting_id: ensured.meetingId,
      ...(ensured.attendeePW ? { bbb_attendee_pw: ensured.attendeePW } : {})
    });
  }

  const meetingId =
    String(ensured.meetingId || session.bbb_meeting_id || '').trim() ||
    parseBbbMeetingIdFromJoinUrl(ensured.attendeeLink) ||
    '';
  const attendeePw =
    String(ensured.attendeePW || session.bbb_attendee_pw || '').trim() ||
    parseBbbJoinCredentials(ensured.attendeeLink)?.attendeePassword ||
    '';

  if (meetingId && attendeePw) {
    return buildBbbAttendeeJoinUrl({ meetingId, attendeePassword: attendeePw, fullName: guestName });
  }
  return ensured.attendeeLink;
}

async function buildPrivateGuestJoinUrl(lesson, guestName) {
  if (String(lesson.status || '') === 'cancelled') {
    throw new Error('Bu ders iptal edilmiş.');
  }
  const window = guestJoinWindowForTeacherLesson(lesson);
  if (!window.ok) {
    if (window.reason === 'too_early') throw new Error('Ders henüz başlamadı. Derse 15 dakika kala tekrar deneyin.');
    if (window.reason === 'expired') throw new Error('Bu ders için katılım süresi dolmuş.');
    throw new Error('Ders zamanı geçersiz.');
  }
  if (!isBbbConfigured()) throw new Error('BBB sunucusu yapılandırılmamış.');

  const { data: student } = await supabaseAdmin
    .from('students')
    .select('name')
    .eq('id', lesson.student_id)
    .maybeSingle();
  const teacherName = await teacherDisplayName(String(lesson.teacher_id || ''));
  const meetingKeyPrefix = `tljoin${String(lesson.id || '').replace(/-/g, '')}`;
  const durationMinutes = Number(lesson.duration_minutes) || 60;

  const attendeeLink = String(lesson.meeting_link || '').trim();
  const moderatorLink = lesson.meeting_link_moderator ? String(lesson.meeting_link_moderator).trim() : null;

  const ensured = await ensureBbbMeetingAlive({
    attendeeLink,
    moderatorLink,
    meetingName: String(lesson.title || 'Canlı özel ders'),
    attendeeName: String(student?.name || guestName),
    moderatorName: teacherName,
    durationMinutes,
    meetingKeyPrefix,
    storedMeetingId: lesson.bbb_meeting_id
  });

  if (ensured.refreshed) {
    await patchRowMeetingLinks('teacher_lessons', lesson.id, {
      meeting_link: ensured.attendeeLink,
      ...(ensured.moderatorLink ? { meeting_link_moderator: ensured.moderatorLink } : {}),
      ...(ensured.meetingId ? { bbb_meeting_id: ensured.meetingId } : {}),
      ...(ensured.attendeePW ? { bbb_attendee_pw: ensured.attendeePW } : {})
    });
  }

  const meetingId =
    String(ensured.meetingId || lesson.bbb_meeting_id || '').trim() ||
    parseBbbMeetingIdFromJoinUrl(ensured.attendeeLink) ||
    '';
  const attendeePw =
    String(ensured.attendeePW || lesson.bbb_attendee_pw || '').trim() ||
    parseBbbJoinCredentials(ensured.attendeeLink)?.attendeePassword ||
    '';

  if (meetingId && attendeePw) {
    return buildBbbAttendeeJoinUrl({ meetingId, attendeePassword: attendeePw, fullName: guestName });
  }
  return ensured.attendeeLink;
}

export async function resolveGuestBbbJoinUrl({ kind, id, guestName }) {
  const name = sanitizeGuestName(guestName);
  if (kind === 'private') {
    const lesson = await loadTeacherLesson(id);
    if (!lesson) throw new Error('Ders bulunamadı.');
    const url = await buildPrivateGuestJoinUrl(lesson, name);
    if (!url) throw new Error('Toplantı bağlantısı oluşturulamadı.');
    return { url, title: String(lesson.title || 'Canlı ders') };
  }
  const session = await loadClassSession(id);
  if (!session) throw new Error('Ders oturumu bulunamadı.');
  const url = await buildClassGuestJoinUrl(session, name);
  if (!url) throw new Error('Toplantı bağlantısı oluşturulamadı.');
  return { url, title: String(session.subject || 'Grup dersi') };
}

async function loadClassName(classId) {
  if (!classId) return '';
  const { data } = await supabaseAdmin.from('classes').select('name').eq('id', classId).maybeSingle();
  return String(data?.name || '').trim();
}

async function finalizeGuestInviteUrl({ kind, id, token, expiresAtIso, title, lessonDate, lessonTime, className }) {
  const longUrl = guestJoinPageUrl(token);
  const short = await upsertGuestJoinShortCode({
    kind,
    resourceId: id,
    token,
    expiresAtIso
  });
  const url = short?.url || longUrl;
  const shareText = formatGuestInviteShareText({
    title,
    lessonDate,
    lessonTime,
    url,
    className
  });
  return {
    token,
    url,
    longUrl,
    code: short?.code || null,
    shareText,
    expiresAt: expiresAtIso,
    title,
    lessonDate,
    lessonTime
  };
}

export async function createGuestJoinShareLink({ kind, id }) {
  if (kind === 'private') {
    const lesson = await loadTeacherLesson(id);
    if (!lesson) throw new Error('Ders bulunamadı.');
    if (String(lesson.status || '') === 'cancelled') throw new Error('İptal edilmiş ders için link oluşturulamaz.');
    const window = guestJoinWindowForTeacherLesson(lesson);
    const expSec = window.openUntil
      ? Math.floor(window.openUntil / 1000)
      : Math.floor(Date.now() / 1000) + 7 * 86400;
    const token = signBbbGuestJoinToken({ kind: 'private', id, exp: expSec });
    return finalizeGuestInviteUrl({
      kind: 'private',
      id,
      token,
      expiresAtIso: new Date(expSec * 1000).toISOString(),
      title: String(lesson.title || 'Canlı özel ders'),
      lessonDate: String(lesson.date || '').slice(0, 10),
      lessonTime: String(lesson.start_time || '').slice(0, 5),
      className: ''
    });
  }
  const session = await loadClassSession(id);
  if (!session) throw new Error('Ders oturumu bulunamadı.');
  if (String(session.status || '') === 'cancelled') throw new Error('İptal edilmiş ders için link oluşturulamaz.');
  const window = guestJoinWindowForClassSession(session);
  const expSec = window.openUntil
    ? Math.floor(window.openUntil / 1000)
    : Math.floor(Date.now() / 1000) + 7 * 86400;
  const token = signBbbGuestJoinToken({ kind: 'class', id, exp: expSec });
  const className = await loadClassName(String(session.class_id || ''));
  return finalizeGuestInviteUrl({
    kind: 'class',
    id,
    token,
    expiresAtIso: new Date(expSec * 1000).toISOString(),
    title: String(session.subject || 'Grup dersi'),
    lessonDate: String(session.lesson_date || '').slice(0, 10),
    lessonTime: String(session.start_time || '').slice(0, 5),
    className
  });
}
