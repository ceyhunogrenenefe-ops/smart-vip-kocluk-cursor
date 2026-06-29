import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { enrichMeetingRowsJoinLink, resolveBbbMeetingDurationMinutes } from '../api/_lib/bbb.js';
import { resolveBbbOrManualMeetingLink } from '../api/_lib/resolve-bbb-meeting-link.js';
import { enrichStudentActor } from '../api/_lib/enrich-student-actor.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { renderMessageTemplate } from '../api/_lib/template-engine.js';
import { normalizePhoneToE164 } from '../api/_lib/phone-whatsapp.js';
import { metaWhatsAppConfigured } from '../api/_lib/meta-whatsapp.js';
import { sendAutomatedWhatsApp } from '../api/_lib/whatsapp-outbound.js';
import { syncClassSessionsScheduledToCompleted } from '../api/_lib/class-sessions-sync.js';
import { resolveStudentRowForUser } from '../api/_lib/resolve-student-id.js';
import {
  buildAttendanceReport,
  getVisibleStudentIdSet,
  getInstitutionStudentIds,
  loadInstitutionClassIdSet,
  resolveInstitutionClassIds
} from '../api/_lib/attendance-report-query.js';
import { sendMetaTextMessage } from '../api/_lib/meta-whatsapp.js';
import { isUuid } from '../api/_lib/uuid.js';
import { randomUUID } from 'crypto';

function resolveScopedInstitutionId(queryInstitutionId, actorInstitutionId) {
  const scoped = String(queryInstitutionId || '').trim();
  if (scoped && isUuid(scoped)) return scoped;
  const actorInst = String(actorInstitutionId || '').trim();
  if (actorInst && isUuid(actorInst)) return actorInst;
  return null;
}
import {
  loadClassLessonReminderTemplate,
  validateClassLessonReminderTemplate,
  sendClassLessonReminderForSession,
  markClassSessionReminderSent
} from '../api/_lib/class-lesson-reminder-send.js';
import { shouldSkipClassLessonReminder } from '../api/_lib/class-lesson-reminder-logic.js';
import { normalizedUserRolesFromDb } from '../api/_lib/user-roles-fetch.js';
import {
  insertOneOptionalModerator,
  insertManyOptionalModerator
} from '../api/_lib/supabase-optional-moderator.js';
import {
  ensureClassSessionsForClassInRange,
  backfillClassSessionMeetingLinksInRange,
  backfillClassWeeklySlotMeetingLinks,
  backfillClassSessionInstitutionId
} from '../api/_lib/class-sessions-from-slots.js';
import { handleBbbJoinGet, handleBbbRecordingGet, patchRowMeetingLinks, patchRowRecordingLink } from '../api/_lib/bbb-join-handler.js';
import { createGuestJoinShareLink } from '../api/_lib/bbb-guest-join-core.js';
import { buildBbbAttendeeJoinUrl, parseBbbJoinCredentials, parseBbbMeetingIdFromJoinUrl } from '../api/_lib/bbb.js';
import { pollBbbPresenceForSession, applyAutoAttendanceForClassSession } from '../api/_lib/bbb-attendance.js';
import { isBbbAutoAttendanceEnabled } from '../api/_lib/bbb-auto-attendance-enabled.js';
import { applyEarlyBbbAbsentCheck } from '../api/_lib/bbb-early-absent.js';
import { sendAbsentNoticeForStudent } from '../api/_lib/class-attendance-notify.js';
import {
  completedSessionMinutes,
  sessionLessonUnits40,
  roundUnits,
  GROUP_LESSON_UNIT_MINUTES
} from '../api/_lib/class-lesson-payment-units.js';
import { isSolutionLessonSubject } from '../api/_lib/solution-appointments-core.js';

function parseBody(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b || '{}');
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeRole(role) {
  return String(role || '')
    .toLowerCase()
    .trim();
}

async function teacherDisplayName(teacherId) {
  if (!teacherId) return 'Öğretmen';
  const { data } = await supabaseAdmin.from('users').select('name,email').eq('id', teacherId).maybeSingle();
  return data?.name || data?.email || 'Öğretmen';
}

/** Manuel link yoksa BBB (Online Görüşmeler ile aynı API ayarları). */
async function resolveClassMeetingLinkFromRequest({
  manualLink,
  subject,
  className,
  teacherId,
  durationMinutes,
  meetingKeyPrefix
}) {
  return resolveBbbOrManualMeetingLink({
    manualLink,
    meetingName: `${subject} — ${className || 'Grup dersi'}`,
    attendeeName: 'Öğrenci',
    moderatorName: await teacherDisplayName(teacherId),
    durationMinutes,
    meetingKeyPrefix
  });
}

/** Öğrenci gibi /api/users erişemeyen roller için slot/oturum satırlarına öğretmen adı ekler */
async function attachTeacherNameField(rows, idKey = 'teacher_id') {
  const list = Array.isArray(rows) ? rows : [];
  const ids = [...new Set(list.map((r) => String(r[idKey] || '').trim()).filter(Boolean))];
  if (!ids.length) return list;
  const { data: users, error } = await supabaseAdmin.from('users').select('id,name,email').in('id', ids);
  if (error) return list;
  const map = {};
  for (const u of users || []) {
    map[String(u.id)] = String(u.name || u.email || u.id || '').trim();
  }
  return list.map((r) => {
    const tid = String(r[idKey] || '').trim();
    return { ...r, teacher_name: map[tid] || tid || '' };
  });
}

function isAdminRole(role) {
  const r = normalizeRole(role);
  return r === 'admin' || r === 'super_admin' || r === 'coach';
}

/** Sınıf listesinde kurum geneli: yalnızca yöneticiler (koç / öğretmen sınıfları sınırlı) */
function seesAllInstitutionClasses(role) {
  const r = normalizeRole(role);
  return r === 'admin' || r === 'super_admin';
}

function isTeacherRole(role) {
  return normalizeRole(role) === 'teacher';
}

function hhmmss(v, fallback = '09:00:00') {
  const s = String(v || '').trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return fallback;
}

function addMinutesToTime(start, minutes) {
  const [h, m] = String(start || '09:00:00')
    .slice(0, 8)
    .split(':')
    .map((x) => Number(x || 0));
  const total = h * 60 + m + Number(minutes || 0);
  const hh = Math.floor(((total % (24 * 60)) + 24 * 60) % (24 * 60) / 60);
  const mm = ((total % 60) + 60) % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
}

function timeOverlap(aStart, aEnd, bStart, bEnd) {
  const A1 = String(aStart || '').slice(0, 8);
  const A2 = String(aEnd || '').slice(0, 8);
  const B1 = String(bStart || '').slice(0, 8);
  const B2 = String(bEnd || '').slice(0, 8);
  return A1 < B2 && A2 > B1;
}

/** yyyy-mm-dd ile gün ekler (UTC gün kökü – saat kayması yok) */
function addDaysIsoDate(dateStr, days) {
  const s = String(dateStr || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map((x) => Number(x));
  const t = Date.UTC(y, m - 1, d) + Number(days) * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Pazartesi=1 … Pazar=7 (ISO uyumlu, UTC tarih) */
function dowFromIsoDate(dateStr) {
  const s = String(dateStr || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map((x) => Number(x));
  const jd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return jd === 0 ? 7 : jd;
}

async function teacherTimeConflictOnDate({ teacherId, lessonDate, start, end, excludeSessionIds = [], subject = '' }) {
  if (isSolutionLessonSubject(subject)) return { ok: true };
  const ex = new Set(excludeSessionIds.map(String));
  const { data: sess, error: sErr } = await supabaseAdmin
    .from('class_sessions')
    .select('id,start_time,end_time,status')
    .eq('teacher_id', teacherId)
    .eq('lesson_date', lessonDate)
    .neq('status', 'cancelled');
  if (sErr) throw sErr;
  for (const r of sess || []) {
    if (ex.has(r.id)) continue;
    if (timeOverlap(start, end, r.start_time, r.end_time)) {
      return { ok: false, reason: `Bu öğretmenin ${lessonDate} tarihinde çakışan bir oturumu var.` };
    }
  }
  const dow = dowFromIsoDate(lessonDate);
  if (dow == null) return { ok: true };
  const { data: slots, error: slErr } = await supabaseAdmin
    .from('class_weekly_slots')
    .select('start_time,end_time')
    .eq('teacher_id', teacherId)
    .eq('day_of_week', dow);
  if (slErr) throw slErr;
  if ((slots || []).some((x) => timeOverlap(start, end, x.start_time, x.end_time))) {
    return { ok: false, reason: `Bu öğretmenin aynı gün/saatte haftalık şablon dersi var (${lessonDate}).` };
  }
  return { ok: true };
}

function isPaymentSummaryAdmin(role) {
  const r = normalizeRole(role);
  return r === 'admin' || r === 'super_admin';
}

function buildCompletedSessionsQuery({ from, to, teacherId, classId, role, institutionId, scopedInstitutionId }) {
  let q = supabaseAdmin
    .from('class_sessions')
    .select('id,teacher_id,class_id,start_time,end_time,status,lesson_date,subject')
    .eq('status', 'completed');
  if (from) q = q.gte('lesson_date', from);
  if (to) q = q.lte('lesson_date', to);
  if (teacherId) q = q.eq('teacher_id', teacherId);
  if (classId) q = q.eq('class_id', classId);
  if (role === 'admin' && institutionId) q = q.eq('institution_id', institutionId);
  if (role === 'super_admin' && institutionId && scopedInstitutionId) {
    q = q.eq('institution_id', scopedInstitutionId);
  }
  return q;
}

async function loadTeacherGroupLessonRates(teacherIds) {
  const uniq = [...new Set((teacherIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
  if (!uniq.length) return new Map();
  const { data, error } = await supabaseAdmin
    .from('teacher_group_lesson_rates')
    .select('teacher_id,unit_price_tl')
    .in('teacher_id', uniq);
  if (error) {
    if (String(error.message || '').toLowerCase().includes('teacher_group_lesson_rates')) return new Map();
    throw error;
  }
  const map = new Map();
  for (const row of data || []) {
    const price = Number(row.unit_price_tl);
    if (Number.isFinite(price) && price > 0) map.set(String(row.teacher_id), price);
  }
  return map;
}

async function loadTeacherGroupLessonPayouts({ from, to, institutionId }) {
  if (!from || !to) return new Map();
  let q = supabaseAdmin
    .from('teacher_group_lesson_payouts')
    .select('teacher_id,period_from,period_to,amount_tl,paid_at,paid_by')
    .eq('period_from', from)
    .eq('period_to', to);
  if (institutionId) q = q.eq('institution_id', institutionId);
  const { data, error } = await q;
  if (error) {
    if (String(error.message || '').toLowerCase().includes('teacher_group_lesson_payouts')) return new Map();
    throw error;
  }
  const map = new Map();
  for (const row of data || []) {
    map.set(String(row.teacher_id), row);
  }
  return map;
}

/** Eski `classes` şemasında eksik kolon (ör. class_level) nedeniyle oluşan PostgREST hataları */
function isMissingClassesOptionalColumnError(error) {
  const m = String(error?.message || '').toLowerCase();
  return (
    m.includes('schema cache') ||
    m.includes('class_level') ||
    (m.includes('column') && m.includes('does not exist')) ||
    (m.includes('could not find') && m.includes('column'))
  );
}

function mapClassesInsertError(error) {
  const code = error?.code ? String(error.code) : '';
  const msg = String(error?.message || '');
  if (
    code === '23505' ||
    /duplicate key|unique constraint|uq_classes_institution_name/i.test(msg)
  ) {
    return {
      status: 409,
      body: {
        error: 'Bu kurumda aynı isimde bir sınıf zaten var. Farklı bir ad kullanın.',
        code: 'duplicate_class_name'
      }
    };
  }
  return { status: 500, body: { error: msg || 'Sınıf oluşturulamadı.', code: code || undefined } };
}

async function getManagedClassIds(actor) {
  const role = normalizeRole(actor.role);
  const roleTags = await normalizedUserRolesFromDb(actor.sub);

  if (
    role === 'admin' ||
    role === 'super_admin' ||
    roleTags.includes('admin') ||
    roleTags.includes('super_admin')
  ) {
    return null;
  }

  const classIds = new Set();

  /** Öğretmen: class_teachers atamaları (koç+öğretmen birlikte olsa da geçerli) */
  if (roleTags.includes('teacher') || isTeacherRole(actor.role)) {
    const tid = String(actor.sub || '').trim();
    const { data, error } = await supabaseAdmin
      .from('class_teachers')
      .select('class_id')
      .eq('teacher_id', tid);
    if (error) throw error;
    for (const row of data || []) {
      if (row.class_id) classIds.add(row.class_id);
    }
    /** Slot veya oturumda öğretmen atanmış sınıflar (class_teachers eksik olsa bile) */
    const [{ data: slotRows }, { data: sessionRows }] = await Promise.all([
      supabaseAdmin.from('class_weekly_slots').select('class_id').eq('teacher_id', tid),
      supabaseAdmin.from('class_sessions').select('class_id').eq('teacher_id', tid)
    ]);
    for (const row of slotRows || []) {
      if (row.class_id) classIds.add(row.class_id);
    }
    for (const row of sessionRows || []) {
      if (row.class_id) classIds.add(row.class_id);
    }
  }

  /** Koç: yalnızca kendi öğrencilerinin kayıtlı olduğu sınıflar */
  if (roleTags.includes('coach') || role === 'coach') {
    const cid = actor.coach_id ? String(actor.coach_id).trim() : '';
    if (cid) {
      const { data: studs, error: se } = await supabaseAdmin
        .from('students')
        .select('id')
        .eq('coach_id', cid);
      if (se) throw se;
      const studentIds = [...new Set((studs || []).map((s) => String(s.id).trim()).filter(Boolean))];
      if (studentIds.length) {
        const { data: cs, error: ce } = await supabaseAdmin
          .from('class_students')
          .select('class_id')
          .in('student_id', studentIds);
        if (ce) throw ce;
        for (const row of cs || []) {
          if (row.class_id) classIds.add(row.class_id);
        }
      }
    }
  }

  if (roleTags.includes('teacher') || roleTags.includes('coach')) {
    return [...classIds];
  }

  if (role === 'student' || roleTags.includes('student')) {
    let sid = actor.student_id ? String(actor.student_id).trim() : '';
    if (!sid && actor.sub) {
      const { data: userRow } = await supabaseAdmin
        .from('users')
        .select('email, institution_id')
        .eq('id', actor.sub)
        .maybeSingle();
      const resolved = await resolveStudentRowForUser({
        userId: actor.sub,
        email: userRow?.email,
        institutionId: userRow?.institution_id ?? actor.institution_id ?? null
      });
      if (resolved?.id) sid = String(resolved.id).trim();
    }
    if (!sid) return [];
    const { data, error } = await supabaseAdmin
      .from('class_students')
      .select('class_id')
      .eq('student_id', sid);
    if (error) throw error;
    return (data || []).map((r) => r.class_id).filter(Boolean);
  }
  return [];
}

async function getClassDetails(classId) {
  const [{ data: cls }, { data: teachers }, { data: students }] = await Promise.all([
    supabaseAdmin.from('classes').select('*').eq('id', classId).maybeSingle(),
    supabaseAdmin.from('class_teachers').select('teacher_id').eq('class_id', classId),
    supabaseAdmin.from('class_students').select('student_id').eq('class_id', classId)
  ]);
  return {
    class: cls || null,
    teacher_ids: (teachers || []).map((t) => t.teacher_id),
    student_ids: (students || []).map((s) => s.student_id)
  };
}

async function resolveActorStudentId(actor) {
  let sid = actor.student_id ? String(actor.student_id).trim() : '';
  if (!sid && actor.sub) {
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('email, institution_id')
      .eq('id', actor.sub)
      .maybeSingle();
    const resolved = await resolveStudentRowForUser({
      userId: actor.sub,
      email: userRow?.email,
      institutionId: userRow?.institution_id ?? actor.institution_id ?? null
    });
    if (resolved?.id) sid = String(resolved.id).trim();
  }
  return sid;
}

async function actorEnrolledInClass(actor, details) {
  const sid = await resolveActorStudentId(actor);
  return Boolean(sid && details.student_ids.includes(sid));
}

async function canManageOrViewClassSessions(actor, role, details) {
  if (isAdminRole(role)) return true;
  if (details.teacher_ids.includes(String(actor.sub || ''))) return true;
  if (normalizeRole(role) === 'student') return await actorEnrolledInClass(actor, details);
  return false;
}

function normalizeSessionTimeSig(t) {
  return String(t || '').slice(0, 8);
}

function sessionBatchSignature(session) {
  return [
    String(session.class_id || ''),
    String(session.subject || '').trim(),
    String(session.teacher_id || ''),
    normalizeSessionTimeSig(session.start_time),
    normalizeSessionTimeSig(session.end_time)
  ].join('|');
}

/** Toplu planlanmış planlı oturum eşleri (schedule_batch_id veya aynı şablon imzası). */
async function listScheduledSessionBatchPeers(session) {
  const selfId = String(session.id || '').trim();
  if (String(session.status || '') !== 'scheduled') return selfId ? [selfId] : [];

  const batchId = session.schedule_batch_id ? String(session.schedule_batch_id).trim() : '';
  if (batchId) {
    const { data, error } = await supabaseAdmin
      .from('class_sessions')
      .select('id')
      .eq('schedule_batch_id', batchId)
      .eq('status', 'scheduled');
    if (error) {
      if (/schedule_batch_id|schema cache|PGRST204/i.test(String(error.message || ''))) {
        /* sütun yoksa imza yöntemine düş */
      } else {
        throw error;
      }
    } else {
      const ids = (data || []).map((r) => String(r.id)).filter(Boolean);
      if (ids.length) return ids;
    }
  }

  const sig = sessionBatchSignature(session);
  const { data, error } = await supabaseAdmin
    .from('class_sessions')
    .select('id,class_id,subject,teacher_id,start_time,end_time,status')
    .eq('class_id', session.class_id)
    .eq('status', 'scheduled');
  if (error) throw error;
  const ids = (data || [])
    .filter((r) => sessionBatchSignature(r) === sig)
    .map((r) => String(r.id))
    .filter(Boolean);
  return ids.length > 1 ? ids : selfId ? [selfId] : [];
}

function normalizeAttendanceStatus(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'present' || v === 'absent' || v === 'late') return v;
  return 'absent';
}

function buildAttendanceNotifyText(preset, custom, vars) {
  const c = String(custom || '').trim();
  if (c) return renderMessageTemplate(c, vars || {});
  const student = vars.student_name || 'Öğrenci';
  const subj = vars.subject || 'Ders';
  const time = vars.lesson_time || '';
  const teacher = vars.teacher_name || 'Öğretmen';
  const date = vars.lesson_date || '';
  if (preset === 'next_time') {
    return `${student} için ${date} tarihli ${subj} dersine (${time}) zamanında katılım rica olunur. Öğretmen: ${teacher}`;
  }
  if (preset === 'missing_record') {
    return `${student} — ${date} ${subj} (${time}) için eksik ders kaydı / devamsızlık oluşmuştur. Öğretmen: ${teacher}`;
  }
  return `${student} bugün (${date}) ${subj} dersine (${time}) katılım sağlamamıştır. Öğretmen: ${teacher}`;
}

async function canAccessClassLiveRow(actor, role, row) {
  const details = await getClassDetails(String(row.class_id || ''));
  if (role === 'student') {
    let sid = actor.student_id ? String(actor.student_id).trim() : '';
    if (!sid && actor.sub) {
      const { data: userRow } = await supabaseAdmin
        .from('users')
        .select('email, institution_id')
        .eq('id', actor.sub)
        .maybeSingle();
      const resolved = await resolveStudentRowForUser({
        userId: actor.sub,
        email: userRow?.email,
        institutionId: userRow?.institution_id ?? actor.institution_id ?? null
      });
      if (resolved?.id) sid = String(resolved.id).trim();
    }
    return sid && details.student_ids.includes(sid);
  }
  if (isAdminRole(role)) return true;
  return (
    String(row.teacher_id || '') === String(actor.sub || '') ||
    details.teacher_ids.includes(String(actor.sub || ''))
  );
}

function bbbFieldsFromResolved(resolved) {
  if (!resolved?.bbbMeetingId && !resolved?.bbbAttendeePw) return {};
  return {
    ...(resolved.bbbMeetingId ? { bbb_meeting_id: resolved.bbbMeetingId } : {}),
    ...(resolved.bbbAttendeePw ? { bbb_attendee_pw: resolved.bbbAttendeePw } : {})
  };
}

async function resolveStudentBbbJoinUrl(actor, row, ensured) {
  let sid = actor.student_id ? String(actor.student_id).trim() : '';
  if (!sid && actor.sub) {
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('email, institution_id')
      .eq('id', actor.sub)
      .maybeSingle();
    const resolved = await resolveStudentRowForUser({
      userId: actor.sub,
      email: userRow?.email,
      institutionId: userRow?.institution_id ?? actor.institution_id ?? null
    });
    if (resolved?.id) sid = String(resolved.id).trim();
  }
  if (!sid) return null;
  const { data: student } = await supabaseAdmin.from('students').select('name').eq('id', sid).maybeSingle();
  const fullName = String(student?.name || '').trim();
  if (!fullName) return null;

  const attendeeLink = String(ensured.attendeeLink || row.meeting_link || '').trim();
  const meetingId =
    String(row.bbb_meeting_id || ensured.meetingId || '').trim() ||
    parseBbbMeetingIdFromJoinUrl(attendeeLink) ||
    '';
  const attendeePw =
    String(row.bbb_attendee_pw || ensured.attendeePW || '').trim() ||
    parseBbbJoinCredentials(attendeeLink)?.attendeePassword ||
    '';
  if (!meetingId || !attendeePw) return null;
  return buildBbbAttendeeJoinUrl({ meetingId, attendeePassword: attendeePw, fullName });
}

async function handleClassLiveBbbJoin(req, res, actor, role) {
  const slotMode = String(req.query?.kind || 'session').trim() === 'slot';
  const table = slotMode ? 'class_weekly_slots' : 'class_sessions';

  return handleBbbJoinGet(req, res, {
    loadRow: async (id) => {
      const { data, error } = await supabaseAdmin.from(table).select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data;
    },
    canAccess: (act, row) => canAccessClassLiveRow(act, role, row),
    getLinks: (row) => ({
      attendeeLink: String(row.meeting_link || ''),
      moderatorLink: row.meeting_link_moderator ? String(row.meeting_link_moderator) : null
    }),
    buildContext: async (row) => {
      const details = await getClassDetails(String(row.class_id || ''));
      const subject = String(row.subject || 'Ders');
      const className = details.class?.name || '';
      let durationMinutes = resolveBbbMeetingDurationMinutes(0);
      if (row.start_time && row.end_time) {
        const [sh, sm] = String(row.start_time).split(':').map(Number);
        const [eh, em] = String(row.end_time).split(':').map(Number);
        const mins = (eh * 60 + em) - (sh * 60 + sm);
        if (mins > 0) durationMinutes = resolveBbbMeetingDurationMinutes(mins);
      }
      return {
        meetingName: `${subject} — ${className || 'Grup dersi'}`,
        attendeeName: 'Öğrenci',
        moderatorName: await teacherDisplayName(String(row.teacher_id || '')),
        durationMinutes,
        meetingKeyPrefix: `cljoin${String(row.id || '').replace(/-/g, '')}`
      };
    },
    patchLinks: (id, links) =>
      patchRowMeetingLinks(table, id, {
        meeting_link: links.meeting_link,
        meeting_link_moderator: links.meeting_link_moderator,
        bbb_meeting_id: links.bbb_meeting_id,
        bbb_attendee_pw: links.bbb_attendee_pw
      }),
    resolveStudentJoinUrl: slotMode ? undefined : (act, row, ensured) => resolveStudentBbbJoinUrl(act, row, ensured)
  });
}

async function handleClassGuestJoinLink(req, res, actor, role) {
  if (role === 'student') return res.status(403).json({ error: 'Yetkiniz yok' });
  const id = String(req.query?.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id gerekli' });
  const { data: row, error } = await supabaseAdmin.from('class_sessions').select('*').eq('id', id).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!row) return res.status(404).json({ error: 'Kayıt bulunamadı' });
  if (!(await canAccessClassLiveRow(actor, role, row))) return res.status(403).json({ error: 'Yetkiniz yok' });
  try {
    const link = await createGuestJoinShareLink({ kind: 'class', id });
    return res.status(200).json({ ok: true, ...link });
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
}

async function handleClassLiveBbbRecording(req, res, actor, role) {
  const slotMode = String(req.query?.kind || 'session').trim() === 'slot';
  const table = slotMode ? 'class_weekly_slots' : 'class_sessions';

  return handleBbbRecordingGet(req, res, {
    loadRow: async (id) => {
      const { data, error } = await supabaseAdmin.from(table).select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data;
    },
    canAccess: (act, row) => canAccessClassLiveRow(act, role, row),
    patchRecordingLink: slotMode ? undefined : (id, playbackUrl) => patchRowRecordingLink(table, id, playbackUrl),
    getMeetingKeyPrefix: (row) =>
      slotMode
        ? `clslot${String(row.id || '').replace(/-/g, '')}`
        : `cljoin${String(row.id || '').replace(/-/g, '')}`
  });
}

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }
  try {
    actor = await enrichStudentActor(actor);
  } catch {
    /* JWT geçerli; student_id zenginleştirmesi başarısız olsa bile devam */
  }
  const role = normalizeRole(actor.role);
  const institutionId = actor.institution_id || null;

  if (req.method === 'GET') {
    const getOp = String(req.query?.op || '').trim();
    if (getOp === 'bbb-join') {
      return handleClassLiveBbbJoin(req, res, actor, role);
    }
    if (getOp === 'bbb-recording') {
      return handleClassLiveBbbRecording(req, res, actor, role);
    }
    if (getOp === 'guest-join-link') {
      return handleClassGuestJoinLink(req, res, actor, role);
    }
    await syncClassSessionsScheduledToCompleted();
    const scope = String(req.query.scope || 'classes');
    if (scope === 'classes') {
      const allowedClassIds = await getManagedClassIds(actor);
      const scopedClassInst = resolveScopedInstitutionId(req.query.institution_id, institutionId);
      let q = supabaseAdmin.from('classes').select('*').order('created_at', { ascending: false });
      if (!seesAllInstitutionClasses(role)) {
        if (!allowedClassIds || !allowedClassIds.length) return res.status(200).json({ data: [] });
        q = q.in('id', allowedClassIds);
      } else if (scopedClassInst && seesAllInstitutionClasses(role)) {
        const studentIds = await getInstitutionStudentIds(supabaseAdmin, scopedClassInst);
        const classIdSet = await loadInstitutionClassIdSet(supabaseAdmin, scopedClassInst, studentIds);
        const classIds = [...classIdSet];
        if (classIds.length) q = q.in('id', classIds);
        else q = q.eq('institution_id', scopedClassInst);
      } else if (institutionId) {
        q = q.eq('institution_id', institutionId);
      }
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });

      const classIds = (data || []).map((c) => c.id);
      const [teachersRes, studentsRes] = await Promise.all([
        classIds.length
          ? supabaseAdmin.from('class_teachers').select('class_id, teacher_id').in('class_id', classIds)
          : Promise.resolve({ data: [] }),
        classIds.length
          ? supabaseAdmin.from('class_students').select('class_id, student_id').in('class_id', classIds)
          : Promise.resolve({ data: [] })
      ]);
      const teacherMap = new Map();
      const studentMap = new Map();
      for (const r of teachersRes.data || []) {
        const arr = teacherMap.get(r.class_id) || [];
        arr.push(r.teacher_id);
        teacherMap.set(r.class_id, arr);
      }
      for (const r of studentsRes.data || []) {
        const arr = studentMap.get(r.class_id) || [];
        arr.push(r.student_id);
        studentMap.set(r.class_id, arr);
      }

      return res.status(200).json({
        data: (data || []).map((c) => ({
          ...c,
          teacher_ids: teacherMap.get(c.id) || [],
          student_ids: studentMap.get(c.id) || []
        }))
      });
    }

    if (scope === 'sessions') {
      const classId = String(req.query.class_id || '').trim();
      const from = String(req.query.from || '').trim();
      const to = String(req.query.to || '').trim();
      const allowedClassIds = await getManagedClassIds(actor);

      if (
        classId &&
        /^\d{4}-\d{2}-\d{2}$/.test(from) &&
        /^\d{4}-\d{2}-\d{2}$/.test(to)
      ) {
        const details = await getClassDetails(classId);
        if (details.class && (await canManageOrViewClassSessions(actor, role, details))) {
          try {
            const instId = String(details.class.institution_id || institutionId || '').trim() || null;
            if (instId) await backfillClassSessionInstitutionId(classId, instId);
            await backfillClassWeeklySlotMeetingLinks(classId);
            await ensureClassSessionsForClassInRange(classId, from, to);
          } catch (e) {
            console.warn('[class-live-lessons] ensure sessions on read', e instanceof Error ? e.message : e);
          }
        }
      }

      let q = supabaseAdmin
        .from('class_sessions')
        .select('*')
        .order('lesson_date', { ascending: true })
        .order('start_time', { ascending: true });
      if (classId) q = q.eq('class_id', classId);
      if (from) q = q.gte('lesson_date', from);
      if (to) q = q.lte('lesson_date', to);

      if (!seesAllInstitutionClasses(role)) {
        if (!allowedClassIds || !allowedClassIds.length) return res.status(200).json({ data: [] });
        q = q.in('class_id', allowedClassIds);
      } else if (institutionId && !classId) {
        const studentIds = await getInstitutionStudentIds(supabaseAdmin, institutionId);
        const classIds = await resolveInstitutionClassIds(supabaseAdmin, institutionId, studentIds);
        if (classIds.length) q = q.in('class_id', classIds);
        else q = q.eq('institution_id', institutionId);
      }
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      const enriched = enrichMeetingRowsJoinLink(await attachTeacherNameField(data || []), role);
      return res.status(200).json({ data: enriched });
    }

    if (scope === 'teacher-rates') {
      if (!isPaymentSummaryAdmin(role)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const { data, error } = await supabaseAdmin
        .from('teacher_group_lesson_rates')
        .select('teacher_id,unit_price_tl,updated_at')
        .order('updated_at', { ascending: false });
      if (error) {
        if (String(error.message || '').toLowerCase().includes('teacher_group_lesson_rates')) {
          return res.status(200).json({ data: [], table_missing: true });
        }
        return res.status(500).json({ error: error.message });
      }
      return res.status(200).json({ data: data || [] });
    }

    if (scope === 'teacher-payouts') {
      if (!isPaymentSummaryAdmin(role)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const from = String(req.query.from || '').trim().slice(0, 10);
      const to = String(req.query.to || '').trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return res.status(400).json({ error: 'from_to_invalid', hint: 'YYYY-MM-DD' });
      }
      try {
        const payoutMap = await loadTeacherGroupLessonPayouts({ from, to, institutionId });
        const data = [...payoutMap.values()].map((row) => ({
          teacher_id: row.teacher_id,
          period_from: row.period_from,
          period_to: row.period_to,
          amount_tl: row.amount_tl != null ? Number(row.amount_tl) : null,
          paid_at: row.paid_at,
          paid_by: row.paid_by || null,
          paid: true
        }));
        return res.status(200).json({ data });
      } catch (e) {
        return res.status(500).json({ error: e instanceof Error ? e.message : 'payout_load_failed' });
      }
    }

    if (scope === 'summary') {
      if (!isPaymentSummaryAdmin(role)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const from = String(req.query.from || '').trim();
      const to = String(req.query.to || '').trim();
      const teacherId = String(req.query.teacher_id || '').trim();
      const classId = String(req.query.class_id || '').trim();
      const includeSessions = String(req.query.include_sessions || '').trim() === '1';
      const scopedInstitutionId = String(req.query.institution_id || '').trim();
      if (role === 'super_admin' && institutionId && scopedInstitutionId && !isUuid(scopedInstitutionId)) {
        return res.status(400).json({
          error: 'invalid_institution_uuid',
          hint: 'Kurum kimliği UUID olmalı (class_sessions). Üst çubuktan geçerli bir kurum seçin veya yeni kurum oluşturun.'
        });
      }

      const { data, error } = await buildCompletedSessionsQuery({
        from,
        to,
        teacherId,
        classId,
        role,
        institutionId,
        scopedInstitutionId
      });
      if (error) return res.status(500).json({ error: error.message });

      const agg = new Map();
      for (const row of data || []) {
        const key = `${row.teacher_id}|${row.class_id}`;
        const minutes = completedSessionMinutes(row);
        const units = sessionLessonUnits40(row);
        const cur = agg.get(key) || {
          teacher_id: row.teacher_id,
          class_id: row.class_id,
          completed_lesson_count: 0,
          total_minutes: 0,
          lesson_units_40: 0
        };
        cur.completed_lesson_count += 1;
        cur.total_minutes += minutes;
        cur.lesson_units_40 = roundUnits(cur.lesson_units_40 + units);
        agg.set(key, cur);
      }

      const vals = [...agg.values()];
      const teacherIds = [...new Set(vals.map((x) => x.teacher_id).filter(Boolean))];
      const classIds = [...new Set(vals.map((x) => x.class_id).filter(Boolean))];

      const teacherNames = {};
      if (teacherIds.length) {
        const { data: users } = await supabaseAdmin.from('users').select('id,name,email').in('id', teacherIds);
        for (const u of users || []) {
          teacherNames[u.id] = u.name || u.email || u.id;
        }
      }
      const classNames = {};
      if (classIds.length) {
        const { data: classes } = await supabaseAdmin.from('classes').select('id,name').in('id', classIds);
        for (const c of classes || []) {
          classNames[c.id] = c.name || c.id;
        }
      }

      const rateMap = await loadTeacherGroupLessonRates(teacherIds);
      const defaultUnitPrice = 500;

      const rows = vals
        .map((r) => {
          const unitPrice = rateMap.get(String(r.teacher_id)) ?? defaultUnitPrice;
          const lessonUnits = roundUnits(r.lesson_units_40);
          return {
            teacher_id: r.teacher_id,
            class_id: r.class_id,
            teacher_name: teacherNames[r.teacher_id] || r.teacher_id,
            class_name: classNames[r.class_id] || r.class_id,
            completed_lesson_count: r.completed_lesson_count,
            total_minutes: r.total_minutes,
            total_hours: roundUnits(r.total_minutes / 60),
            lesson_units_40: lessonUnits,
            unit_price_tl: unitPrice,
            total_amount_tl: roundUnits(lessonUnits * unitPrice)
          };
        })
        .sort((a, b) => {
          const x = a.teacher_name.localeCompare(b.teacher_name, 'tr');
          if (x !== 0) return x;
          return a.class_name.localeCompare(b.class_name, 'tr');
        });

      const teacherTotalsMap = new Map();
      for (const row of rows) {
        const tid = String(row.teacher_id || '');
        const cur = teacherTotalsMap.get(tid) || {
          teacher_id: tid,
          teacher_name: row.teacher_name,
          completed_lesson_count: 0,
          total_minutes: 0,
          lesson_units_40: 0,
          unit_price_tl: row.unit_price_tl,
          total_amount_tl: 0
        };
        cur.completed_lesson_count += row.completed_lesson_count;
        cur.total_minutes += row.total_minutes;
        cur.lesson_units_40 = roundUnits(cur.lesson_units_40 + row.lesson_units_40);
        cur.total_amount_tl = roundUnits(cur.total_amount_tl + row.total_amount_tl);
        if (rateMap.has(tid)) cur.unit_price_tl = rateMap.get(tid);
        teacherTotalsMap.set(tid, cur);
      }

      const teacher_totals = [...teacherTotalsMap.values()].sort((a, b) =>
        a.teacher_name.localeCompare(b.teacher_name, 'tr')
      );

      let sessions = undefined;
      if (includeSessions) {
        sessions = (data || [])
          .map((row) => {
            const minutes = completedSessionMinutes(row);
            const units = sessionLessonUnits40(row);
            const unitPrice = rateMap.get(String(row.teacher_id)) ?? defaultUnitPrice;
            return {
              id: row.id,
              lesson_date: row.lesson_date,
              start_time: row.start_time,
              end_time: row.end_time,
              subject: row.subject,
              teacher_id: row.teacher_id,
              class_id: row.class_id,
              teacher_name: teacherNames[row.teacher_id] || row.teacher_id,
              class_name: classNames[row.class_id] || row.class_id,
              total_minutes: minutes,
              lesson_units_40: units,
              unit_price_tl: unitPrice,
              line_amount_tl: roundUnits(units * unitPrice)
            };
          })
          .sort((a, b) => {
            const d = String(a.lesson_date).localeCompare(String(b.lesson_date));
            if (d !== 0) return d;
            return String(a.start_time).localeCompare(String(b.start_time));
          });
      }

      return res.status(200).json({
        data: rows,
        teacher_totals,
        unit_period_minutes: GROUP_LESSON_UNIT_MINUTES,
        default_unit_price_tl: defaultUnitPrice,
        sessions
      });
    }

    if (scope === 'slots') {
      const classId = String(req.query.class_id || '').trim();
      const scopedClassInst = resolveScopedInstitutionId(req.query.institution_id, institutionId);
      const allowedClassIds = await getManagedClassIds(actor);
      let q = supabaseAdmin
        .from('class_weekly_slots')
        .select('*')
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });
      if (classId) {
        q = q.eq('class_id', classId);
      } else if (!seesAllInstitutionClasses(role)) {
        if (!allowedClassIds || !allowedClassIds.length) return res.status(200).json({ data: [] });
        q = q.in('class_id', allowedClassIds);
      } else if (scopedClassInst && (role === 'super_admin' || role === 'admin')) {
        const studentIds = await getInstitutionStudentIds(supabaseAdmin, scopedClassInst);
        const classIds = await resolveInstitutionClassIds(supabaseAdmin, scopedClassInst, studentIds);
        if (classIds.length) q = q.in('class_id', classIds);
        else return res.status(200).json({ data: [] });
      } else if (institutionId) {
        const studentIds = await getInstitutionStudentIds(supabaseAdmin, institutionId);
        const classIds = await resolveInstitutionClassIds(supabaseAdmin, institutionId, studentIds);
        if (classIds.length) q = q.in('class_id', classIds);
        else q = q.eq('institution_id', institutionId);
      }
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      const enriched = enrichMeetingRowsJoinLink(await attachTeacherNameField(data || []), role);
      return res.status(200).json({ data: enriched });
    }

    if (scope === 'attendance') {
      const sessionId = String(req.query.session_id || '').trim();
      if (!sessionId) return res.status(400).json({ error: 'session_id_required' });
      const { data: session } = await supabaseAdmin
        .from('class_sessions')
        .select('id,class_id')
        .eq('id', sessionId)
        .maybeSingle();
      if (!session) return res.status(404).json({ error: 'session_not_found' });
      const allowedClassIds = await getManagedClassIds(actor);
      if (!seesAllInstitutionClasses(role)) {
        if (!allowedClassIds || !allowedClassIds.includes(session.class_id)) {
          return res.status(403).json({ error: 'forbidden' });
        }
      }
      const { data, error } = await supabaseAdmin
        .from('class_session_attendance')
        .select('*')
        .eq('session_id', sessionId);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ data: data || [] });
    }

    if (scope === 'attendance-prefs') {
      if (role !== 'admin' && role !== 'super_admin') {
        return res.status(403).json({ error: 'forbidden' });
      }
      let iid = institutionId ? String(institutionId).trim() : '';
      if (role === 'super_admin') {
        const scoped = String(req.query.institution_id || '').trim();
        if (scoped) iid = scoped;
      }
      if (!iid) {
        return res.status(200).json({ data: { auto_whatsapp_absent: true, institution_id: null } });
      }
      if (!isUuid(iid)) {
        return res.status(400).json({
          error: 'invalid_institution_uuid',
          hint: 'Kurum kimliği UUID olmalı. Tarayıcıda eski kurum seçimini temizleyin veya Ayarlar’dan geçerli kurumu seçin.'
        });
      }
      const { data, error } = await supabaseAdmin
        .from('attendance_institution_prefs')
        .select('auto_whatsapp_absent')
        .eq('institution_id', iid)
        .maybeSingle();
      if (error && !String(error.message || '').toLowerCase().includes('relation') && !String(error.message || '').includes('does not exist')) {
        return res.status(500).json({ error: error.message });
      }
      return res.status(200).json({
        data: {
          institution_id: iid,
          auto_whatsapp_absent: data ? data.auto_whatsapp_absent !== false : true
        }
      });
    }

    if (scope === 'attendance-report') {
      const rep = await buildAttendanceReport({
        supabaseAdmin,
        getManagedClassIds,
        seesAllInstitutionClasses,
        normalizeRole,
        institutionId,
        actor,
        role,
        query: req.query
      });
      if (rep.error) return res.status(rep.error.status).json(rep.error.body);
      return res.status(200).json(rep);
    }
  }

  if (req.method === 'POST') {
    const op = String(req.query.op || '').trim();
    const body = parseBody(req);

    if (op === 'ensure-sessions-range') {
      const classId = String(body.class_id || '').trim();
      const from = String(body.date_from || body.from || '').trim().slice(0, 10);
      const to = String(body.date_to || body.to || '').trim().slice(0, 10);
      if (!classId) return res.status(400).json({ error: 'class_id_required' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return res.status(400).json({ error: 'date_range_invalid' });
      }
      const details = await getClassDetails(classId);
      if (!details.class) return res.status(404).json({ error: 'class_not_found' });
      if (!(await canManageOrViewClassSessions(actor, role, details))) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const instId =
        String(details.class.institution_id || institutionId || body.institution_id || '').trim() || null;
      if (instId) await backfillClassSessionInstitutionId(classId, instId);
      await backfillClassWeeklySlotMeetingLinks(classId);
      const sessionResult = await ensureClassSessionsForClassInRange(classId, from, to);
      const linkBackfill = await backfillClassSessionMeetingLinksInRange(classId, from, to);
      return res.status(200).json({
        ok: true,
        ...sessionResult,
        sessions_link_backfilled: linkBackfill.updated || 0
      });
    }

    if (op === 'set-attendance-prefs') {
      if (role !== 'admin' && role !== 'super_admin') {
        return res.status(403).json({ error: 'forbidden' });
      }
      let iid = institutionId ? String(institutionId).trim() : '';
      if (role === 'super_admin') {
        iid = String(body.institution_id || req.query.institution_id || '').trim();
      }
      if (!iid) return res.status(400).json({ error: 'institution_id_required' });
      if (!isUuid(iid)) {
        return res.status(400).json({
          error: 'invalid_institution_uuid',
          hint: 'Kurum kimliği UUID olmalı.'
        });
      }
      const auto = Object.prototype.hasOwnProperty.call(body, 'auto_whatsapp_absent')
        ? Boolean(body.auto_whatsapp_absent)
        : true;
      const { error: pe } = await supabaseAdmin.from('attendance_institution_prefs').upsert(
        {
          institution_id: iid,
          auto_whatsapp_absent: Boolean(auto),
          updated_at: new Date().toISOString()
        },
        { onConflict: 'institution_id' }
      );
      if (pe && !String(pe.message || '').toLowerCase().includes('relation') && !String(pe.message || '').includes('does not exist')) {
        return res.status(500).json({ error: pe.message });
      }
      return res.status(200).json({ ok: true, data: { institution_id: iid, auto_whatsapp_absent: Boolean(auto) } });
    }

    if (op === 'bulk-attendance-notify') {
      const allowed = ['teacher', 'coach', 'admin', 'super_admin'];
      if (!allowed.includes(role)) return res.status(403).json({ error: 'forbidden' });
      const targets = Array.isArray(body.targets) ? body.targets : [];
      if (!targets.length) return res.status(400).json({ error: 'targets_required' });
      const preset = String(body.message_preset || 'absent_standard').trim();
      const custom = String(body.custom_message || '').trim();
      const ctx = body.session_context && typeof body.session_context === 'object' ? body.session_context : {};
      const visible = await getVisibleStudentIdSet(supabaseAdmin, normalizeRole, actor, institutionId);
      const varsBase = {
        student_name: String(ctx.student_name || '{{student_name}}'),
        subject: String(ctx.subject || ''),
        lesson_time: String(ctx.lesson_time || ''),
        teacher_name: String(ctx.teacher_name || ''),
        lesson_date: String(ctx.lesson_date || ''),
        class_name: String(ctx.class_name || '')
      };
      const results = [];
      for (const t of targets) {
        const sid = String(t.student_id || '').trim();
        if (!sid) continue;
        if (visible && !visible.has(sid)) {
          results.push({ student_id: sid, ok: false, error: 'forbidden_student' });
          continue;
        }
        const { data: stu } = await supabaseAdmin
          .from('students')
          .select('id,name,phone,parent_phone')
          .eq('id', sid)
          .maybeSingle();
        if (!stu) {
          results.push({ student_id: sid, ok: false, error: 'student_not_found' });
          continue;
        }
        const channels = String(t.channels || 'parent').trim().toLowerCase();
        const vars = {
          ...varsBase,
          student_name: stu.name || varsBase.student_name
        };
        const text = buildAttendanceNotifyText(preset, custom, vars);
        const sendOne = async (phoneRaw) => {
          const e164 = normalizePhoneToE164(phoneRaw);
          if (!e164) return { ok: false, error: 'invalid_phone' };
          try {
            await sendMetaTextMessage({ toE164: e164, text });
            return { ok: true };
          } catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : 'send_failed' };
          }
        };
        const rowResult = { student_id: sid, channels: [], parts: [] };
        if (channels === 'student' || channels === 'both') {
          const r = await sendOne(stu.phone);
          rowResult.parts.push({ to: 'student', ...r });
        }
        if (channels === 'parent' || channels === 'both') {
          const r = await sendOne(stu.parent_phone);
          rowResult.parts.push({ to: 'parent', ...r });
        }
        if (channels !== 'student' && channels !== 'parent' && channels !== 'both') {
          const r = await sendOne(stu.parent_phone);
          rowResult.parts.push({ to: 'parent', ...r });
        }
        rowResult.ok = rowResult.parts.some((p) => p.ok);
        results.push(rowResult);
      }
      return res.status(200).json({ ok: true, results });
    }

    if (op === 'create-class') {
      if (!isAdminRole(role)) return res.status(403).json({ error: 'forbidden' });
      const name = String(body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'name_required' });
      const teacherIds = Array.isArray(body.teacher_ids) ? body.teacher_ids.map(String).filter(Boolean) : [];
      const studentIds = Array.isArray(body.student_ids) ? body.student_ids.map(String).filter(Boolean) : [];
      const classLevelRaw = String(body.class_level || '').trim() || null;
      const branchRaw = String(body.branch || '').trim() || null;

      let writeInstitutionId = institutionId;
      if (role === 'super_admin') {
        const bodyInst = String(body.institution_id || req.query.institution_id || '').trim();
        if (bodyInst) writeInstitutionId = bodyInst;
      }
      if (!writeInstitutionId) {
        return res.status(400).json({
          error: 'institution_id_required',
          message: 'Sınıf oluşturmak için üst menüden kurum seçin.'
        });
      }

      const baseRow = {
        institution_id: writeInstitutionId,
        name,
        description: String(body.description || '').trim() || null,
        created_by: actor.sub
      };

      let insertRow = { ...baseRow, class_level: classLevelRaw, branch: branchRaw };
      let usedMinimalClassesInsert = false;
      let { data: created, error: insErr } = await supabaseAdmin
        .from('classes')
        .insert(insertRow)
        .select('*')
        .maybeSingle();

      if (insErr && isMissingClassesOptionalColumnError(insErr)) {
        usedMinimalClassesInsert = true;
        ({ data: created, error: insErr } = await supabaseAdmin
          .from('classes')
          .insert(baseRow)
          .select('*')
          .maybeSingle());
      }

      if (insErr) {
        const mapped = mapClassesInsertError(insErr);
        console.warn('[class-live-lessons create-class]', insErr.code, insErr.message);
        return res.status(mapped.status).json(mapped.body);
      }
      if (!created?.id) {
        return res.status(500).json({ error: 'Sınıf kaydı oluşturulamadı (yanıt boş).' });
      }

      if (teacherIds.length) {
        const { error: tErr } = await supabaseAdmin
          .from('class_teachers')
          .insert(teacherIds.map((teacherId) => ({ class_id: created.id, teacher_id: teacherId })));
        if (tErr) {
          await supabaseAdmin.from('classes').delete().eq('id', created.id);
          console.warn('[class-live-lessons create-class] class_teachers', tErr);
          return res.status(400).json({
            error: `Öğretmen atanamadı (geçerli kullanıcı id gerekli): ${tErr.message}`,
            code: String(tErr.code || '')
          });
        }
      }
      if (studentIds.length) {
        const { error: sErr } = await supabaseAdmin
          .from('class_students')
          .insert(studentIds.map((studentId) => ({ class_id: created.id, student_id: studentId })));
        if (sErr) {
          await supabaseAdmin.from('class_teachers').delete().eq('class_id', created.id);
          await supabaseAdmin.from('classes').delete().eq('id', created.id);
          console.warn('[class-live-lessons create-class] class_students', sErr);
          return res.status(400).json({
            error: `Öğrenci atanamadı (geçerli öğrenci kaydı gerekli): ${sErr.message}`,
            code: String(sErr.code || '')
          });
        }
      }

      let responseRow = created;
      if (usedMinimalClassesInsert && (classLevelRaw || branchRaw)) {
        const patch = {};
        if (classLevelRaw) patch.class_level = classLevelRaw;
        if (branchRaw) patch.branch = branchRaw;
        const { data: patched, error: pErr } = await supabaseAdmin
          .from('classes')
          .update(patch)
          .eq('id', created.id)
          .select('*')
          .maybeSingle();
        if (!pErr && patched) responseRow = patched;
      }

      return res.status(201).json({ data: responseRow });
    }

    if (op === 'update-class-members') {
      if (!isAdminRole(role)) return res.status(403).json({ error: 'forbidden' });
      const classId = String(body.class_id || '').trim();
      if (!classId) return res.status(400).json({ error: 'class_id_required' });
      const teacherIds = Array.isArray(body.teacher_ids) ? body.teacher_ids.map(String).filter(Boolean) : [];
      const studentIds = Array.isArray(body.student_ids) ? body.student_ids.map(String).filter(Boolean) : [];

      await Promise.all([
        supabaseAdmin.from('class_teachers').delete().eq('class_id', classId),
        supabaseAdmin.from('class_students').delete().eq('class_id', classId)
      ]);
      if (teacherIds.length) {
        await supabaseAdmin
          .from('class_teachers')
          .insert(teacherIds.map((teacherId) => ({ class_id: classId, teacher_id: teacherId })));
      }
      if (studentIds.length) {
        await supabaseAdmin
          .from('class_students')
          .insert(studentIds.map((studentId) => ({ class_id: classId, student_id: studentId })));
      }
      if (Object.prototype.hasOwnProperty.call(body, 'class_level') || Object.prototype.hasOwnProperty.call(body, 'branch') || Object.prototype.hasOwnProperty.call(body, 'name')) {
        const clsPatch = {};
        if (Object.prototype.hasOwnProperty.call(body, 'class_level'))
          clsPatch.class_level = String(body.class_level || '').trim() || null;
        if (Object.prototype.hasOwnProperty.call(body, 'branch'))
          clsPatch.branch = String(body.branch || '').trim() || null;
        if (Object.prototype.hasOwnProperty.call(body, 'name')) {
          const nextName = String(body.name || '').trim();
          if (!nextName) {
            return res.status(400).json({ error: 'name_required', hint: 'Sınıf adı boş olamaz.' });
          }
          clsPatch.name = nextName;
        }
        const { error: clsErr } = await supabaseAdmin.from('classes').update(clsPatch).eq('id', classId);
        if (clsErr) {
          const mapped = mapClassesInsertError(clsErr);
          return res.status(mapped.status).json(mapped.body);
        }
      }
      return res.status(200).json({ ok: true });
    }

    if (op === 'create-session') {
      const classId = String(body.class_id || '').trim();
      if (!classId) return res.status(400).json({ error: 'class_id_required' });
      const details = await getClassDetails(classId);
      if (!details.class) return res.status(404).json({ error: 'class_not_found' });
      if (!isAdminRole(role) && !details.teacher_ids.includes(actor.sub)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const teacherIdRaw = String(body.teacher_id || '').trim();
      const teacherId = isAdminRole(role) ? teacherIdRaw || details.teacher_ids[0] || actor.sub : actor.sub;
      if (!teacherId) return res.status(400).json({ error: 'teacher_required' });
      const date = String(body.lesson_date || '').trim();
      const start = hhmmss(body.start_time, '09:00:00');
      const duration = Math.max(15, Number(body.duration_minutes || 40));
      const end = hhmmss(body.end_time, addMinutesToTime(start, duration));
      const subject = String(body.subject || '').trim();
      const manualMeetingLink = String(body.meeting_link || '').trim();
      if (!date || !subject) {
        return res.status(400).json({ error: 'lesson_date_subject_meeting_link_required' });
      }
      let meetingLink;
      let meetingLinkModerator = null;
      let autoBbb = null;
      const resolved = await resolveClassMeetingLinkFromRequest({
        manualLink: manualMeetingLink,
        subject,
        className: details.class?.name || '',
        teacherId,
        durationMinutes: resolveBbbMeetingDurationMinutes(duration),
        meetingKeyPrefix: `classsession${classId}`
      });
      if (!resolved.ok) {
        return res.status(resolved.code === 'bbb_create_failed' ? 502 : 400).json({
          error: resolved.error,
          code: resolved.code
        });
      }
      meetingLink = resolved.meetingLink;
      meetingLinkModerator = resolved.meetingLinkModerator;
      autoBbb = resolved.autoBbb;
      const { data, error } = await insertOneOptionalModerator('class_sessions', {
          class_id: classId,
          institution_id: details.class.institution_id || institutionId,
          lesson_date: date,
          start_time: start,
          end_time: end,
          subject,
          teacher_id: teacherId,
          meeting_link: meetingLink,
          ...(meetingLinkModerator ? { meeting_link_moderator: meetingLinkModerator } : {}),
          ...bbbFieldsFromResolved(resolved),
          homework: String(body.homework || '').trim() || null,
          status: 'scheduled'
        });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json({ data, auto_bbb: autoBbb });
    }

    if (op === 'send-lesson-reminder') {
      const sessionId = String(body.session_id || '').trim();
      if (!sessionId) return res.status(400).json({ error: 'session_id_required' });
      if (!metaWhatsAppConfigured()) {
        return res.status(503).json({ error: 'meta_whatsapp_not_ready' });
      }

      const { data: session } = await supabaseAdmin
        .from('class_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();
      if (!session) return res.status(404).json({ error: 'session_not_found' });
      if (String(session.status || '') !== 'scheduled') {
        return res.status(400).json({ error: 'session_not_scheduled' });
      }

      const details = await getClassDetails(session.class_id);
      if (!isAdminRole(role) && session.teacher_id !== actor.sub && !details.teacher_ids.includes(actor.sub)) {
        return res.status(403).json({ error: 'forbidden' });
      }

      if (session.reminder_sent) {
        return res.status(200).json({
          ok: true,
          skipped: 'already_sent',
          reminder_sent: true,
          sent_count: 0,
          failed_count: 0
        });
      }

      if (shouldSkipClassLessonReminder(session.subject)) {
        return res.status(200).json({
          ok: true,
          skipped: 'excluded_subject',
          reminder_sent: false,
          sent_count: 0,
          failed_count: 0,
          message: 'Deneme ve rehberlik derslerine grup hatırlatması gönderilmez.'
        });
      }

      const templateRow = await loadClassLessonReminderTemplate();
      const tplCheck = validateClassLessonReminderTemplate(templateRow);
      if (!tplCheck.ok) {
        return res.status(400).json({ error: tplCheck.code });
      }

      const studentIds = details.student_ids || [];
      const { data: students } = studentIds.length
        ? await supabaseAdmin
            .from('students')
            .select('id,name,phone,parent_phone')
            .in('id', studentIds)
        : { data: [] };
      const studentById = new Map((students || []).map((s) => [String(s.id), s]));
      const className = details.class?.name || 'Sınıf';

      const result = await sendClassLessonReminderForSession({
        session,
        templateRow,
        className,
        studentIds,
        studentById,
        applyConsecutiveSkip: false,
        source: 'manual'
      });

      const reminderMarked = await markClassSessionReminderSent(session.id, result);
      const sentCount = result.log.filter((x) => x.ok === true && !x.skipped).length;
      const failedCount = result.log.filter((x) => x.error && !x.skipped).length;

      return res.status(200).json({
        ok: sentCount > 0,
        reminder_sent: reminderMarked,
        sent_count: sentCount,
        failed_count: failedCount,
        students_in_class: studentIds.length,
        details: result.log
      });
    }

    if (op === 'bbb-sync-attendance') {
      if (!isBbbAutoAttendanceEnabled()) {
        return res.status(403).json({ error: 'bbb_auto_attendance_disabled' });
      }
      const sessionId = String(body.session_id || '').trim();
      if (!sessionId) return res.status(400).json({ error: 'session_id_required' });
      const { data: session } = await supabaseAdmin
        .from('class_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();
      if (!session) return res.status(404).json({ error: 'session_not_found' });
      const details = await getClassDetails(session.class_id);
      if (!isAdminRole(role) && session.teacher_id !== actor.sub && !details.teacher_ids.includes(actor.sub)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      await pollBbbPresenceForSession(session);
      const { data: fresh } = await supabaseAdmin
        .from('class_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();
      const row = fresh || session;
      const className = details.class?.name || 'Sınıf';
      const studentIds = details.student_ids || [];

      let early = { ok: true, skipped: 'not_scheduled' };
      if (String(row.status) === 'scheduled') {
        early = await applyEarlyBbbAbsentCheck(row, studentIds, className);
      }

      const result = await applyAutoAttendanceForClassSession(row, studentIds, className, {
        force: String(row.status) === 'completed'
      });

      return res.status(200).json({
        ok: true,
        early_absent: early,
        final_attendance: result
      });
    }

    if (op === 'mark-attendance') {
      const sessionId = String(body.session_id || '').trim();
      const rows = Array.isArray(body.attendance) ? body.attendance : [];
      if (!sessionId || !rows.length) return res.status(400).json({ error: 'session_id_and_attendance_required' });
      const { data: session } = await supabaseAdmin
        .from('class_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();
      if (!session) return res.status(404).json({ error: 'session_not_found' });
      const details = await getClassDetails(session.class_id);
      if (!isAdminRole(role) && session.teacher_id !== actor.sub && !details.teacher_ids.includes(actor.sub)) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const { data: priorRows } = await supabaseAdmin
        .from('class_session_attendance')
        .select('student_id,status')
        .eq('session_id', sessionId);
      const priorStatusByStudent = new Map((priorRows || []).map((r) => [String(r.student_id), String(r.status || '')]));

      const prepared = rows
        .map((r) => ({
          session_id: sessionId,
          student_id: String(r.student_id || '').trim(),
          status: normalizeAttendanceStatus(r.status),
          marked_by: actor.sub,
          marked_at: new Date().toISOString()
        }))
        .filter((r) => r.student_id);

      const { error } = await supabaseAdmin
        .from('class_session_attendance')
        .upsert(prepared, { onConflict: 'session_id,student_id' });
      if (error) return res.status(500).json({ error: error.message });

      const instKey = session.institution_id != null ? String(session.institution_id).trim() : '';
      const className = details.class?.name || 'Sınıf';
      /** @type {{ student_id: string, ok: boolean, note?: string|null, error_code?: string|null, skipped?: string }[]} */
      const absent_whatsapp = [];
      for (const row of prepared) {
        if (row.status !== 'absent') continue;
        if (priorStatusByStudent.get(row.student_id) === 'absent') continue;
        try {
          const r = await sendAbsentNoticeForStudent({
            session,
            className,
            studentId: row.student_id,
            institutionId: instKey
          });
          absent_whatsapp.push({
            student_id: row.student_id,
            ok: Boolean(r.ok),
            note: r.ok ? null : r.note || null,
            error_code: r.ok ? null : r.error_code || null,
            skipped: r.skipped
          });
        } catch (e) {
          absent_whatsapp.push({
            student_id: row.student_id,
            ok: false,
            note: e instanceof Error ? e.message : 'exception'
          });
        }
      }
      return res.status(200).json({
        ok: true,
        suggest_notify: prepared.some((r) => r.status === 'absent'),
        absent_whatsapp
      });
    }

    if (op === 'set-homework') {
      const sessionId = String(body.session_id || '').trim();
      if (!sessionId) return res.status(400).json({ error: 'session_id_required' });
      const { data: session } = await supabaseAdmin
        .from('class_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();
      if (!session) return res.status(404).json({ error: 'session_not_found' });
      const details = await getClassDetails(session.class_id);
      if (!isAdminRole(role) && session.teacher_id !== actor.sub && !details.teacher_ids.includes(actor.sub)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const { data, error } = await supabaseAdmin
        .from('class_sessions')
        .update({
          homework: String(body.homework || '').trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId)
        .select('*')
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ data });
    }

    if (op === 'create-slot') {
      const classId = String(body.class_id || '').trim();
      if (!classId) return res.status(400).json({ error: 'class_id_required' });
      const details = await getClassDetails(classId);
      if (!details.class) return res.status(404).json({ error: 'class_not_found' });
      if (!isAdminRole(role) && !details.teacher_ids.includes(actor.sub)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const teacherIdRaw = String(body.teacher_id || '').trim();
      const teacherId = isAdminRole(role) ? teacherIdRaw || details.teacher_ids[0] || actor.sub : actor.sub;
      const dayOfWeek = Number(body.day_of_week);
      if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
        return res.status(400).json({ error: 'day_of_week_invalid' });
      }
      const start = hhmmss(body.start_time, '10:00:00');
      const end = hhmmss(body.end_time, addMinutesToTime(start, Math.max(15, Number(body.duration_minutes || 40))));
      const subject = String(body.subject || '').trim();
      const manualMeetingLink = String(body.meeting_link || '').trim();
      const duration = Math.max(15, Number(body.duration_minutes || 40));
      if (!subject) return res.status(400).json({ error: 'subject_meeting_link_required' });

      let meetingLink;
      let meetingLinkModerator = null;
      let autoBbb = null;
      const resolved = await resolveClassMeetingLinkFromRequest({
        manualLink: manualMeetingLink,
        subject,
        className: details.class?.name || '',
        teacherId,
        durationMinutes: resolveBbbMeetingDurationMinutes(duration),
        meetingKeyPrefix: `classslot${classId}`
      });
      if (!resolved.ok) {
        return res.status(resolved.code === 'bbb_create_failed' ? 502 : 400).json({
          error: resolved.error,
          code: resolved.code
        });
      }
      meetingLink = resolved.meetingLink;
      meetingLinkModerator = resolved.meetingLinkModerator;
      autoBbb = resolved.autoBbb;

      const { data: sameTeacherSlots, error: cErr } = await supabaseAdmin
        .from('class_weekly_slots')
        .select('id,start_time,end_time')
        .eq('teacher_id', teacherId)
        .eq('day_of_week', dayOfWeek);
      if (cErr) return res.status(500).json({ error: cErr.message });
      if (
        !isSolutionLessonSubject(subject) &&
        (sameTeacherSlots || []).some((x) => timeOverlap(start, end, x.start_time, x.end_time))
      ) {
        return res.status(409).json({ error: 'Aynı öğretmen aynı saatte ders alamaz.', code: 'teacher_time_conflict' });
      }

      const { data, error } = await insertOneOptionalModerator('class_weekly_slots', {
          class_id: classId,
          institution_id: details.class.institution_id || institutionId,
          day_of_week: dayOfWeek,
          start_time: start,
          end_time: end,
          subject,
          teacher_id: teacherId,
          meeting_link: meetingLink,
          ...(meetingLinkModerator ? { meeting_link_moderator: meetingLinkModerator } : {}),
          ...bbbFieldsFromResolved(resolved),
          homework: String(body.homework || '').trim() || null
        });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json({ data, auto_bbb: autoBbb });
    }

    /**
     * Tarihli oturumları toplu oluşturur: tekrarlanmıyorsa yalnızca başlangıç günü,
     * repeat_interval_days 7 = haftalık, 15 = 15 günlük vb.
     */
    if (op === 'bulk-schedule-sessions') {
      const classId = String(body.class_id || '').trim();
      if (!classId) return res.status(400).json({ error: 'class_id_required' });
      const details = await getClassDetails(classId);
      if (!details.class) return res.status(404).json({ error: 'class_not_found' });
      if (!isAdminRole(role) && !details.teacher_ids.includes(actor.sub)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const teacherIdRaw = String(body.teacher_id || '').trim();
      const teacherId = isAdminRole(role) ? teacherIdRaw || details.teacher_ids[0] || actor.sub : actor.sub;
      if (!teacherId) return res.status(400).json({ error: 'teacher_required' });

      const startDate = String(body.lesson_date || body.lesson_date_start || '').trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return res.status(400).json({ error: 'lesson_date_invalid' });
      }
      const rawInterval = Number(body.repeat_interval_days);
      const repeatInterval = Number.isFinite(rawInterval) && rawInterval >= 0 ? Math.floor(rawInterval) : 0;
      const ALLOWED = [0, 7, 15];
      if (!ALLOWED.includes(repeatInterval)) {
        return res.status(400).json({ error: 'repeat_interval_days_invalid', allowed: ALLOWED });
      }
      let occurrences = Math.floor(Number(body.occurrences ?? (repeatInterval === 0 ? 1 : 8)));
      if (repeatInterval === 0) occurrences = 1;
      if (!Number.isFinite(occurrences) || occurrences < 1) occurrences = 1;
      occurrences = Math.min(occurrences, 52);

      const start = hhmmss(body.start_time, '10:00:00');
      const duration = Math.max(15, Number(body.duration_minutes || 40));
      const end = hhmmss(body.end_time, addMinutesToTime(start, duration));
      const subject = String(body.subject || '').trim();
      const manualMeetingLink = String(body.meeting_link || '').trim();
      if (!subject) return res.status(400).json({ error: 'subject_meeting_link_required' });

      let meetingLink;
      let meetingLinkModerator = null;
      let autoBbb = null;
      const resolved = await resolveClassMeetingLinkFromRequest({
        manualLink: manualMeetingLink,
        subject,
        className: details.class?.name || '',
        teacherId,
        durationMinutes: resolveBbbMeetingDurationMinutes(duration),
        meetingKeyPrefix: `classbulk${classId}`
      });
      if (!resolved.ok) {
        return res.status(resolved.code === 'bbb_create_failed' ? 502 : 400).json({
          error: resolved.error,
          code: resolved.code
        });
      }
      meetingLink = resolved.meetingLink;
      meetingLinkModerator = resolved.meetingLinkModerator;
      autoBbb = resolved.autoBbb;

      const scheduleBatchId = randomUUID();
      const rowsToInsert = [];
      const skipped = [];
      for (let i = 0; i < occurrences; i++) {
        const lessonDate =
          repeatInterval === 0 ? startDate : addDaysIsoDate(startDate, i * repeatInterval);
        if (!lessonDate) {
          return res.status(400).json({ error: 'date_compute_failed' });
        }
        const clash = await teacherTimeConflictOnDate({ teacherId, lessonDate, start, end, subject });
        if (!clash.ok) {
          skipped.push({
            lesson_date: lessonDate,
            reason: clash.reason || 'Çakışma'
          });
          continue;
        }
        rowsToInsert.push({
          class_id: classId,
          institution_id: details.class.institution_id || institutionId,
          lesson_date: lessonDate,
          start_time: start,
          end_time: end,
          subject,
          teacher_id: teacherId,
          meeting_link: meetingLink,
          ...(meetingLinkModerator ? { meeting_link_moderator: meetingLinkModerator } : {}),
          ...bbbFieldsFromResolved(resolved),
          homework: String(body.homework || '').trim() || null,
          status: 'scheduled',
          schedule_batch_id: scheduleBatchId
        });
      }

      if (!rowsToInsert.length) {
        const first = skipped[0] || {};
        return res.status(409).json({
          error: first.reason || 'Hiçbir oturum oluşturulamadı (tüm tarihlerde çakışma).',
          code: 'teacher_time_conflict',
          lesson_date: first.lesson_date,
          skipped
        });
      }

      const { data: created, error: insErr } = await insertManyOptionalModerator(
        'class_sessions',
        rowsToInsert
      );
      if (insErr) return res.status(500).json({ error: insErr.message });
      return res.status(201).json({ data: created || [], auto_bbb: autoBbb, skipped });
    }
  }

  if (req.method === 'PATCH') {
    const body = parseBody(req);
    if (String(body.op || '') === 'teacher-rates') {
      if (!isPaymentSummaryAdmin(role)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const teacherId = String(body.teacher_id || '').trim();
      const unitPrice = Number(body.unit_price_tl);
      if (!teacherId) return res.status(400).json({ error: 'teacher_id_required' });
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        return res.status(400).json({ error: 'invalid_unit_price_tl' });
      }
      const { data, error } = await supabaseAdmin
        .from('teacher_group_lesson_rates')
        .upsert(
          {
            teacher_id: teacherId,
            institution_id: institutionId || null,
            unit_price_tl: Math.round(unitPrice * 100) / 100,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'teacher_id' }
        )
        .select('teacher_id,unit_price_tl,updated_at')
        .maybeSingle();
      if (error) {
        if (String(error.message || '').toLowerCase().includes('teacher_group_lesson_rates')) {
          return res.status(503).json({
            error: 'teacher_rates_table_missing',
            hint: 'student-coaching-system/sql/2026-06-01-teacher-group-lesson-rates.sql'
          });
        }
        return res.status(500).json({ error: error.message });
      }
      return res.status(200).json({ data });
    }

    if (String(body.op || '') === 'teacher-payout') {
      if (!isPaymentSummaryAdmin(role)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const teacherId = String(body.teacher_id || '').trim();
      const periodFrom = String(body.period_from || body.from || '').trim().slice(0, 10);
      const periodTo = String(body.period_to || body.to || '').trim().slice(0, 10);
      const paid = body.paid !== false && body.paid !== 0 && String(body.paid || 'true') !== 'false';
      if (!teacherId) return res.status(400).json({ error: 'teacher_id_required' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(periodFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(periodTo)) {
        return res.status(400).json({ error: 'from_to_invalid', hint: 'YYYY-MM-DD' });
      }
      if (periodFrom > periodTo) return res.status(400).json({ error: 'from_after_to' });

      if (!paid) {
        let delQ = supabaseAdmin
          .from('teacher_group_lesson_payouts')
          .delete()
          .eq('teacher_id', teacherId)
          .eq('period_from', periodFrom)
          .eq('period_to', periodTo);
        if (institutionId) delQ = delQ.eq('institution_id', institutionId);
        const { error: delErr } = await delQ;
        if (delErr) {
          if (String(delErr.message || '').toLowerCase().includes('teacher_group_lesson_payouts')) {
            return res.status(503).json({
              error: 'teacher_payouts_table_missing',
              hint: 'student-coaching-system/sql/2026-06-01-teacher-group-lesson-payouts.sql'
            });
          }
          return res.status(500).json({ error: delErr.message });
        }
        return res.status(200).json({ ok: true, paid: false });
      }

      const amountRaw = body.amount_tl != null ? Number(body.amount_tl) : null;
      const amountTl =
        amountRaw != null && Number.isFinite(amountRaw) && amountRaw >= 0
          ? Math.round(amountRaw * 100) / 100
          : null;
      const { data, error } = await supabaseAdmin
        .from('teacher_group_lesson_payouts')
        .upsert(
          {
            teacher_id: teacherId,
            institution_id: institutionId || null,
            period_from: periodFrom,
            period_to: periodTo,
            amount_tl: amountTl,
            paid_at: new Date().toISOString(),
            paid_by: String(actor.sub || actor.id || '').trim() || null
          },
          { onConflict: 'teacher_id,institution_id,period_from,period_to' }
        )
        .select('teacher_id,period_from,period_to,amount_tl,paid_at,paid_by')
        .maybeSingle();
      if (error) {
        if (String(error.message || '').toLowerCase().includes('teacher_group_lesson_payouts')) {
          return res.status(503).json({
            error: 'teacher_payouts_table_missing',
            hint: 'student-coaching-system/sql/2026-06-01-teacher-group-lesson-payouts.sql'
          });
        }
        return res.status(500).json({ error: error.message });
      }
      return res.status(200).json({ data, paid: true });
    }

    const slotMode = String(body.kind || '') === 'slot';
    const rowId = String(body.id || '').trim();
    if (!rowId) return res.status(400).json({ error: 'id_required' });
    const table = slotMode ? 'class_weekly_slots' : 'class_sessions';
    const notFound = slotMode ? 'slot_not_found' : 'session_not_found';
    const { data: session } = await supabaseAdmin
      .from(table)
      .select('*')
      .eq('id', rowId)
      .maybeSingle();
    if (!session) return res.status(404).json({ error: notFound });
    const details = await getClassDetails(session.class_id);
    if (!isAdminRole(role) && session.teacher_id !== actor.sub && !details.teacher_ids.includes(actor.sub)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const patch = { updated_at: new Date().toISOString() };
    if (!slotMode && body.lesson_date) patch.lesson_date = String(body.lesson_date).slice(0, 10);
    if (slotMode && body.day_of_week != null) patch.day_of_week = Number(body.day_of_week);
    if (body.start_time) patch.start_time = hhmmss(body.start_time);
    if (body.end_time) patch.end_time = hhmmss(body.end_time);
    if (body.subject) patch.subject = String(body.subject).trim();
    if (Object.prototype.hasOwnProperty.call(body, 'meeting_link')) {
      const manual = String(body.meeting_link || '').trim();
      const existing = String(session.meeting_link || '').trim();
      if (manual) {
        patch.meeting_link = manual;
      } else if (!existing) {
        const teacherIdForBbb = String((patch.teacher_id ?? session.teacher_id) || '');
        const subjectForBbb = String((patch.subject ?? session.subject) || 'Ders');
        const classNameForBbb = details.class?.name || '';
        const durMin = Math.max(
          15,
          Math.round(
            Number(
              body.duration_minutes ??
                (session.end_time && session.start_time
                  ? 40
                  : 40)
            ) || 40
          )
        );
        const resolved = await resolveClassMeetingLinkFromRequest({
          manualLink: '',
          subject: subjectForBbb,
          className: classNameForBbb,
          teacherId: teacherIdForBbb,
          durationMinutes: durMin,
          meetingKeyPrefix: `classpatch${session.id}`
        });
        if (!resolved.ok) {
          return res.status(resolved.code === 'bbb_create_failed' ? 502 : 400).json({
            error: resolved.error,
            code: resolved.code
          });
        }
        patch.meeting_link = resolved.meetingLink;
        if (resolved.meetingLinkModerator) {
          patch.meeting_link_moderator = resolved.meetingLinkModerator;
        }
      }
    }
    if (body.status && ['scheduled', 'completed', 'cancelled'].includes(String(body.status))) {
      patch.status = String(body.status);
    }
    if (body.homework !== undefined) patch.homework = String(body.homework || '').trim() || null;

    const applyScope = String(body.apply_scope || body.applyScope || 'single').trim().toLowerCase();
    const applyBatch = applyScope === 'batch' || applyScope === 'series' || applyScope === 'all';

    if (body.teacher_id !== undefined) {
      const tid = String(body.teacher_id || '').trim();
      if (!tid) {
        return res.status(400).json({ error: 'teacher_id_required', code: 'teacher_id_invalid' });
      }
      if (!details.teacher_ids.includes(tid)) {
        return res.status(400).json({
          error:
            'Bu öğretmen sınıfın atanmış öğretmenleri arasında değil. Önce sınıf ayarlarından öğretmeni ekleyin.',
          code: 'teacher_not_in_class'
        });
      }
      patch.teacher_id = tid;
    }

    if (!slotMode && (patch.lesson_date || patch.start_time || patch.end_time || patch.teacher_id)) {
      const teacherIdForCheck = String((patch.teacher_id ?? session.teacher_id) || '');
      const lessonDate = String((patch.lesson_date ?? session.lesson_date) || '').slice(0, 10);
      const start = hhmmss(patch.start_time || session.start_time, '09:00:00');
      const end = hhmmss(patch.end_time || session.end_time, '10:00:00');
      const subjectForCheck = String((patch.subject ?? session.subject) || '');
      const clash = await teacherTimeConflictOnDate({
        teacherId: teacherIdForCheck,
        lessonDate,
        start,
        end,
        excludeSessionIds: [rowId],
        subject: subjectForCheck
      });
      if (!clash.ok) {
        return res.status(409).json({
          error: clash.reason || 'Çakışma',
          code: 'teacher_time_conflict'
        });
      }
    }

    if (slotMode && (patch.start_time || patch.end_time || patch.day_of_week || patch.teacher_id)) {
      const teacherId = String((patch.teacher_id || session.teacher_id) || '');
      const dayOfWeek = Number(patch.day_of_week || session.day_of_week);
      const start = String((patch.start_time || session.start_time) || '');
      const end = String((patch.end_time || session.end_time) || '');
      const subjectForCheck = String((patch.subject ?? session.subject) || '');
      const { data: sameTeacherSlots, error: cErr } = await supabaseAdmin
        .from('class_weekly_slots')
        .select('id,start_time,end_time')
        .eq('teacher_id', teacherId)
        .eq('day_of_week', dayOfWeek)
        .neq('id', rowId);
      if (cErr) return res.status(500).json({ error: cErr.message });
      if (
        !isSolutionLessonSubject(subjectForCheck) &&
        (sameTeacherSlots || []).some((x) => timeOverlap(start, end, x.start_time, x.end_time))
      ) {
        return res.status(409).json({ error: 'Aynı öğretmen aynı saatte ders alamaz.', code: 'teacher_time_conflict' });
      }
    }

    if (!slotMode && applyBatch) {
      const peerIds = await listScheduledSessionBatchPeers(session);
      if (peerIds.length > 1) {
        const batchPatch = { ...patch };
        delete batchPatch.lesson_date;

        if (batchPatch.teacher_id || batchPatch.start_time || batchPatch.end_time) {
          for (const pid of peerIds) {
            const { data: peer, error: peerErr } = await supabaseAdmin
              .from('class_sessions')
              .select('*')
              .eq('id', pid)
              .maybeSingle();
            if (peerErr) throw peerErr;
            if (!peer) continue;
            const teacherIdForCheck = String((batchPatch.teacher_id ?? peer.teacher_id) || '');
            const lessonDate = String(peer.lesson_date || '').slice(0, 10);
            const start = hhmmss(batchPatch.start_time || peer.start_time, '09:00:00');
            const end = hhmmss(batchPatch.end_time || peer.end_time, '10:00:00');
            const subjectForCheck = String((batchPatch.subject ?? peer.subject ?? session.subject) || '');
            const clash = await teacherTimeConflictOnDate({
              teacherId: teacherIdForCheck,
              lessonDate,
              start,
              end,
              excludeSessionIds: peerIds,
              subject: subjectForCheck
            });
            if (!clash.ok) {
              return res.status(409).json({
                error: `${lessonDate}: ${clash.reason || 'Çakışma'}`,
                code: 'teacher_time_conflict',
                lesson_date: lessonDate
              });
            }
          }
        }

        const { data: batchRows, error: batchErr } = await supabaseAdmin
          .from('class_sessions')
          .update(batchPatch)
          .in('id', peerIds)
          .select('*');
        if (batchErr) return res.status(500).json({ error: batchErr.message });
        const primary = (batchRows || []).find((r) => String(r.id) === rowId) || batchRows?.[0] || null;
        return res.status(200).json({
          data: primary,
          updated_count: batchRows?.length ?? peerIds.length,
          batch: true
        });
      }
    }

    const { data, error } = await supabaseAdmin
      .from(table)
      .update(patch)
      .eq('id', rowId)
      .select('*')
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ data });
  }

  if (req.method === 'DELETE') {
    const classId = String(req.query.class_id || '').trim();
    const sessionId = String(req.query.session_id || '').trim();
    const slotId = String(req.query.slot_id || '').trim();
    if (sessionId) {
      const { data: session } = await supabaseAdmin
        .from('class_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();
      if (!session) return res.status(404).json({ error: 'session_not_found' });
      const details = await getClassDetails(session.class_id);
      if (!isAdminRole(role) && session.teacher_id !== actor.sub && !details.teacher_ids.includes(actor.sub)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const applyScope = String(req.query.apply_scope || req.query.applyScope || 'single')
        .trim()
        .toLowerCase();
      const applyBatch = applyScope === 'batch' || applyScope === 'series' || applyScope === 'all';
      if (applyBatch) {
        const peerIds = await listScheduledSessionBatchPeers(session);
        if (peerIds.length > 1) {
          const { error } = await supabaseAdmin.from('class_sessions').delete().in('id', peerIds);
          if (error) return res.status(500).json({ error: error.message });
          return res.status(200).json({ ok: true, deleted_count: peerIds.length, batch: true });
        }
      }
      const { error } = await supabaseAdmin.from('class_sessions').delete().eq('id', sessionId);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }
    if (classId) {
      if (!isAdminRole(role)) return res.status(403).json({ error: 'forbidden' });
      const { error } = await supabaseAdmin.from('classes').delete().eq('id', classId);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }
    if (slotId) {
      const { data: slot } = await supabaseAdmin
        .from('class_weekly_slots')
        .select('*')
        .eq('id', slotId)
        .maybeSingle();
      if (!slot) return res.status(404).json({ error: 'slot_not_found' });
      const details = await getClassDetails(slot.class_id);
      if (!isAdminRole(role) && slot.teacher_id !== actor.sub && !details.teacher_ids.includes(actor.sub)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const { error } = await supabaseAdmin.from('class_weekly_slots').delete().eq('id', slotId);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'class_id_or_session_id_or_slot_id_required' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
