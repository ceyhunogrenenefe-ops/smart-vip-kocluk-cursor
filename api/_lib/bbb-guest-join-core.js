import { supabaseAdmin } from './supabase-admin.js';
import { resolveBbbMeetingDurationMinutes } from './bbb.js';
import {
  ensureBbbMeetingAlive,
  buildBbbAttendeeJoinUrl,
  parseBbbJoinCredentials,
  parseBbbMeetingIdFromJoinUrl,
  isBbbConfigured,
  isBbbAutoMeetingLink,
  bbbStudentEtutReportLogoutUrl,
  resolveLiveBbbAttendeeCredentials
} from './bbb.js';
import { patchRowMeetingLinks, patchCoachingMeetingLinks } from './bbb-join-handler.js';
import {
  resolveConsecutiveClassBbbReuse,
  syncConsecutivePeerMeetingLinks
} from './consecutive-class-bbb-reuse.js';
import { resolveClassSessionBbbReuse } from './combined-class-bbb-reuse.js';
import { sessionEndUtcMs, wallTimeToUtcMs } from './class-session-end-ms.js';
import { signBbbGuestJoinToken, guestJoinPageUrl } from './bbb-guest-token.js';
import { upsertGuestJoinShortCode } from './guest-join-short-link.js';
import { formatGuestInviteShareText } from './guest-join-share-text.js';
import {
  ACADEMIC_STUDY_ROOM_LABELS,
  DEFAULT_ACADEMIC_LINKS
} from './academic-center-links-store.js';

const VALID_STUDY_ROOMS = new Set(['class56', 'class78', 'class911', 'yks']);
const ACADEMIC_STUDY_GUEST_EXPIRE_DAYS = 90;

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

/** teacher_lessons DB: lesson_date; API: date */
function teacherLessonDate(lesson) {
  return String(lesson?.lesson_date || lesson?.date || '')
    .trim()
    .slice(0, 10);
}

export function guestJoinWindowForTeacherLesson(lesson, nowMs = Date.now()) {
  const lessonDate = teacherLessonDate(lesson);
  const startMs = wallTimeToUtcMs(lessonDate, lesson.start_time);
  const endMs = sessionEndUtcMs(lessonDate, lesson.start_time, lesson.end_time);
  if (startMs == null || endMs == null) return { ok: false, reason: 'invalid_schedule' };
  const openFrom = startMs - GUEST_JOIN_OPEN_MINUTES_BEFORE * 60 * 1000;
  const openUntil = endMs + GUEST_JOIN_CLOSE_MINUTES_AFTER * 60 * 1000;
  if (nowMs < openFrom) return { ok: false, reason: 'too_early', openFrom, openUntil };
  if (nowMs > openUntil) return { ok: false, reason: 'expired', openFrom, openUntil };
  return { ok: true, openFrom, openUntil };
}

export function guestJoinWindowForMeeting(meeting, nowMs = Date.now()) {
  const startMs = meeting?.start_time ? new Date(meeting.start_time).getTime() : NaN;
  const endMs = meeting?.end_time ? new Date(meeting.end_time).getTime() : NaN;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { ok: false, reason: 'invalid_schedule' };
  }
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

async function loadMeeting(id) {
  const { data, error } = await supabaseAdmin.from('meetings').select('*').eq('id', id).maybeSingle();
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
  let meetingKeyPrefix = `cljoin${String(session.id || '').replace(/-/g, '')}`;
  let durationMinutes = resolveBbbMeetingDurationMinutes(0);
  if (session.start_time && session.end_time) {
    const [sh, sm] = String(session.start_time).split(':').map(Number);
    const [eh, em] = String(session.end_time).split(':').map(Number);
    const mins = eh * 60 + em - (sh * 60 + sm);
    if (mins > 0) durationMinutes = resolveBbbMeetingDurationMinutes(mins);
  }

  let attendeeLink = String(session.meeting_link || '').trim();
  let moderatorLink = session.meeting_link_moderator ? String(session.meeting_link_moderator).trim() : null;
  let storedMeetingId = session.bbb_meeting_id;
  let syncPeers = null;

  try {
    const consecutive = await resolveConsecutiveClassBbbReuse(session);
    const reuse = await resolveClassSessionBbbReuse(session, consecutive);
    if (reuse) {
      syncPeers = reuse.peers;
      if (reuse.meetingKeyPrefix) meetingKeyPrefix = reuse.meetingKeyPrefix;
      if (reuse.chainDurationMinutes != null) durationMinutes = reuse.chainDurationMinutes;
      if (reuse.storedMeetingId) storedMeetingId = reuse.storedMeetingId;
      if (reuse.seededFromPeer) {
        if (reuse.seedAttendeeLink) attendeeLink = reuse.seedAttendeeLink;
        if (reuse.seedModeratorLink != null) moderatorLink = reuse.seedModeratorLink;
        if (reuse.seedAttendeePw && !String(session.bbb_attendee_pw || '').trim()) {
          session.bbb_attendee_pw = reuse.seedAttendeePw;
        }
      } else if (reuse.seedAttendeePw && !String(session.bbb_attendee_pw || '').trim()) {
        session.bbb_attendee_pw = reuse.seedAttendeePw;
      }
    }
  } catch {
    /* mevcut tek-oturum guest join */
  }

  const ensured = await ensureBbbMeetingAlive({
    attendeeLink: isBbbAutoMeetingLink(attendeeLink) ? attendeeLink : attendeeLink,
    moderatorLink,
    meetingName: subject,
    attendeeName: guestName,
    moderatorName: await teacherDisplayName(String(session.teacher_id || '')),
    durationMinutes,
    meetingKeyPrefix,
    storedMeetingId
  });

  const linksPatch = {
    meeting_link: ensured.attendeeLink,
    ...(ensured.moderatorLink ? { meeting_link_moderator: ensured.moderatorLink } : {}),
    ...(ensured.meetingId ? { bbb_meeting_id: ensured.meetingId } : {}),
    ...(ensured.attendeePW ? { bbb_attendee_pw: ensured.attendeePW } : {})
  };

  if (ensured.refreshed) {
    await patchRowMeetingLinks('class_sessions', session.id, linksPatch);
  } else if (ensured.meetingId && !String(session.bbb_meeting_id || '').trim()) {
    await patchRowMeetingLinks('class_sessions', session.id, {
      meeting_link: ensured.attendeeLink,
      ...(ensured.moderatorLink ? { meeting_link_moderator: ensured.moderatorLink } : {}),
      bbb_meeting_id: ensured.meetingId,
      ...(ensured.attendeePW ? { bbb_attendee_pw: ensured.attendeePW } : {})
    });
  }

  if (syncPeers?.length && ensured.attendeeLink) {
    try {
      const multiClass =
        new Set((syncPeers || []).map((p) => String(p.class_id || '').trim()).filter(Boolean)).size >= 2;
      await syncConsecutivePeerMeetingLinks(syncPeers, String(session.id || ''), linksPatch, {
        force: multiClass
      });
    } catch {
      /* peer sync guest join'i bozmasın */
    }
  }

  const { meetingId, attendeePw } = await resolveLiveBbbAttendeeCredentials({
    ensured,
    row: session
  });

  if (meetingId && attendeePw) {
    return buildBbbAttendeeJoinUrl({ meetingId, attendeePassword: attendeePw, fullName: guestName });
  }
  throw new Error('BBB katılım bağlantısı oluşturulamadı. Lütfen panelden tekrar «Katıl» deneyin.');
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

  const { meetingId, attendeePw } = await resolveLiveBbbAttendeeCredentials({
    ensured,
    row: lesson
  });

  if (meetingId && attendeePw) {
    return buildBbbAttendeeJoinUrl({ meetingId, attendeePassword: attendeePw, fullName: guestName });
  }
  throw new Error('BBB katılım bağlantısı oluşturulamadı. Lütfen panelden tekrar «Katıl» deneyin.');
}

async function buildMeetingGuestJoinUrl(meeting, guestName) {
  if (String(meeting.status || '') === 'cancelled' || String(meeting.status || '') === 'missed') {
    throw new Error('Bu görüşme iptal edilmiş veya kaçırılmış.');
  }
  const window = guestJoinWindowForMeeting(meeting);
  if (!window.ok) {
    if (window.reason === 'too_early') {
      throw new Error('Görüşme henüz başlamadı. Görüşmeye 15 dakika kala tekrar deneyin.');
    }
    if (window.reason === 'expired') throw new Error('Bu görüşme için katılım süresi dolmuş.');
    throw new Error('Görüşme zamanı geçersiz.');
  }
  if (!isBbbConfigured()) throw new Error('BBB sunucusu yapılandırılmamış.');

  const [{ data: student }, { data: coach }] = await Promise.all([
    supabaseAdmin.from('students').select('name').eq('id', meeting.student_id).maybeSingle(),
    supabaseAdmin.from('coaches').select('name,email').eq('id', meeting.coach_id).maybeSingle()
  ]);

  const start = meeting.start_time ? new Date(meeting.start_time) : null;
  const end = meeting.end_time ? new Date(meeting.end_time) : null;
  let durationMinutes = 60;
  if (start && end && !Number.isNaN(+start) && !Number.isNaN(+end)) {
    durationMinutes = Math.max(15, Math.round((+end - +start) / 60_000));
  }

  const attendeeLink = String(meeting.meet_link || '').trim();
  const moderatorLink = meeting.link_bbb ? String(meeting.link_bbb).trim() : null;
  const meetingKeyPrefix = `mtgjoin${String(meeting.id || '').replace(/-/g, '')}`;

  const ensured = await ensureBbbMeetingAlive({
    attendeeLink,
    moderatorLink,
    meetingName: String(meeting.title || meeting.notes || 'Online görüşme'),
    attendeeName: String(student?.name || guestName),
    moderatorName: String(coach?.name || coach?.email || 'Koç'),
    durationMinutes,
    meetingKeyPrefix,
    storedMeetingId: meeting.bbb_meeting_id || null
  });

  if (ensured.refreshed || (ensured.attendeeLink && ensured.attendeeLink !== attendeeLink)) {
    await patchCoachingMeetingLinks(meeting.id, {
      meeting_link: ensured.attendeeLink,
      meeting_link_moderator: ensured.moderatorLink || ensured.attendeeLink
    });
  }

  const { meetingId, attendeePw } = await resolveLiveBbbAttendeeCredentials({
    ensured,
    row: {
      meeting_link: meeting.meet_link,
      meeting_link_moderator: meeting.link_bbb,
      bbb_meeting_id: meeting.bbb_meeting_id,
      bbb_attendee_pw: meeting.bbb_attendee_pw
    }
  });

  if (meetingId && attendeePw) {
    return buildBbbAttendeeJoinUrl({ meetingId, attendeePassword: attendeePw, fullName: guestName });
  }
  throw new Error('BBB katılım bağlantısı oluşturulamadı. Lütfen panelden tekrar «Katıl» deneyin.');
}

export async function resolveGuestBbbJoinUrl({ kind, id, guestName }) {
  const name = sanitizeGuestName(guestName);
  if (kind === 'academic-study') {
    const { institutionId, room } = parseAcademicStudyGuestId(id);
    if (!VALID_STUDY_ROOMS.has(room)) throw new Error('Etüt sınıfı bulunamadı.');
    const url = await buildAcademicStudyGuestJoinUrl({ institutionId, room, guestName: name });
    const title =
      ACADEMIC_STUDY_ROOM_LABELS[room] || DEFAULT_ACADEMIC_LINKS.studyClasses[room] || 'Etüt Sınıfı';
    return { url, title };
  }
  if (kind === 'private') {
    const lesson = await loadTeacherLesson(id);
    if (!lesson) throw new Error('Ders bulunamadı.');
    const url = await buildPrivateGuestJoinUrl(lesson, name);
    if (!url) throw new Error('Toplantı bağlantısı oluşturulamadı.');
    return { url, title: String(lesson.title || 'Canlı ders') };
  }
  if (kind === 'meeting') {
    const meeting = await loadMeeting(id);
    if (!meeting) throw new Error('Görüşme bulunamadı.');
    const url = await buildMeetingGuestJoinUrl(meeting, name);
    if (!url) throw new Error('Toplantı bağlantısı oluşturulamadı.');
    return { url, title: String(meeting.title || meeting.notes || 'Online görüşme') };
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

function academicStudyGuestResourceId(institutionId, room) {
  const inst = String(institutionId || 'platform').trim() || 'platform';
  const r = String(room || '').trim().toLowerCase();
  return `study:${inst}:${r}`;
}

function parseAcademicStudyGuestId(id) {
  const s = String(id || '').trim();
  const m = s.match(/^study:([^:]+):([a-z0-9]+)$/i);
  if (m) {
    return {
      institutionId: m[1] === 'platform' ? '' : m[1],
      room: m[2].toLowerCase()
    };
  }
  return { institutionId: '', room: s.toLowerCase() };
}

function academicStudyMeetingKeyPrefix(institutionId, room) {
  const inst = String(institutionId || 'platform')
    .replace(/-/g, '')
    .slice(0, 12);
  return `etut${inst}${room}`;
}

async function buildAcademicStudyGuestJoinUrl({ institutionId, room, guestName }) {
  if (!VALID_STUDY_ROOMS.has(room)) throw new Error('Geçersiz etüt sınıfı.');
  if (!isBbbConfigured()) throw new Error('BBB sunucusu yapılandırılmamış.');

  const meetingName =
    ACADEMIC_STUDY_ROOM_LABELS[room] ||
    DEFAULT_ACADEMIC_LINKS.studyClasses[room] ||
    'Etüt Sınıfı';
  const durationMinutes = resolveBbbMeetingDurationMinutes(180);
  const prefix = academicStudyMeetingKeyPrefix(institutionId, room);

  const ensured = await ensureBbbMeetingAlive({
    attendeeLink: 'bbb:auto',
    moderatorLink: null,
    meetingName,
    attendeeName: guestName,
    moderatorName: 'Moderatör',
    durationMinutes,
    meetingKeyPrefix: prefix,
    storedMeetingId: null,
    logoutUrl: bbbStudentEtutReportLogoutUrl()
  });

  const meetingId = String(ensured.meetingId || '').trim();
  const attendeePw = String(ensured.attendeePW || '').trim();
  if (meetingId && attendeePw) {
    return buildBbbAttendeeJoinUrl({ meetingId, attendeePassword: attendeePw, fullName: guestName });
  }
  throw new Error('BBB katılım bağlantısı oluşturulamadı.');
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

export async function createAcademicStudyGuestJoinShareLink({ institutionId, room }) {
  const r = String(room || '').trim().toLowerCase();
  if (!VALID_STUDY_ROOMS.has(r)) throw new Error('Geçersiz etüt sınıfı.');
  const resourceId = academicStudyGuestResourceId(institutionId, r);
  const expSec = Math.floor(Date.now() / 1000) + ACADEMIC_STUDY_GUEST_EXPIRE_DAYS * 86400;
  const token = signBbbGuestJoinToken({ kind: 'academic-study', id: resourceId, exp: expSec });
  const title =
    ACADEMIC_STUDY_ROOM_LABELS[r] || DEFAULT_ACADEMIC_LINKS.studyClasses[r] || 'Etüt Sınıfı';
  return finalizeGuestInviteUrl({
    kind: 'academic-study',
    id: resourceId,
    token,
    expiresAtIso: new Date(expSec * 1000).toISOString(),
    title,
    lessonDate: '',
    lessonTime: '',
    className: 'Akademik Merkez — Etüt'
  });
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
      lessonDate: teacherLessonDate(lesson),
      lessonTime: String(lesson.start_time || '').slice(0, 5),
      className: ''
    });
  }
  if (kind === 'meeting') {
    const meeting = await loadMeeting(id);
    if (!meeting) throw new Error('Görüşme bulunamadı.');
    if (String(meeting.status || '') === 'cancelled' || String(meeting.status || '') === 'missed') {
      throw new Error('İptal edilmiş görüşme için link oluşturulamaz.');
    }
    const window = guestJoinWindowForMeeting(meeting);
    const expSec = window.openUntil
      ? Math.floor(window.openUntil / 1000)
      : Math.floor(Date.now() / 1000) + 7 * 86400;
    const token = signBbbGuestJoinToken({ kind: 'meeting', id, exp: expSec });
    const start = meeting.start_time ? new Date(meeting.start_time) : null;
    const lessonDate =
      start && !Number.isNaN(+start)
        ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(start)
        : '';
    const lessonTime =
      start && !Number.isNaN(+start)
        ? new Intl.DateTimeFormat('tr-TR', {
            timeZone: 'Europe/Istanbul',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }).format(start)
        : '';
    return finalizeGuestInviteUrl({
      kind: 'meeting',
      id,
      token,
      expiresAtIso: new Date(expSec * 1000).toISOString(),
      title: String(meeting.title || meeting.notes || 'Online görüşme'),
      lessonDate,
      lessonTime,
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
