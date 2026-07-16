import { requireAuthenticatedActor, hasInstitutionAccess } from '../api/_lib/auth.js';
import { enrichMeetingRowsJoinLink, buildStaffBbbJoinUrl, parseBbbJoinCredentials, parseBbbMeetingIdFromJoinUrl, parseBbbPasswordFromJoinUrl } from '../api/_lib/bbb.js';
import { resolveBbbOrManualMeetingLink } from '../api/_lib/resolve-bbb-meeting-link.js';
import { handleBbbJoinGet, handleBbbRecordingGet, patchRowMeetingLinks, patchRowRecordingLink } from '../api/_lib/bbb-join-handler.js';
import { createGuestJoinShareLink } from '../api/_lib/bbb-guest-join-core.js';
import { insertOneOptionalModerator, insertManyOptionalModerator } from '../api/_lib/supabase-optional-moderator.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { detectPlatform } from '../api/_lib/detect-meeting-platform.js';
import { syncTeacherLessonsScheduledToCompleted } from '../api/_lib/teacher-lessons-sync.js';
import { normalizeUuidOrGenerate } from '../api/_lib/uuid.js';
import { sumLessonUnitsUsed } from '../api/_lib/count-teacher-lesson-usage.js';
import { lessonUnitsFromDurationMinutes } from '../api/_lib/lesson-duration-units.js';
import { isTeacherLessonsRelationMissingError } from '../api/_lib/is-teacher-lessons-missing.js';
import { statusAndBodyFromSupabaseError } from '../api/_lib/supabase-error-response.js';
import {
  assertCoachLessonsMeetingsUnlocked,
  assertStudentCoachLessonsUnlocked,
  getCoachLessonsMeetingsLocked,
  CoachLessonsLockError
} from '../api/_lib/coach-lessons-lock.js';
import { resolveStudentRowForUser } from '../api/_lib/resolve-student-id.js';
import { getTeacherPanelStudentScope, isStudentAllowedForTeacherPanel } from '../api/_lib/teacher-class-scope.js';
import { normalizedUserRolesFromDb } from '../api/_lib/user-roles-fetch.js';

const jsonError = (res, status, error, extra) => res.status(status).json({ error, ...extra });

async function actorRoleTagSet(actor) {
  const tags = await normalizedUserRolesFromDb(actor?.sub);
  const set = new Set((tags || []).map((r) => String(r || '').trim().toLowerCase()));
  if (actor?.role) set.add(String(actor.role).trim().toLowerCase());
  return set;
}

function respondSupabaseError(res, err) {
  if (isTeacherLessonsBbbColumnsMissingError(err)) {
    return res.status(503).json(teacherLessonsBbbColumnsMissingBody());
  }
  const { status, body } = statusAndBodyFromSupabaseError(err);
  return res.status(status).json(body);
}

const teacherLessonsMissingBody = () => ({
  error:
    'Veritabanında `teacher_lessons` tablosu yok veya şema önbelleği güncel değil. Supabase → SQL Editor’da projedeki `student-coaching-system/sql/2026-05-08-teacher-lessons.sql` dosyasını çalıştırın. Sonra Supabase → Project Settings → API bölümünden projeyi yeniden başlatın veya birkaç dakika bekleyin.',
  code: 'teacher_lessons_table_missing',
  hint: 'teacher_lessons_sql_missing'
});

const teacherLessonsBbbColumnsMissingBody = () => ({
  error:
    'Veritabanında `teacher_lessons.bbb_meeting_id` / `bbb_attendee_pw` kolonları yok. Supabase → SQL Editor’da `student-coaching-system/sql/RUN_IN_SUPABASE_teacher_lessons_bbb_columns.sql` (veya `2026-07-16-teacher-lessons-bbb-columns.sql`) dosyasını çalıştırın; ardından şema yenilenince sayfayı yenileyin.',
  code: 'teacher_lessons_bbb_columns_missing',
  hint: 'teacher_lessons_bbb_columns_sql_missing'
});

function isTeacherLessonsBbbColumnsMissingError(err) {
  const msg = `${errorMessage(err)} ${err?.details || ''} ${err?.hint || ''}`;
  return /teacher_lessons\.bbb_meeting_id|teacher_lessons\.bbb_attendee_pw|column\s+bbb_meeting_id\s+does not exist|column\s+bbb_attendee_pw\s+does not exist/i.test(
    msg
  );
}

const isAuthFailureMessage = (msg) =>
  ['Missing token', 'Invalid token', 'Invalid signature', 'Token expired'].includes(String(msg || ''));

function wallTimeToUtcMs(lessonDate, timeStr) {
  const t = normalizeTimeForParse(timeStr);
  const iso = `${lessonDate}T${t}+03:00`;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function normalizeTimeForParse(raw) {
  const s = String(raw || '').trim();
  if (!s) return '00:00:00';
  if (/^\d{1,2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) return s;
  return '00:00:00';
}

/**
 * İstanbul günü içinde ders penceresi (create / PATCH için ortak).
 * @returns {{ lesson_date: string, start_time: string, end_time: string, duration_minutes: number } | { error: string }}
 */
function computeScheduledWindow(lessonDate, startTimeRaw, durationMinutes) {
  const plannedMinutes = Math.max(15, Math.round(Number(durationMinutes) || 60));
  const startMsBase = wallTimeToUtcMs(lessonDate, startTimeRaw);
  if (startMsBase == null) return { error: 'Geçersiz tarih veya saat.' };
  let endMs = startMsBase + plannedMinutes * 60_000;

  const fmtIstDate = (ms) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(ms));

  const fmtIstTime = (ms) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Istanbul',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(new Date(ms));
    const h = parts.find((p) => p.type === 'hour')?.value || '00';
    const m = parts.find((p) => p.type === 'minute')?.value || '00';
    const s = parts.find((p) => p.type === 'second')?.value || '00';
    return `${h}:${m}:${s}`;
  };

  if (fmtIstDate(endMs) !== lessonDate) {
    const eod = wallTimeToUtcMs(lessonDate, '23:59:59');
    if (eod != null) endMs = eod;
  }

  return {
    lesson_date: lessonDate,
    start_time: normalizeTimeForParse(startTimeRaw),
    end_time: fmtIstTime(endMs),
    duration_minutes: plannedMinutes
  };
}

function mapRowToApi(row) {
  if (!row) return row;
  const { lesson_date, ...rest } = row;
  return { ...rest, date: lesson_date };
}

async function attachTeacherNamesToLessons(mapped) {
  const arr = Array.isArray(mapped) ? mapped : [];
  const ids = [...new Set(arr.map((r) => String(r.teacher_id || '').trim()).filter(Boolean))];
  if (!ids.length) return arr;
  const { data: users, error } = await supabaseAdmin.from('users').select('id,name,email').in('id', ids);
  if (error) return arr;
  const names = {};
  for (const u of users || []) {
    names[String(u.id)] = String(u.name || u.email || u.id || '').trim();
  }
  return arr.map((r) => ({
    ...r,
    teacher_name: names[String(r.teacher_id || '')] || ''
  }));
}

async function userDisplayName(userId, fallback = 'Kullanıcı') {
  if (!userId) return fallback;
  const { data } = await supabaseAdmin.from('users').select('name,email').eq('id', userId).maybeSingle();
  return data?.name || data?.email || fallback;
}

async function resolveTeacherLessonMeetingLink({
  manualLink,
  title,
  studentName,
  teacherId,
  durationMinutes,
  meetingKeyPrefix
}) {
  const teacherName = await userDisplayName(teacherId, 'Öğretmen');
  return resolveBbbOrManualMeetingLink({
    manualLink,
    meetingName: title || 'Canlı özel ders',
    attendeeName: String(studentName || '').trim() || 'Öğrenci',
    moderatorName: teacherName,
    durationMinutes,
    meetingKeyPrefix
  });
}

async function hasTeacherConflict({ teacherId, lessonDate, startTime, endTime, excludeId = null }) {
  let q = supabaseAdmin
    .from('teacher_lessons')
    .select('id,start_time,end_time,status')
    .eq('teacher_id', teacherId)
    .eq('lesson_date', lessonDate)
    .in('status', ['scheduled', 'completed']);
  if (excludeId) q = q.neq('id', excludeId);
  const { data, error } = await q;
  if (error) throw error;
  const incomingStart = String(startTime || '').slice(0, 8);
  const incomingEnd = String(endTime || '').slice(0, 8);
  return (data || []).some((r) => {
    const s = String(r.start_time || '').slice(0, 8);
    const e = String(r.end_time || '').slice(0, 8);
    return incomingStart < e && incomingEnd > s;
  });
}

async function canPlanLessonForStudent(actor, student) {
  if (!student) return false;
  if (actor.role === 'super_admin') return true;
  if (actor.role === 'admin') return hasInstitutionAccess(actor, student.institution_id);
  const tags = await actorRoleTagSet(actor);
  if (tags.has('teacher')) {
    // Özel ders ataması: öğrenci institution_id null olsa bile panel kapsamında ise izin ver
    if (await isStudentAllowedForTeacherPanel(actor.sub, student.id, actor.institution_id || null)) {
      return true;
    }
  }
  if (tags.has('coach')) {
    return Boolean(actor.coach_id && student.coach_id === actor.coach_id);
  }
  return false;
}

/** Koç: çok öğrencide .in() URL limitine takılmamak için parçalı sorgu */
const COACH_STUDENT_IN_CHUNK = 100;

async function handleList(req, res) {
  if (req.method !== 'GET') return jsonError(res, 405, 'Method not allowed');
  try {
    const actor = requireAuthenticatedActor(req);
    await syncTeacherLessonsScheduledToCompleted();

    const teacherFilter =
      typeof req.query?.teacher_id === 'string' && req.query.teacher_id.trim()
        ? req.query.teacher_id.trim()
        : null;
    const studentFilter =
      typeof req.query?.student_id === 'string' && req.query.student_id.trim()
        ? req.query.student_id.trim()
        : null;
    const fromQ =
      typeof req.query?.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from.trim())
        ? req.query.from.trim()
        : null;
    const toQ =
      typeof req.query?.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to.trim())
        ? req.query.to.trim()
        : null;
    const platformFilter =
      typeof req.query?.platform === 'string' && ['bbb', 'zoom', 'meet', 'other'].includes(req.query.platform)
        ? req.query.platform
        : null;

    const teacherLessonsBaseSelect = () => {
      let b = supabaseAdmin
        .from('teacher_lessons')
        .select('*')
        .order('lesson_date', { ascending: true })
        .order('start_time', { ascending: true });
      if (fromQ) b = b.gte('lesson_date', fromQ);
      if (toQ) b = b.lte('lesson_date', toQ);
      return b;
    };

    /** Koç (ve koç+öğretmen): koç öğrencileri ∪ özel ders/sınıf kapsamı */
    if (actor.role === 'coach') {
      const tags = await actorRoleTagSet(actor);
      const idSet = new Set();
      if (actor.coach_id) {
        const { data: studs, error: se } = await supabaseAdmin
          .from('students')
          .select('id')
          .eq('coach_id', actor.coach_id);
        if (se) throw se;
        for (const s of studs || []) {
          if (s.id) idSet.add(String(s.id));
        }
      }
      if (tags.has('teacher') && actor.sub) {
        const { ids } = await getTeacherPanelStudentScope(actor.sub, actor.institution_id || null);
        for (const id of ids || []) idSet.add(String(id));
      }
      let studentIds = [...idSet];
      if (studentFilter) {
        if (!studentIds.includes(studentFilter)) {
          return res.status(200).json({ data: [] });
        }
        studentIds = [studentFilter];
      }

      const byLessonId = new Map();
      for (let i = 0; i < studentIds.length; i += COACH_STUDENT_IN_CHUNK) {
        const slice = studentIds.slice(i, i + COACH_STUDENT_IN_CHUNK);
        let cq = teacherLessonsBaseSelect().in('student_id', slice);
        if (platformFilter) cq = cq.eq('platform', platformFilter);
        const { data: part, error: pe } = await cq;
        if (pe) {
          if (isTeacherLessonsRelationMissingError(pe)) {
            return res.status(200).json({ data: [], hint: 'teacher_lessons_sql_missing' });
          }
          return respondSupabaseError(res, pe);
        }
        for (const row of part || []) byLessonId.set(String(row.id), row);
      }
      // Koç+öğretmen: kendi teacher_id ile oluşturduğu dersler
      if (tags.has('teacher') && actor.sub) {
        let tq = teacherLessonsBaseSelect().eq('teacher_id', actor.sub);
        if (platformFilter) tq = tq.eq('platform', platformFilter);
        if (studentFilter) tq = tq.eq('student_id', studentFilter);
        const { data: own, error: oe } = await tq;
        if (oe) {
          if (isTeacherLessonsRelationMissingError(oe)) {
            return res.status(200).json({ data: [], hint: 'teacher_lessons_sql_missing' });
          }
          return respondSupabaseError(res, oe);
        }
        for (const row of own || []) byLessonId.set(String(row.id), row);
      }
      const merged = [...byLessonId.values()];
      merged.sort((a, b) => {
        const da = String(a.lesson_date || '').localeCompare(String(b.lesson_date || ''));
        if (da !== 0) return da;
        return String(a.start_time || '').localeCompare(String(b.start_time || ''));
      });
      const mapped = merged.map(mapRowToApi);
      return res.status(200).json({ data: enrichMeetingRowsJoinLink(await attachTeacherNamesToLessons(mapped), actor.role) });
    }

    let q = teacherLessonsBaseSelect();

    if (platformFilter) q = q.eq('platform', platformFilter);

    if (actor.role === 'student') {
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
          institutionId: userRow?.institution_id ?? null
        });
        if (resolved?.id) sid = String(resolved.id);
      }
      if (!sid) return jsonError(res, 403, 'student_profile_missing');
      q = q.eq('student_id', sid);
    } else if (actor.role === 'teacher') {
      q = q.eq('teacher_id', actor.sub);
      if (studentFilter) q = q.eq('student_id', studentFilter);
    } else if (actor.role === 'admin') {
      if (!actor.institution_id) return jsonError(res, 403, 'institution_missing');
      q = q.eq('institution_id', actor.institution_id);
      if (teacherFilter) q = q.eq('teacher_id', teacherFilter);
      if (studentFilter) q = q.eq('student_id', studentFilter);
    } else if (actor.role === 'super_admin') {
      if (teacherFilter) q = q.eq('teacher_id', teacherFilter);
      if (studentFilter) q = q.eq('student_id', studentFilter);
    } else {
      return jsonError(res, 403, 'forbidden');
    }

    const { data, error } = await q;
    if (error) {
      if (isTeacherLessonsRelationMissingError(error)) {
        return res.status(200).json({ data: [], hint: 'teacher_lessons_sql_missing' });
      }
      return respondSupabaseError(res, error);
    }

    const mapped = (data || []).map(mapRowToApi);
    return res.status(200).json({ data: enrichMeetingRowsJoinLink(await attachTeacherNamesToLessons(mapped), actor.role) });
  } catch (e) {
    const msg = errorMessage(e);
    if (isAuthFailureMessage(msg)) return jsonError(res, 401, msg);
    if (isTeacherLessonsBbbColumnsMissingError(e)) {
      return res.status(503).json(teacherLessonsBbbColumnsMissingBody());
    }
    return jsonError(res, 500, msg);
  }
}

/** Tamamlanan ders satırı için süre (dk): önce duration_minutes, yoksa başlangıç–bitiş. */
function completedLessonMinutes(row) {
  const dm = row.duration_minutes != null ? Number(row.duration_minutes) : NaN;
  if (!Number.isNaN(dm) && dm > 0) return dm;
  const start = String(row.start_time || '');
  const end = String(row.end_time || '');
  if (start && end) {
    const toSec = (t) => {
      const p = String(t).trim().split(':').map((x) => parseInt(x, 10));
      if (p.length >= 2 && !p.some((x) => Number.isNaN(x))) {
        return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
      }
      return null;
    };
    const a = toSec(start);
    const b = toSec(end);
    if (a != null && b != null && b >= a) return Math.round((b - a) / 60);
  }
  return 60;
}

/** Öğretmen × öğrenci tamamlanan ders toplam süresi (yönetici faturalama özeti). */
async function handleSummary(req, res) {
  if (req.method !== 'GET') return jsonError(res, 405, 'Method not allowed');
  try {
    const actor = requireAuthenticatedActor(req);
    if (actor.role !== 'admin' && actor.role !== 'super_admin') {
      return jsonError(res, 403, 'Bu özet yalnızca kurum yöneticisi ve süper yönetici için kullanılabilir.');
    }

    await syncTeacherLessonsScheduledToCompleted();

    const teacherFilter =
      typeof req.query?.teacher_id === 'string' && req.query.teacher_id.trim()
        ? req.query.teacher_id.trim()
        : null;
    const studentFilter =
      typeof req.query?.student_id === 'string' && req.query.student_id.trim()
        ? req.query.student_id.trim()
        : null;
    const fromQ =
      typeof req.query?.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from.trim())
        ? req.query.from.trim()
        : null;
    const toQ =
      typeof req.query?.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to.trim())
        ? req.query.to.trim()
        : null;

    let q = supabaseAdmin
      .from('teacher_lessons')
      .select('teacher_id, student_id, duration_minutes, start_time, end_time')
      .eq('status', 'completed');

    if (actor.role === 'admin') {
      if (!actor.institution_id) return jsonError(res, 403, 'institution_missing');
      q = q.eq('institution_id', actor.institution_id);
    }
    if (teacherFilter) q = q.eq('teacher_id', teacherFilter);
    if (studentFilter) q = q.eq('student_id', studentFilter);
    if (fromQ) q = q.gte('lesson_date', fromQ);
    if (toQ) q = q.lte('lesson_date', toQ);

    const { data, error } = await q;
    if (error) {
      if (isTeacherLessonsRelationMissingError(error)) {
        return res.status(200).json({ data: [], hint: 'teacher_lessons_sql_missing' });
      }
      return respondSupabaseError(res, error);
    }

    const agg = new Map();
    for (const row of data || []) {
      const key = `${row.teacher_id}|${row.student_id}`;
      const mins = completedLessonMinutes(row);
      const cur = agg.get(key) || {
        teacher_id: row.teacher_id,
        student_id: row.student_id,
        total_minutes: 0,
        completed_lesson_count: 0
      };
      cur.total_minutes += mins;
      cur.completed_lesson_count += 1;
      agg.set(key, cur);
    }

    const vals = [...agg.values()];
    const teacherIds = [...new Set(vals.map((x) => x.teacher_id))];
    const studentIds = [...new Set(vals.map((x) => x.student_id))];

    const teacherNames = {};
    if (teacherIds.length) {
      const { data: users } = await supabaseAdmin.from('users').select('id, name, email').in('id', teacherIds);
      for (const u of users || []) {
        teacherNames[u.id] = u.name || u.email || u.id;
      }
    }
    const studentNames = {};
    if (studentIds.length) {
      const { data: studs } = await supabaseAdmin.from('students').select('id, name').in('id', studentIds);
      for (const s of studs || []) {
        studentNames[s.id] = s.name || s.id;
      }
    }

    const rows = vals
      .map((r) => ({
        teacher_id: r.teacher_id,
        student_id: r.student_id,
        teacher_name: teacherNames[r.teacher_id] || r.teacher_id,
        student_name: studentNames[r.student_id] || r.student_id,
        total_minutes: r.total_minutes,
        total_hours: Math.round((r.total_minutes / 60) * 100) / 100,
        completed_lesson_count: r.completed_lesson_count
      }))
      .sort((a, b) => {
        const x = a.teacher_name.localeCompare(b.teacher_name, 'tr');
        if (x !== 0) return x;
        return a.student_name.localeCompare(b.student_name, 'tr');
      });

    return res.status(200).json({ data: rows });
  } catch (e) {
    const msg = errorMessage(e);
    if (isAuthFailureMessage(msg)) return jsonError(res, 401, msg);
    return jsonError(res, 500, msg);
  }
}

async function handleCreate(req, res) {
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');
  try {
    const actor = requireAuthenticatedActor(req);
    if (!['super_admin', 'admin', 'teacher', 'coach'].includes(actor.role)) {
      return jsonError(res, 403, 'Bu işlem için yetkiniz yok.');
    }

    const body = req.body || {};
    const studentId = String(body.student_id || '');
    const title = String(body.title || '').trim();
    const lessonDate = String(body.date || body.lesson_date || '').trim();
    const startTime = body.start_time || body.startTime;
    const durationMinutes = Number(body.duration_minutes || body.durationMinutes || 60);
    const manualMeetingLink = String(body.meeting_link || body.meetingLink || '').trim();
    const platformBody = body.platform ? String(body.platform).toLowerCase() : '';
    if (platformBody && !['bbb', 'zoom', 'meet', 'other'].includes(platformBody)) {
      return jsonError(res, 400, 'Geçersiz platform.');
    }

    if (!studentId || !title || !lessonDate || !startTime) {
      return jsonError(res, 400, 'student_id, title, date ve start_time zorunludur.');
    }

    const { data: student, error: stErr } = await supabaseAdmin
      .from('students')
      .select('*')
      .eq('id', studentId)
      .maybeSingle();
    if (stErr) throw stErr;
    if (!student) return jsonError(res, 404, 'Öğrenci bulunamadı.');

    if (!(await canPlanLessonForStudent(actor, student))) {
      return jsonError(res, 403, 'Bu öğrenci için ders planlayamazsınız.');
    }

    if (actor.role !== 'super_admin') {
      await assertStudentCoachLessonsUnlocked(studentId);
      if (actor.role === 'coach' && actor.coach_id) {
        await assertCoachLessonsMeetingsUnlocked(actor.coach_id);
      }
    }

    let teacherId = actor.sub;
    if (actor.role === 'super_admin' || actor.role === 'admin') {
      const forced = String(body.teacher_id || '').trim();
      if (forced) teacherId = forced;
    }
    if (!teacherId) return jsonError(res, 400, 'teacher_id çözülemedi.');

    if (actor.role === 'admin' && !hasInstitutionAccess(actor, student.institution_id)) {
      return jsonError(res, 403, 'Kurum dışı öğrenci.');
    }

    const { data: quotaRow, error: qErr } = await supabaseAdmin
      .from('student_teacher_lesson_quota')
      .select('credits_total')
      .eq('student_id', studentId)
      .eq('teacher_id', teacherId)
      .maybeSingle();
    if (qErr && !/does not exist|schema cache/i.test(errorMessage(qErr))) throw qErr;
    const quotaCap = quotaRow?.credits_total;
    const plannedMinutes = Math.max(15, Math.round(Number(durationMinutes) || 60));
    const newUnits = lessonUnitsFromDurationMinutes(plannedMinutes);

    let meetingLink;
    let meetingLinkModerator = null;
    let platform;
    let autoBbb = null;
    const resolved = await resolveTeacherLessonMeetingLink({
      manualLink: manualMeetingLink,
      title,
      studentName: student.name,
      teacherId,
      durationMinutes: plannedMinutes,
      meetingKeyPrefix: `teacherlesson${studentId}`
    });
    if (!resolved.ok) {
      return jsonError(res, resolved.code === 'bbb_create_failed' ? 502 : 400, resolved.error, {
        code: resolved.code
      });
    }
    meetingLink = resolved.meetingLink;
    meetingLinkModerator = resolved.meetingLinkModerator;
    platform = platformBody || resolved.platform;
    autoBbb = resolved.autoBbb;

    if (quotaCap != null) {
      const usedUnits = await sumLessonUnitsUsed(studentId, teacherId);
      if (usedUnits + newUnits > quotaCap) {
        return jsonError(res, 400, 'Bu öğretmen için paket birimi yetersiz (süreye göre gerekli birim kotayı aşıyor).', {
          code: 'lesson_quota_exceeded',
          details: { used_units: usedUnits, needed_units: newUnits, cap: quotaCap, duration_minutes: plannedMinutes }
        });
      }
    }

    const win = computeScheduledWindow(lessonDate, startTime, plannedMinutes);
    if ('error' in win) return jsonError(res, 400, win.error);

    const institutionId = student.institution_id || actor.institution_id || null;
    const conflict = await hasTeacherConflict({
      teacherId,
      lessonDate: win.lesson_date,
      startTime: win.start_time,
      endTime: win.end_time
    });
    if (conflict) {
      return jsonError(res, 409, 'Aynı öğretmen aynı saatte canlı özel ders alamaz.', { code: 'teacher_time_conflict' });
    }

    const insertPayload = {
      institution_id: institutionId,
      teacher_id: teacherId,
      student_id: studentId,
      title,
      lesson_date: win.lesson_date,
      start_time: win.start_time,
      end_time: win.end_time,
      meeting_link: meetingLink,
      ...(meetingLinkModerator ? { meeting_link_moderator: meetingLinkModerator } : {}),
      platform,
      status: 'scheduled',
      duration_minutes: win.duration_minutes
    };
    if (body.id) insertPayload.id = normalizeUuidOrGenerate(body.id);

    const { data: row, error: insErr } = await insertOneOptionalModerator('teacher_lessons', insertPayload);
    if (insErr) {
      if (isTeacherLessonsRelationMissingError(insErr)) {
        return res.status(503).json(teacherLessonsMissingBody());
      }
      const im = errorMessage(insErr);
      if (String(insErr?.code) === '23503' && /teacher_id|users/i.test(im)) {
        return res.status(400).json({
          error:
            'Öğretmen (teacher_id) veritabanındaki users tablosunda yok. Demo girişi kullanıyorsanız bir kez çıkıp tekrar giriş yapın; sunucu demo kullanıcıyı users tablosuna kaydeder. Aksi halde kullanıcı yönetiminde geçerli bir platform kullanıcısı seçin.',
          code: 'teacher_lessons_teacher_fk',
          details: im
        });
      }
      return respondSupabaseError(res, insErr);
    }

    await syncTeacherLessonsScheduledToCompleted();
    return res.status(200).json({ data: mapRowToApi(row), auto_bbb: autoBbb });
  } catch (e) {
    const msg = errorMessage(e);
    if (isAuthFailureMessage(msg)) return jsonError(res, 401, msg);
    return jsonError(res, 500, msg);
  }
}

/** Tekrarlayan canlı ders (7 veya 15 gün aralık, aynı bağlantı) */
async function handleCreateLessonSeries(req, res) {
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');
  try {
    const actor = requireAuthenticatedActor(req);
    if (!['super_admin', 'admin', 'teacher', 'coach'].includes(actor.role)) {
      return jsonError(res, 403, 'Bu işlem için yetkiniz yok.');
    }

    const body = req.body || {};
    const dayOfWeekRaw = body.day_of_week != null ? Number(body.day_of_week) : null;
    let intervalDays = Number(body.interval_days || body.intervalDays || 7);
    if (dayOfWeekRaw != null && Number.isInteger(dayOfWeekRaw) && dayOfWeekRaw >= 1 && dayOfWeekRaw <= 7) {
      intervalDays = 7;
    }
    const recurrenceUntil = String(body.recurrence_until || body.recurrence_until_date || '')
      .trim()
      .slice(0, 10);
    if (intervalDays !== 7 && intervalDays !== 15) {
      return jsonError(res, 400, 'interval_days 7 veya 15 olmalıdır.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(recurrenceUntil)) {
      return jsonError(res, 400, 'recurrence_until YYYY-MM-DD olmalıdır.');
    }

    const studentId = String(body.student_id || '');
    const title = String(body.title || '').trim();
    const lessonDate = String(body.date || body.lesson_date || '').trim();
    const startTime = body.start_time || body.startTime;
    const durationMinutes = Number(body.duration_minutes || body.durationMinutes || 60);
    const manualMeetingLink = String(body.meeting_link || body.meetingLink || '').trim();
    const platformBody = body.platform ? String(body.platform).toLowerCase() : '';
    if (platformBody && !['bbb', 'zoom', 'meet', 'other'].includes(platformBody)) {
      return jsonError(res, 400, 'Geçersiz platform.');
    }

    if (!studentId || !title || !lessonDate || !startTime) {
      return jsonError(res, 400, 'student_id, title, date ve start_time zorunludur.');
    }
    if (recurrenceUntil < lessonDate) {
      return jsonError(res, 400, 'Bitiş tarihi ilk dersten önce olamaz.');
    }

    const { data: student, error: stErr } = await supabaseAdmin
      .from('students')
      .select('*')
      .eq('id', studentId)
      .maybeSingle();
    if (stErr) throw stErr;
    if (!student) return jsonError(res, 404, 'Öğrenci bulunamadı.');
    if (!(await canPlanLessonForStudent(actor, student))) {
      return jsonError(res, 403, 'Bu öğrenci için ders planlayamazsınız.');
    }

    if (actor.role !== 'super_admin') {
      await assertStudentCoachLessonsUnlocked(studentId);
      if (actor.role === 'coach' && actor.coach_id) {
        await assertCoachLessonsMeetingsUnlocked(actor.coach_id);
      }
    }

    let teacherId = actor.sub;
    if (actor.role === 'super_admin' || actor.role === 'admin') {
      const forced = String(body.teacher_id || '').trim();
      if (forced) teacherId = forced;
    }
    if (!teacherId) return jsonError(res, 400, 'teacher_id çözülemedi.');

    if (actor.role === 'admin' && !hasInstitutionAccess(actor, student.institution_id)) {
      return jsonError(res, 403, 'Kurum dışı öğrenci.');
    }

    const plannedMinutes = Math.max(15, Math.round(Number(durationMinutes) || 60));

    let meetingLink;
    let meetingLinkModerator = null;
    let platform;
    let autoBbb = null;
    const resolved = await resolveTeacherLessonMeetingLink({
      manualLink: manualMeetingLink,
      title,
      studentName: student.name,
      teacherId,
      durationMinutes: plannedMinutes,
      meetingKeyPrefix: `teacherlessonseries${studentId}`
    });
    if (!resolved.ok) {
      return jsonError(res, resolved.code === 'bbb_create_failed' ? 502 : 400, resolved.error, {
        code: resolved.code
      });
    }
    meetingLink = resolved.meetingLink;
    meetingLinkModerator = resolved.meetingLinkModerator;
    platform = platformBody || resolved.platform;
    autoBbb = resolved.autoBbb;

    const { data: quotaRow, error: qErr } = await supabaseAdmin
      .from('student_teacher_lesson_quota')
      .select('credits_total')
      .eq('student_id', studentId)
      .eq('teacher_id', teacherId)
      .maybeSingle();
    if (qErr && !/does not exist|schema cache/i.test(errorMessage(qErr))) throw qErr;
    const quotaCap = quotaRow?.credits_total;
    const newUnits = lessonUnitsFromDurationMinutes(plannedMinutes);

    const win0 = computeScheduledWindow(lessonDate, startTime, plannedMinutes);
    if ('error' in win0) return jsonError(res, 400, win0.error);

    const dates = [];
    let cur = lessonDate;
    if (dayOfWeekRaw != null && Number.isInteger(dayOfWeekRaw) && dayOfWeekRaw >= 1 && dayOfWeekRaw <= 7) {
      const base = new Date(`${lessonDate}T12:00:00`);
      const jsDay = base.getDay() === 0 ? 7 : base.getDay();
      const diff = (dayOfWeekRaw - jsDay + 7) % 7;
      const aligned = new Date(base);
      aligned.setDate(aligned.getDate() + diff);
      cur = aligned.toISOString().slice(0, 10);
    }
    const maxN = 100;
    while (cur <= recurrenceUntil && dates.length < maxN) {
      dates.push(cur);
      const [y, mo, d] = cur.split('-').map(Number);
      const next = new Date(Date.UTC(y, mo - 1, d + intervalDays));
      cur = next.toISOString().slice(0, 10);
    }
    if (dates.length === 0) {
      return jsonError(res, 400, 'Bu aralıkta oturum yok.');
    }
    if (dates.length >= maxN) {
      return jsonError(res, 400, 'En fazla 99 tekrar; bitiş tarihını kısaltın.');
    }

    if (quotaCap != null) {
      const usedUnits = await sumLessonUnitsUsed(studentId, teacherId);
      if (usedUnits + newUnits * dates.length > quotaCap) {
        return jsonError(res, 400, 'Paket birimi bu tekrar sayısı için yetersiz.', {
          code: 'lesson_quota_exceeded',
          details: { used_units: usedUnits, needed_units: newUnits * dates.length, cap: quotaCap }
        });
      }
    }

    const institutionId = student.institution_id || actor.institution_id || null;
    const now = new Date().toISOString();

    const { data: seriesRow, error: serE } = await supabaseAdmin
      .from('teacher_lesson_series')
      .insert({
        institution_id: institutionId,
        teacher_id: teacherId,
        student_id: studentId,
        title,
        meeting_link: meetingLink,
        ...(meetingLinkModerator ? { meeting_link_moderator: meetingLinkModerator } : {}),
        platform,
        interval_days: intervalDays,
        duration_minutes: plannedMinutes,
        recurrence_until_date: recurrenceUntil,
        created_at: now
      })
      .select('id')
      .single();

    if (serE) {
      const sm = errorMessage(serE);
      if (/does not exist|42P01|schema cache/i.test(sm)) {
        return res.status(503).json({
          ...teacherLessonsMissingBody(),
          hint: 'teacher_lesson_series SQL: 2026-05-13-recurring-series.sql'
        });
      }
      throw serE;
    }

    const seriesId = seriesRow.id;
    const payloads = [];
    for (const d of dates) {
      const win = computeScheduledWindow(d, startTime, plannedMinutes);
      if ('error' in win) {
        await supabaseAdmin.from('teacher_lesson_series').delete().eq('id', seriesId);
        return jsonError(res, 400, win.error);
      }
      const conflict = await hasTeacherConflict({
        teacherId,
        lessonDate: win.lesson_date,
        startTime: win.start_time,
        endTime: win.end_time
      });
      if (conflict) {
        await supabaseAdmin.from('teacher_lesson_series').delete().eq('id', seriesId);
        return jsonError(res, 409, 'Seri oluşturulamadı: öğretmen takviminde saat çakışması var.', {
          code: 'teacher_time_conflict',
          details: { lesson_date: win.lesson_date, start_time: win.start_time, end_time: win.end_time }
        });
      }
      payloads.push({
        institution_id: institutionId,
        teacher_id: teacherId,
        student_id: studentId,
        title,
        lesson_date: win.lesson_date,
        start_time: win.start_time,
        end_time: win.end_time,
        meeting_link: meetingLink,
        ...(meetingLinkModerator ? { meeting_link_moderator: meetingLinkModerator } : {}),
        platform,
        status: 'scheduled',
        duration_minutes: win.duration_minutes,
        series_id: seriesId,
        created_at: now
      });
    }

    const { data: insRows, error: insE } = await insertManyOptionalModerator('teacher_lessons', payloads);
    if (insE) {
      await supabaseAdmin.from('teacher_lesson_series').delete().eq('id', seriesId);
      if (isTeacherLessonsRelationMissingError(insE)) {
        return res.status(503).json(teacherLessonsMissingBody());
      }
      return respondSupabaseError(res, insE);
    }

    await syncTeacherLessonsScheduledToCompleted();
    return res.status(200).json({
      data: {
        series_id: seriesId,
        count: (insRows || []).length,
        lessons: (insRows || []).map(mapRowToApi)
      },
      auto_bbb: autoBbb
    });
  } catch (e) {
    const msg = errorMessage(e);
    if (isAuthFailureMessage(msg)) return jsonError(res, 401, msg);
    return jsonError(res, 500, msg);
  }
}

async function handleDeleteLessonSeries(req, res) {
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');
  try {
    const actor = requireAuthenticatedActor(req);
    const body = req.body || {};
    const seriesId = String(body.series_id || '').trim();
    if (!seriesId) return jsonError(res, 400, 'series_id gerekli');

    const { data: s, error: se } = await supabaseAdmin
      .from('teacher_lesson_series')
      .select('id, teacher_id, institution_id, student_id')
      .eq('id', seriesId)
      .maybeSingle();
    if (se) throw se;
    if (!s) return jsonError(res, 404, 'Seri bulunamadı.');

    if (actor.role === 'student') return jsonError(res, 403, 'forbidden');
    if (actor.role === 'teacher' && s.teacher_id !== actor.sub) {
      return jsonError(res, 403, 'Bu seriyi silemezsiniz.');
    }
    if (actor.role === 'coach') {
      if (s.teacher_id === actor.sub) {
        /* ok */
      } else {
        const { data: stRow, error: ste } = await supabaseAdmin
          .from('students')
          .select('coach_id')
          .eq('id', s.student_id)
          .maybeSingle();
        if (ste) throw ste;
        if (!actor.coach_id || !stRow || stRow.coach_id !== actor.coach_id) {
          return jsonError(res, 403, 'Bu seriyi silemezsiniz.');
        }
      }
    } else if (actor.role === 'admin') {
      if (!hasInstitutionAccess(actor, s.institution_id)) return jsonError(res, 403, 'forbidden');
    } else if (actor.role !== 'super_admin') {
      return jsonError(res, 403, 'forbidden');
    }

    const { error: de } = await supabaseAdmin.from('teacher_lesson_series').delete().eq('id', seriesId);
    if (de) throw de;

    await syncTeacherLessonsScheduledToCompleted();
    return res.status(200).json({ ok: true, deleted_series_id: seriesId });
  } catch (e) {
    const msg = errorMessage(e);
    if (isAuthFailureMessage(msg)) return jsonError(res, 401, msg);
    return jsonError(res, 500, msg);
  }
}

async function handlePatch(req, res) {
  if (req.method !== 'PATCH' && req.method !== 'PUT') return jsonError(res, 405, 'Method not allowed');
  try {
    const actor = requireAuthenticatedActor(req);
    const body = req.body || {};
    const id = String(body.id || '');
    if (!id) return jsonError(res, 400, 'id gerekli');

    const { data: row, error: fErr } = await supabaseAdmin.from('teacher_lessons').select('*').eq('id', id).maybeSingle();
    if (fErr) {
      if (isTeacherLessonsRelationMissingError(fErr)) {
        return res.status(503).json(teacherLessonsMissingBody());
      }
      return respondSupabaseError(res, fErr);
    }
    if (!row) return jsonError(res, 404, 'Ders bulunamadı.');

    if (actor.role === 'student') {
      return jsonError(res, 403, 'forbidden');
    }
    if (actor.role === 'teacher') {
      if (row.teacher_id !== actor.sub) return jsonError(res, 403, 'Bu dersi güncelleyemezsiniz.');
    } else if (actor.role === 'coach') {
      if (row.teacher_id === actor.sub) {
        /* koç aynı zamanda platform öğretmeni */
      } else {
        const { data: stRow, error: ste } = await supabaseAdmin
          .from('students')
          .select('coach_id')
          .eq('id', row.student_id)
          .maybeSingle();
        if (ste) throw ste;
        if (!actor.coach_id || !stRow || stRow.coach_id !== actor.coach_id) {
          return jsonError(res, 403, 'Bu dersi güncelleyemezsiniz.');
        }
      }
    } else if (actor.role === 'admin') {
      if (!hasInstitutionAccess(actor, row.institution_id)) return jsonError(res, 403, 'forbidden');
    } else if (actor.role !== 'super_admin') {
      return jsonError(res, 403, 'forbidden');
    }

    let durationMinutesPatch = null;
    if (body.duration_minutes != null || body.durationMinutes != null) {
      const dm = Number(body.duration_minutes ?? body.durationMinutes);
      if (!Number.isNaN(dm)) durationMinutesPatch = Math.max(15, Math.round(dm));
    }

    const patch = {};
    const rawNewTeacher = body.teacher_id != null ? String(body.teacher_id).trim() : '';
    if (rawNewTeacher && rawNewTeacher !== String(row.teacher_id || '')) {
      if (actor.role === 'teacher') {
        return jsonError(res, 403, 'Öğretmeni değiştirmek için yönetici veya koç hesabı kullanın.');
      }
      if (row.status !== 'scheduled') {
        return jsonError(res, 400, 'Öğretmen yalnızca planlanmış derslerde değiştirilebilir.');
      }
      const { data: ntUser, error: ntErr } = await supabaseAdmin
        .from('users')
        .select('id, institution_id, role, coach_id')
        .eq('id', rawNewTeacher)
        .maybeSingle();
      if (ntErr) throw ntErr;
      if (!ntUser) return jsonError(res, 400, 'Seçilen öğretmen bulunamadı.');
      const ntRole = String(ntUser.role || '');
      if (!['teacher', 'coach', 'admin', 'super_admin'].includes(ntRole)) {
        return jsonError(res, 400, 'Bu kullanıcı öğretmen olarak atanamaz.');
      }
      const { data: studentForTeacher, error: stTe } = await supabaseAdmin
        .from('students')
        .select('*')
        .eq('id', row.student_id)
        .maybeSingle();
      if (stTe) throw stTe;
      if (!studentForTeacher) return jsonError(res, 400, 'Öğrenci kaydı bulunamadı.');
      const subActor = {
        sub: ntUser.id,
        role: ntRole,
        institution_id: ntUser.institution_id ?? null,
        coach_id: ntUser.coach_id ?? null
      };
      if (!(await canPlanLessonForStudent(subActor, studentForTeacher))) {
        return jsonError(res, 400, 'Seçilen kullanıcı bu öğrenciye özel ders atanamaz.');
      }
      patch.teacher_id = rawNewTeacher;
    }
    if (body.status && ['scheduled', 'completed', 'cancelled'].includes(String(body.status))) {
      patch.status = String(body.status);
    }
    if (typeof body.title === 'string') patch.title = body.title.trim();
    if (typeof body.meeting_link === 'string') {
      const manual = String(body.meeting_link || '').trim();
      const existing = String(row.meeting_link || '').trim();
      if (manual) {
        patch.meeting_link = manual;
        if (body.platform) {
          const p = String(body.platform).toLowerCase();
          if (['bbb', 'zoom', 'meet', 'other'].includes(p)) patch.platform = p;
        } else {
          patch.platform = detectPlatform(manual);
        }
      } else if (!existing) {
        const { data: studentRow } = await supabaseAdmin
          .from('students')
          .select('name')
          .eq('id', row.student_id)
          .maybeSingle();
        const resolved = await resolveTeacherLessonMeetingLink({
          manualLink: '',
          title: String((patch.title ?? row.title) || 'Canlı özel ders'),
          studentName: studentRow?.name,
          teacherId: String((patch.teacher_id ?? row.teacher_id) || ''),
          durationMinutes:
            durationMinutesPatch !== null
              ? durationMinutesPatch
              : row.duration_minutes != null
                ? Number(row.duration_minutes)
                : 60,
          meetingKeyPrefix: `teacherlessonpatch${row.id}`
        });
        if (!resolved.ok) {
          return jsonError(res, resolved.code === 'bbb_create_failed' ? 502 : 400, resolved.error, {
            code: resolved.code
          });
        }
        patch.meeting_link = resolved.meetingLink;
        if (resolved.meetingLinkModerator) {
          patch.meeting_link_moderator = resolved.meetingLinkModerator;
        }
        patch.platform = resolved.platform;
      }
    }
    if (typeof body.date === 'string' || typeof body.lesson_date === 'string') {
      patch.lesson_date = String(body.lesson_date || body.date).trim();
    }
    if (body.start_time != null) patch.start_time = normalizeTimeForParse(body.start_time);

    const wantsTimeChange =
      patch.lesson_date !== undefined ||
      patch.start_time !== undefined ||
      durationMinutesPatch !== null;

    if (wantsTimeChange) {
      if (row.status !== 'scheduled') {
        return jsonError(
          res,
          400,
          'Tarih, saat veya süre yalnızca planlanmış (henüz yapılmamış) derslerde değiştirilir.'
        );
      }
      const nextLessonDate = String(
        patch.lesson_date !== undefined ? patch.lesson_date : row.lesson_date
      ).trim();
      const nextStartRaw =
        patch.start_time !== undefined ? body.start_time ?? row.start_time : row.start_time;
      const nextDur =
        durationMinutesPatch !== null
          ? durationMinutesPatch
          : row.duration_minutes != null
            ? Number(row.duration_minutes)
            : 60;

      const win = computeScheduledWindow(nextLessonDate, nextStartRaw, nextDur);
      if ('error' in win) return jsonError(res, 400, win.error);
      patch.lesson_date = win.lesson_date;
      patch.start_time = win.start_time;
      patch.end_time = win.end_time;
      patch.duration_minutes = win.duration_minutes;
      const teacherForConflict =
        patch.teacher_id !== undefined ? String(patch.teacher_id) : String(row.teacher_id || '');
      const conflict = await hasTeacherConflict({
        teacherId: teacherForConflict,
        lessonDate: win.lesson_date,
        startTime: win.start_time,
        endTime: win.end_time,
        excludeId: id
      });
      if (conflict) {
        return jsonError(res, 409, 'Aynı öğretmen aynı saatte canlı özel ders alamaz.', { code: 'teacher_time_conflict' });
      }

      const teacherForQuota =
        patch.teacher_id !== undefined ? String(patch.teacher_id) : String(row.teacher_id || '');
      const { data: quotaRowT, error: qeT } = await supabaseAdmin
        .from('student_teacher_lesson_quota')
        .select('credits_total')
        .eq('student_id', row.student_id)
        .eq('teacher_id', teacherForQuota)
        .maybeSingle();
      if (qeT && !/does not exist|schema cache/i.test(errorMessage(qeT))) throw qeT;
      const quotaCapT = quotaRowT?.credits_total;
      if (quotaCapT != null) {
        const newUnits = lessonUnitsFromDurationMinutes(win.duration_minutes);
        const usedUnits = await sumLessonUnitsUsed(row.student_id, teacherForQuota);
        if (usedUnits + newUnits > quotaCapT) {
          return jsonError(res, 400, 'Bu öğretmen için paket birimi yetersiz (süreye göre).', {
            code: 'lesson_quota_exceeded'
          });
        }
      }
    } else if (
      patch.teacher_id !== undefined &&
      String(patch.teacher_id) !== String(row.teacher_id || '') &&
      row.status === 'scheduled'
    ) {
      const tId = String(patch.teacher_id);
      const conflictOnly = await hasTeacherConflict({
        teacherId: tId,
        lessonDate: String(row.lesson_date || '').trim(),
        startTime: String(row.start_time || ''),
        endTime: String(row.end_time || ''),
        excludeId: id
      });
      if (conflictOnly) {
        return jsonError(res, 409, 'Aynı öğretmen aynı saatte canlı özel ders alamaz.', { code: 'teacher_time_conflict' });
      }
    }

    if (Object.keys(patch).length === 0) return jsonError(res, 400, 'Güncellenecek alan yok.');

    const applyScope = String(body.apply_scope || body.applyScope || 'single').trim().toLowerCase();
    const seriesId = row.series_id ? String(row.series_id) : '';

    if (applyScope === 'series' && seriesId) {
      const seriesPatch = { ...patch };
      delete seriesPatch.lesson_date;

      const { data: peerRows, error: prErr } = await supabaseAdmin
        .from('teacher_lessons')
        .select('id,lesson_date,student_id,teacher_id,duration_minutes,start_time,end_time,status')
        .eq('series_id', seriesId)
        .eq('status', 'scheduled');
      if (prErr) {
        if (isTeacherLessonsRelationMissingError(prErr)) {
          return res.status(503).json(teacherLessonsMissingBody());
        }
        throw prErr;
      }
      const peers = peerRows || [];
      if (peers.length > 1) {
        if (seriesPatch.start_time || seriesPatch.end_time || seriesPatch.teacher_id || seriesPatch.duration_minutes) {
          for (const peer of peers) {
            const teacherForConflict = String(
              (seriesPatch.teacher_id ?? peer.teacher_id ?? row.teacher_id) || ''
            );
            const lessonDate = String(peer.lesson_date || '').trim();
            const startRaw =
              seriesPatch.start_time !== undefined ? body.start_time ?? peer.start_time : peer.start_time;
            const dur =
              seriesPatch.duration_minutes != null
                ? Number(seriesPatch.duration_minutes)
                : peer.duration_minutes != null
                  ? Number(peer.duration_minutes)
                  : 60;
            const win = computeScheduledWindow(lessonDate, startRaw, dur);
            if ('error' in win) return jsonError(res, 400, win.error);
            const conflict = await hasTeacherConflict({
              teacherId: teacherForConflict,
              lessonDate: win.lesson_date,
              startTime: win.start_time,
              endTime: win.end_time,
              excludeId: String(peer.id)
            });
            if (conflict) {
              return jsonError(res, 409, 'Aynı öğretmen aynı saatte canlı özel ders alamaz.', {
                code: 'teacher_time_conflict',
                lesson_date: win.lesson_date
              });
            }
          }
        }

        const peerIds = peers.map((p) => String(p.id)).filter(Boolean);
        const { data: batchUpdated, error: batchErr } = await supabaseAdmin
          .from('teacher_lessons')
          .update(seriesPatch)
          .in('id', peerIds)
          .select('*');
        if (batchErr) {
          if (isTeacherLessonsRelationMissingError(batchErr)) {
            return res.status(503).json(teacherLessonsMissingBody());
          }
          return respondSupabaseError(res, batchErr);
        }
        await syncTeacherLessonsScheduledToCompleted();
        const primary =
          (batchUpdated || []).find((r) => String(r.id) === id) || batchUpdated?.[0] || row;
        return res.status(200).json({
          data: mapRowToApi(primary),
          updated_count: batchUpdated?.length ?? peerIds.length,
          batch: true
        });
      }
    }

    const nextStatus = patch.status !== undefined ? String(patch.status) : row.status;
    const wasActive = ['scheduled', 'completed'].includes(row.status);
    const willBeActive = ['scheduled', 'completed'].includes(nextStatus);
    const gainsSlot = !wasActive && willBeActive;

    if (gainsSlot) {
      const quotaTeacherId =
        patch.teacher_id !== undefined ? String(patch.teacher_id) : String(row.teacher_id || '');
      const { data: quotaRow, error: qe } = await supabaseAdmin
        .from('student_teacher_lesson_quota')
        .select('credits_total')
        .eq('student_id', row.student_id)
        .eq('teacher_id', quotaTeacherId)
        .maybeSingle();
      if (qe && !/does not exist|schema cache/i.test(errorMessage(qe))) throw qe;
      const quotaCap = quotaRow?.credits_total;
      if (quotaCap != null) {
        const dm = row.duration_minutes != null ? Number(row.duration_minutes) : 60;
        const needUnits = lessonUnitsFromDurationMinutes(dm);
        const usedUnits = await sumLessonUnitsUsed(row.student_id, quotaTeacherId);
        if (usedUnits + needUnits > quotaCap) {
          return jsonError(res, 400, 'Bu öğretmen için paket birimi yetersiz.', {
            code: 'lesson_quota_exceeded',
            details: { used_units: usedUnits, needed_units: needUnits, cap: quotaCap }
          });
        }
      }
    }

    const { data: updated, error: uErr } = await supabaseAdmin
      .from('teacher_lessons')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (uErr) {
      if (isTeacherLessonsRelationMissingError(uErr)) {
        return res.status(503).json(teacherLessonsMissingBody());
      }
      return respondSupabaseError(res, uErr);
    }

    await syncTeacherLessonsScheduledToCompleted();
    return res.status(200).json({ data: mapRowToApi(updated) });
  } catch (e) {
    const msg = errorMessage(e);
    if (isAuthFailureMessage(msg)) return jsonError(res, 401, msg);
    return jsonError(res, 500, msg);
  }
}

async function handleDelete(req, res) {
  if (req.method !== 'DELETE') return jsonError(res, 405, 'Method not allowed');
  try {
    const actor = requireAuthenticatedActor(req);
    const rawId =
      typeof req.query?.id === 'string'
        ? req.query.id
        : req.body && typeof req.body === 'object' && req.body.id != null
          ? req.body.id
          : '';
    const id = String(rawId || '').trim();
    if (!id) return jsonError(res, 400, 'id gerekli (?id= veya JSON gövde).');

    const { data: row, error: fErr } = await supabaseAdmin.from('teacher_lessons').select('*').eq('id', id).maybeSingle();
    if (fErr) {
      if (isTeacherLessonsRelationMissingError(fErr)) {
        return res.status(503).json(teacherLessonsMissingBody());
      }
      return respondSupabaseError(res, fErr);
    }
    if (!row) return jsonError(res, 404, 'Ders bulunamadı.');

    if (actor.role === 'student') {
      return jsonError(res, 403, 'forbidden');
    }
    if (actor.role === 'teacher') {
      if (row.teacher_id !== actor.sub) return jsonError(res, 403, 'Bu dersi silemezsiniz.');
    } else if (actor.role === 'coach') {
      if (row.teacher_id === actor.sub) {
        /* ok */
      } else {
        const { data: stRow, error: ste } = await supabaseAdmin
          .from('students')
          .select('coach_id')
          .eq('id', row.student_id)
          .maybeSingle();
        if (ste) throw ste;
        if (!actor.coach_id || !stRow || stRow.coach_id !== actor.coach_id) {
          return jsonError(res, 403, 'Bu dersi silemezsiniz.');
        }
      }
    } else if (actor.role === 'admin') {
      if (!hasInstitutionAccess(actor, row.institution_id)) return jsonError(res, 403, 'forbidden');
    } else if (actor.role !== 'super_admin') {
      return jsonError(res, 403, 'forbidden');
    }

    const applyScope = String(req.query.apply_scope || req.query.applyScope || 'single')
      .trim()
      .toLowerCase();
    const seriesId = row.series_id ? String(row.series_id) : '';
    if (applyScope === 'series' && seriesId) {
      const { data: peerRows, error: prErr } = await supabaseAdmin
        .from('teacher_lessons')
        .select('id')
        .eq('series_id', seriesId)
        .eq('status', 'scheduled');
      if (prErr) {
        if (isTeacherLessonsRelationMissingError(prErr)) {
          return res.status(503).json(teacherLessonsMissingBody());
        }
        throw prErr;
      }
      const peerIds = (peerRows || []).map((p) => String(p.id)).filter(Boolean);
      if (peerIds.length > 1) {
        const { error: batchDelErr } = await supabaseAdmin.from('teacher_lessons').delete().in('id', peerIds);
        if (batchDelErr) {
          if (isTeacherLessonsRelationMissingError(batchDelErr)) {
            return res.status(503).json(teacherLessonsMissingBody());
          }
          return respondSupabaseError(res, batchDelErr);
        }
        await syncTeacherLessonsScheduledToCompleted();
        return res.status(200).json({ ok: true, deleted_count: peerIds.length, batch: true });
      }
    }

    const { error: delErr } = await supabaseAdmin.from('teacher_lessons').delete().eq('id', id);
    if (delErr) {
      if (isTeacherLessonsRelationMissingError(delErr)) {
        return res.status(503).json(teacherLessonsMissingBody());
      }
      return respondSupabaseError(res, delErr);
    }

    await syncTeacherLessonsScheduledToCompleted();
    return res.status(200).json({ ok: true });
  } catch (e) {
    const msg = errorMessage(e);
    if (isAuthFailureMessage(msg)) return jsonError(res, 401, msg);
    return jsonError(res, 500, msg);
  }
}

async function canAccessTeacherLesson(actor, row) {
  if (actor.role === 'super_admin') return true;
  if (actor.role === 'teacher' || actor.role === 'coach') {
    return String(row.teacher_id || '') === String(actor.sub || '');
  }
  if (actor.role === 'student') {
    const sid = actor.student_id || null;
    if (!sid && actor.sub) {
      const resolved = await resolveStudentRowForUser(actor.sub, actor.institution_id);
      if (resolved?.id) return String(row.student_id) === String(resolved.id);
    }
    return sid && String(row.student_id) === String(sid);
  }
  if (actor.role === 'admin') return hasInstitutionAccess(actor, row.institution_id);
  return false;
}

async function resolveTeacherStaffBbbJoinUrl(actor, row, ensured) {
  const actorName = String(actor.name || actor.email || 'Öğretmen').trim().slice(0, 64);
  const meetingId =
    String(row.bbb_meeting_id || ensured.meetingId || '').trim() ||
    parseBbbMeetingIdFromJoinUrl(String(ensured.moderatorLink || row.meeting_link_moderator || '')) ||
    parseBbbMeetingIdFromJoinUrl(String(ensured.attendeeLink || row.meeting_link || '')) ||
    '';
  const modPw =
    String(ensured.moderatorPW || '').trim() ||
    parseBbbPasswordFromJoinUrl(String(ensured.moderatorLink || row.meeting_link_moderator || '')) ||
    '';
  const attendeePw =
    String(row.bbb_attendee_pw || ensured.attendeePW || '').trim() ||
    parseBbbJoinCredentials(String(ensured.attendeeLink || row.meeting_link || ''))?.attendeePassword ||
    '';
  return buildStaffBbbJoinUrl({
    actorName,
    meetingId,
    moderatorPassword: modPw,
    attendeePassword: attendeePw,
    preferModerator: true
  });
}

async function handleTeacherLessonBbbJoin(req, res) {
  return handleBbbJoinGet(req, res, {
    loadRow: async (id) => {
      const { data, error } = await supabaseAdmin.from('teacher_lessons').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data;
    },
    canAccess: canAccessTeacherLesson,
    getLinks: (row) => ({
      attendeeLink: String(row.meeting_link || ''),
      moderatorLink: row.meeting_link_moderator ? String(row.meeting_link_moderator) : null
    }),
    buildContext: async (row) => {
      const { data: student } = await supabaseAdmin
        .from('students')
        .select('name')
        .eq('id', row.student_id)
        .maybeSingle();
      const teacherName = await userDisplayName(String(row.teacher_id || ''), 'Öğretmen');
      return {
        meetingName: String(row.title || 'Canlı özel ders'),
        attendeeName: String(student?.name || 'Öğrenci'),
        moderatorName: teacherName,
        durationMinutes: Number(row.duration_minutes) || 60,
        meetingKeyPrefix: `tljoin${String(row.id || '').replace(/-/g, '')}`
      };
    },
    patchLinks: (id, links) =>
      patchRowMeetingLinks('teacher_lessons', id, {
        meeting_link: links.meeting_link,
        meeting_link_moderator: links.meeting_link_moderator,
        bbb_meeting_id: links.bbb_meeting_id,
        bbb_attendee_pw: links.bbb_attendee_pw
      }),
    resolveStaffJoinUrl: async (act, row, ensured) => resolveTeacherStaffBbbJoinUrl(act, row, ensured)
  });
}

async function handleTeacherLessonBbbRecording(req, res) {
  return handleBbbRecordingGet(req, res, {
    loadRow: async (id) => {
      const { data, error } = await supabaseAdmin.from('teacher_lessons').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data;
    },
    canAccess: canAccessTeacherLesson,
    patchRecordingLink: (id, playbackUrl) => patchRowRecordingLink('teacher_lessons', id, playbackUrl),
    getMeetingKeyPrefix: (row) => `tljoin${String(row.id || '').replace(/-/g, '')}`
  });
}

async function handleTeacherGuestJoinLink(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch (e) {
    return jsonError(res, 401, errorMessage(e) || 'Missing token');
  }
  if (actor.role === 'student') return jsonError(res, 403, 'Yetkiniz yok');
  const id = String(req.query?.id || '').trim();
  if (!id) return jsonError(res, 400, 'id gerekli');
  const { data: row, error } = await supabaseAdmin.from('teacher_lessons').select('*').eq('id', id).maybeSingle();
  if (error) return jsonError(res, 500, errorMessage(error));
  if (!row) return jsonError(res, 404, 'Kayıt bulunamadı');
  if (!(await canAccessTeacherLesson(actor, row))) return jsonError(res, 403, 'Yetkiniz yok');
  try {
    const link = await createGuestJoinShareLink({ kind: 'private', id });
    return res.status(200).json({ ok: true, ...link });
  } catch (e) {
    return jsonError(res, 400, errorMessage(e));
  }
}

export default async function handler(req, res) {
  const op = typeof req.query?.op === 'string' ? req.query.op.trim() : '';
  if (req.method === 'GET') {
    if (op === 'summary') return handleSummary(req, res);
    if (op === 'bbb-join') return handleTeacherLessonBbbJoin(req, res);
    if (op === 'bbb-recording') return handleTeacherLessonBbbRecording(req, res);
    if (op === 'guest-join-link') return handleTeacherGuestJoinLink(req, res);
    return handleList(req, res);
  }
  if (req.method === 'POST') {
    if (op === 'create-series') return handleCreateLessonSeries(req, res);
    if (op === 'delete-series') return handleDeleteLessonSeries(req, res);
    return handleCreate(req, res);
  }
  if (req.method === 'PATCH' || req.method === 'PUT') return handlePatch(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);
  return jsonError(res, 405, 'Method not allowed');
}
