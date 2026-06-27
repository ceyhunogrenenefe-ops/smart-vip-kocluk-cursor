import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { enrichStudentActor } from '../api/_lib/enrich-student-actor.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { getIstanbulDateString, addCalendarDaysYmd } from '../api/_lib/istanbul-time.js';
import { normalizePhoneToE164 } from '../api/_lib/phone-whatsapp.js';
import { normalizedUserRolesFromDb } from '../api/_lib/user-roles-fetch.js';
import { getTeacherGroupClassStudentScope } from '../api/_lib/teacher-class-scope.js';
import { getTemplateBindingKeys } from '../api/_lib/whatsapp-outbound.js';
import {
  istanbulDayUtcRange,
  countMessageStats,
  templateTelemetry,
  cronVisualState,
  aggregateCronToday,
  kindLabelTr
} from '../api/_lib/whatsapp-center-stats.js';
import { summarizeUnsentClassSessions } from '../api/_lib/class-lesson-reminder-logic.js';

/** Panel — `cron_run_log.job_key`; ek kayıtlar otomatik birleştirilir */
export const TEMPLATE_TYPE_TO_CRON_JOB_KEY = {
  lesson_reminder: 'lesson_reminders',
  lesson_reminder_parent: 'lesson_reminder_parent',
  report_reminder: 'daily_report_reminder',
  report_reminder_parent: 'daily_report_reminder',
  class_lesson_reminder: 'class_lesson_reminders',
  teacher_lesson_reminder: 'teacher_lesson_reminders',
  class_homework_notice: 'class_homework_notify',
  meeting_notification: 'meeting_reminders',
  /** Grup yoklaması devamsızlık — anlık gönderim mark-attendance; cron yalnızca başarısız yeniden deneme */
  class_absent_notice_1: 'absent_student_notification',
  /** Kitap siparişi — onayda anlık gönderim; cron yalnızca pending yedek */
  kitap_siparis_bildirim: 'book_orders',
  veli_kayit_admin_notify: 'veli_kayit_admin_notify'
};

export const KNOWN_CRON_JOBS = [
  { key: 'class_lesson_reminders', label: 'Grup dersi hatırlatma (~10 dk önce · gateway)', expectEveryMinutes: 5 },
  { key: 'teacher_lesson_reminders', label: 'Öğretmen ders hatırlatması (~15 dk önce · gateway)', expectEveryMinutes: 5 },
  { key: 'daily_report_reminder', label: 'Günlük rapor hatırlatması (22:00 TR · gateway)', expectEveryMinutes: 24 * 60 },
  { key: 'lesson_reminders', label: 'Birebir ders hatırlatma (~10 dk önce · gateway)', expectEveryMinutes: 5 },
  { key: 'lesson_reminder_parent', label: 'Veli ders hatırlatma (gateway)', expectEveryMinutes: 5 },
  { key: 'meeting_reminders', label: 'Görüşme 10 dk hatırlatma (Meta)', expectEveryMinutes: 5 },
  { key: 'class_homework_notify', label: 'Grup ödev bildirimi', expectEveryMinutes: 10 },
  { key: 'coach_followup', label: 'Koç otomasyon (Meta şablon)', expectEveryMinutes: 15 },
  { key: 'study_evening_reminder', label: 'Akşam çalışma hatırlatması', expectEveryMinutes: 24 * 60 },
  { key: 'absent_student_notification', label: 'Devamsızlık bildirimi (anlık + başarısız yeniden deneme)', expectEveryMinutes: 15 },
  { key: 'book_orders', label: 'Kitap siparişi — yalnızca başarısız WhatsApp yeniden deneme (onay anında)', expectEveryMinutes: 15 },
  { key: 'veli_kayit_admin_notify', label: 'Yeni kayıt formu — admin Meta bildirimi (retry)', expectEveryMinutes: 10 }
];

function templateTypesForCronJobKey(jobKey) {
  const k = String(jobKey || '').trim();
  const types = new Set([k]);
  for (const [tplType, jk] of Object.entries(TEMPLATE_TYPE_TO_CRON_JOB_KEY)) {
    if (jk === k) types.add(tplType);
  }
  return [...types];
}

function cronLabelForJobKey(jobKey, tplRows) {
  for (const tp of templateTypesForCronJobKey(jobKey)) {
    const t = (tplRows || []).find((x) => String(x.type || '') === tp);
    if (t?.name) return `${String(t.name).trim()} (${jobKey})`;
  }
  const nice = String(jobKey).replace(/_/g, ' ');
  return nice ? nice.charAt(0).toUpperCase() + nice.slice(1) : jobKey;
}

function expectMinutesFromCronDetail(lastRow) {
  const d = lastRow?.detail;
  if (d && typeof d === 'object' && typeof d.expect_every_minutes === 'number' && d.expect_every_minutes > 0) {
    return d.expect_every_minutes;
  }
  return null;
}

function buildCronStatusDefinitions(latestByJob, tplRows) {
  const rows = [];
  const seen = new Set();
  for (const def of KNOWN_CRON_JOBS) {
    seen.add(def.key);
    rows.push({ ...def });
  }
  const extraKeys = [...latestByJob.keys()].filter((k) => !seen.has(k)).sort();
  for (const key of extraKeys) {
    seen.add(key);
    const last = latestByJob.get(key);
    rows.push({
      key,
      label: cronLabelForJobKey(key, tplRows),
      expectEveryMinutes: expectMinutesFromCronDetail(last) ?? 60,
      discovered_from_logs: true
    });
  }
  const pending = [];
  for (const t of tplRows || []) {
    if (t.is_active === false) continue;
    if (!String(t.meta_template_name || '').trim()) continue;
    const typ = String(t.type || '').trim();
    if (!typ) continue;
    const jobKey = TEMPLATE_TYPE_TO_CRON_JOB_KEY[typ] || typ;
    if (seen.has(jobKey)) continue;
    seen.add(jobKey);
    pending.push({
      key: jobKey,
      label: `${String(t.name || typ).trim()} — ilk cron kaydı bekleniyor`,
      expectEveryMinutes: 60,
      awaiting_first_run: true
    });
  }
  pending.sort((a, b) => a.key.localeCompare(b.key));
  return [...rows, ...pending];
}

function parseLogErrorCode(errorText) {
  const s = String(errorText || '').trim();
  if (!s) return null;
  const low = s.toLowerCase();
  if (low.startsWith('template_not_found')) return 'template_not_found';
  if (low.startsWith('meta_template_name_required')) return 'meta_template_name_required';
  if (low.startsWith('invalid_phone')) return 'invalid_phone';
  if (low.startsWith('meta_send_failed')) return 'meta_send_failed';
  const cut = s.split(':')[0].trim();
  if (
    ['template_not_found', 'meta_template_name_required', 'invalid_phone', 'meta_send_failed'].includes(
      cut
    )
  )
    return cut;
  return null;
}

function applyMessageLogScope(query, { mode, scopedStudentIds, students, isSuper, institutionId }) {
  if (mode === 'scoped') {
    if (scopedStudentIds?.length) return query.in('student_id', scopedStudentIds);
    return query.eq('student_id', '__none__');
  }
  if (!isSuper && institutionId) {
    const ids = students.map((s) => s.id);
    if (ids.length) return query.in('student_id', ids);
    return query.eq('student_id', '__none__');
  }
  return query;
}

function studentPhoneIssues(st) {
  const rawS = String(st.phone || '').trim();
  const rawP = String(st.parent_phone || '').trim();
  const normS = normalizePhoneToE164(st.phone);
  const normP = normalizePhoneToE164(st.parent_phone);
  const issues = [];
  if (!rawS) issues.push('Öğrenci telefonu eksik');
  else if (!normS) issues.push('Öğrenci telefonu format hatası (+90 / 10 hane)');
  if (!rawP) issues.push('Veli telefonu eksik');
  else if (!normP) issues.push('Veli telefonu format hatası');
  return {
    student_ok: Boolean(normS),
    parent_ok: Boolean(normP),
    any_ok: Boolean(normS || normP),
    issues
  };
}

function recipientLabel(student, logPhone) {
  const lp = normalizePhoneToE164(logPhone);
  if (!lp) return '—';
  const ps = normalizePhoneToE164(student?.phone);
  const pp = normalizePhoneToE164(student?.parent_phone);
  if (ps && lp === ps) return 'Öğrenci';
  if (pp && lp === pp) return 'Veli';
  return 'Alıcı';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }
  actor = await enrichStudentActor(actor);
  const roles = await normalizedUserRolesFromDb(actor.sub);
  const roleSet = new Set(roles.map((r) => String(r || '').toLowerCase()));

  const isSuper = roleSet.has('super_admin');
  const isAdmin = roleSet.has('admin');
  const isCoach = roleSet.has('coach');
  const isTeacher = roleSet.has('teacher');

  if (!isSuper && !isAdmin && !isCoach && !isTeacher) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const mode = isSuper || isAdmin ? 'admin' : 'scoped';
  const institutionId = actor.institution_id || null;

  let scopedStudentIds = null;
  if (mode === 'scoped') {
    const idSet = new Set();
    const cid = actor.coach_id || null;
    if (isCoach && cid) {
      const { data } = await supabaseAdmin.from('students').select('id').eq('coach_id', cid);
      (data || []).forEach((r) => idSet.add(r.id));
    }
    if (isTeacher && actor.sub) {
      const { ids } = await getTeacherGroupClassStudentScope(actor.sub);
      (ids || []).forEach((id) => idSet.add(String(id)));
    }
    scopedStudentIds = [...idSet];
  }

  const sinceParam = String(req.query.since || '').trim();

  try {
    let studentQuery = supabaseAdmin
      .from('students')
      .select('id,name,phone,parent_phone,coach_id,institution_id');
    if (mode === 'admin') {
      if (!isSuper && institutionId) studentQuery = studentQuery.eq('institution_id', institutionId);
    } else if (scopedStudentIds?.length) {
      studentQuery = studentQuery.in('id', scopedStudentIds);
    } else {
      studentQuery = studentQuery.eq('id', '__no_student__');
    }
    const { data: studentsRows, error: stErr } = await studentQuery.limit(8000);
    if (stErr) throw stErr;
    const students = studentsRows || [];
    const studentById = new Map(students.map((s) => [s.id, s]));

    let coachById = new Map();
    if (students.length) {
      const coachIds = [...new Set(students.map((s) => s.coach_id).filter(Boolean))];
      if (coachIds.length) {
        const { data: coaches } = await supabaseAdmin.from('coaches').select('id,name').in('id', coachIds);
        coachById = new Map((coaches || []).map((c) => [c.id, c.name]));
      }
    }

    let missingPhone = 0;
    for (const s of students) {
      const p = studentPhoneIssues(s);
      if (!p.any_ok) missingPhone += 1;
    }

    const today = getIstanbulDateString();
    const { startIso, endExclusiveIso } = istanbulDayUtcRange(today);
    const scopeCtx = { mode, scopedStudentIds, students, isSuper, institutionId };
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    let logQuery = supabaseAdmin
      .from('message_logs')
      .select(
        'id,student_id,kind,related_id,message,status,sent_at,log_date,error,phone,meta_template_name,twilio_error_code'
      )
      .order('sent_at', { ascending: false })
      .limit(mode === 'admin' ? 500 : 250);

    logQuery = applyMessageLogScope(logQuery, scopeCtx);

    if (sinceParam) {
      logQuery = logQuery.gt('sent_at', sinceParam);
    }

    const { data: rawLogs, error: logErr } = await logQuery;
    if (logErr) throw logErr;
    const logs = rawLogs || [];

    let sentToday = 0;
    let failedToday = 0;
    let sent7d = 0;
    let failed7d = 0;
    let pendingMessagesToday = 0;

    if (sinceParam === '') {
      let cSent = supabaseAdmin
        .from('message_logs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'sent')
        .gte('sent_at', startIso)
        .lt('sent_at', endExclusiveIso)
        .neq('kind', 'template_test');
      let cFail = supabaseAdmin
        .from('message_logs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gte('sent_at', startIso)
        .lt('sent_at', endExclusiveIso)
        .neq('kind', 'template_test');
      let cPending = supabaseAdmin
        .from('message_logs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .gte('sent_at', startIso)
        .lt('sent_at', endExclusiveIso)
        .neq('kind', 'template_test');
      let stats7 = supabaseAdmin
        .from('message_logs')
        .select('kind,status,sent_at,log_date,error,twilio_error_code')
        .gte('sent_at', sevenDaysAgo)
        .neq('kind', 'template_test')
        .order('sent_at', { ascending: false })
        .limit(mode === 'admin' ? 20000 : 8000);

      cSent = applyMessageLogScope(cSent, scopeCtx);
      cFail = applyMessageLogScope(cFail, scopeCtx);
      cPending = applyMessageLogScope(cPending, scopeCtx);
      stats7 = applyMessageLogScope(stats7, scopeCtx);

      const [{ count: sc }, { count: fc }, { count: pc }, stats7Res] = await Promise.all([
        cSent,
        cFail,
        cPending,
        stats7
      ]);
      sentToday = sc ?? 0;
      failedToday = fc ?? 0;
      pendingMessagesToday = pc ?? 0;
      const weekCounts = countMessageStats(stats7Res.data || [], today);
      sent7d = weekCounts.sent7d;
      failed7d = weekCounts.failed7d;
    } else {
      const dayCounts = countMessageStats(logs, today);
      sentToday = dayCounts.sentToday;
      failedToday = dayCounts.failedToday;
      sent7d = dayCounts.sent7d;
      failed7d = dayCounts.failed7d;
    }

    const { data: tplRows } = await supabaseAdmin
      .from('message_templates')
      .select('*')
      .order('type', { ascending: true });

    let cronRows = [];
    let cronTableMissing = false;
    const cronRes = await supabaseAdmin
      .from('cron_run_log')
      .select('job_key,ran_at,ok,skipped,messages_sent,messages_failed,detail')
      .order('ran_at', { ascending: false })
      .limit(2000);
    if (cronRes.error) {
      cronTableMissing = /does not exist|relation/i.test(cronRes.error.message || '');
      if (!cronTableMissing) throw cronRes.error;
    } else {
      cronRows = cronRes.data || [];
    }

    const latestByJob = new Map();
    for (const row of cronRows) {
      const k = row.job_key;
      if (!latestByJob.has(k)) latestByJob.set(k, row);
    }

    const cronTodayAgg = aggregateCronToday(cronRows, today);

    const { data: cronFailRows } = cronTableMissing
      ? { data: [] }
      : await supabaseAdmin
          .from('cron_run_log')
          .select('job_key,ran_at,ok,skipped,detail,messages_failed')
          .or('ok.eq.false,messages_failed.gt.0')
          .order('ran_at', { ascending: false })
          .limit(25);

    const cron_recent_errors = (cronFailRows || []).map((r) => {
      const d = r.detail && typeof r.detail === 'object' ? r.detail : {};
      const err =
        typeof d.error === 'string'
          ? d.error
          : d.error != null
            ? JSON.stringify(d.error)
            : null;
      return {
        job_key: r.job_key,
        at: r.ran_at,
        skipped: r.skipped || null,
        messages_failed: r.messages_failed ?? 0,
        error: err || (r.skipped ? String(r.skipped) : 'cron_failed')
      };
    });

    const nowMs = Date.now();
    const cronDefs = buildCronStatusDefinitions(latestByJob, tplRows || []);
    const cron_status = cronDefs.map((def) => {
      const last = latestByJob.get(def.key);
      const vis = cronVisualState(def, last, nowMs, today);
      const dayAgg = cronTodayAgg.get(def.key);
      return {
        key: def.key,
        label: def.label,
        expectEveryMinutes: def.expectEveryMinutes,
        awaiting_first_run: Boolean(def.awaiting_first_run),
        discovered_from_logs: Boolean(def.discovered_from_logs),
        last_run_at: last?.ran_at || null,
        last_ok: last ? last.ok : null,
        last_skipped: last?.skipped || null,
        messages_sent: last?.messages_sent ?? 0,
        messages_failed: last?.messages_failed ?? 0,
        runs_today: dayAgg?.runs ?? 0,
        messages_sent_today: dayAgg?.sent ?? 0,
        messages_failed_today: dayAgg?.failed ?? 0,
        last_skip_today: dayAgg?.last_skip ?? null,
        age_minutes: vis.age_minutes,
        state: vis.state
      };
    });

    let statsPool = [];
    if (sinceParam === '' && mode === 'admin') {
      let poolQ = supabaseAdmin
        .from('message_logs')
        .select('kind,status,sent_at,meta_template_name,log_date,error,twilio_error_code')
        .gte('sent_at', sevenDaysAgo)
        .neq('kind', 'template_test')
        .order('sent_at', { ascending: false })
        .limit(20000);
      poolQ = applyMessageLogScope(poolQ, scopeCtx);
      const poolRes = await poolQ;
      statsPool = poolRes.data || [];
    }

    const templates_detailed =
      mode === 'admin'
        ? (tplRows || []).map((t) => {
            const base = templateTelemetry(t, statsPool, today);
            const bindingKeys = getTemplateBindingKeys(t);
            const varsArr = Array.isArray(t.variables)
              ? t.variables.map((x) => String(x || '').trim()).filter(Boolean)
              : [];
            return { ...base, binding_keys: bindingKeys, variables: varsArr };
          })
        : [];

    const active_templates_count = (tplRows || []).filter(
      (t) => t.is_active !== false && String(t.meta_template_name || '').trim()
    ).length;

    /** lesson_date İstanbul takvim günü; hatırlatma ders başlamadan 10 dk önce gider */
    const todayIst = getIstanbulDateString();
    const upcomingIso = addCalendarDaysYmd(todayIst, 2);
    let pendingSessions = 0;
    let pendingDueNow = 0;
    let pendingWaiting = 0;
    let pendingMissed = 0;
    if (mode === 'admin') {
      let clsq = supabaseAdmin.from('classes').select('id');
      if (!isSuper && institutionId) clsq = clsq.eq('institution_id', institutionId);
      const { data: cls } = await clsq.limit(8000);
      const cids = (cls || []).map((c) => c.id);
      if (cids.length) {
        const { data: sessRows } = await supabaseAdmin
          .from('class_sessions')
          .select('id,lesson_date,start_time,reminder_sent,status')
          .in('class_id', cids)
          .eq('status', 'scheduled')
          .eq('reminder_sent', false)
          .gte('lesson_date', todayIst)
          .lte('lesson_date', upcomingIso);
        const sum = summarizeUnsentClassSessions(sessRows || []);
        pendingDueNow = sum.due_now;
        pendingWaiting = sum.waiting_for_window;
        pendingMissed = sum.started_without_reminder;
        pendingSessions = sum.total_unsent;

        const { data: missedCompletedRows } = await supabaseAdmin
          .from('class_sessions')
          .select('id,lesson_date,start_time,reminder_sent,status')
          .in('class_id', cids)
          .eq('status', 'completed')
          .eq('reminder_sent', false)
          .eq('lesson_date', todayIst);
        const missedCompleted = (missedCompletedRows || []).length;
        if (missedCompleted > 0) {
          pendingMissed += missedCompleted;
          pendingSessions += missedCompleted;
        }
      }
    }

    const live_events = (logs || []).slice(0, 25).map((l) => {
      const st = l.student_id ? studentById.get(l.student_id) : null;
      const errCode = parseLogErrorCode(l.error);
      return {
        id: l.id,
        at: l.sent_at,
        status: l.status,
        kind: l.kind,
        kind_label: kindLabelTr(l.kind),
        student_name: st?.name || null,
        phone: l.phone,
        error_code: errCode,
        message: l.status === 'failed' ? l.error : null
      };
    });

    const logs_enriched = (logs || []).slice(0, mode === 'admin' ? 400 : 200).map((l) => {
      const st = l.student_id ? studentById.get(l.student_id) : null;
      const coachName =
        st?.coach_id && coachById.size ? coachById.get(st.coach_id) || null : null;
      return {
        ...l,
        student_name: st?.name || null,
        coach_name: coachName,
        recipient: st ? recipientLabel(st, l.phone) : '—',
        kind_label: kindLabelTr(l.kind),
        error_code: parseLogErrorCode(l.error)
      };
    });

    let coach_student_summary = [];
    if (mode === 'scoped' && students.length) {
      const horizon = Date.now() - 7 * 24 * 60 * 60 * 1000;
      for (const s of students) {
        const ph = studentPhoneIssues(s);
        const stLogs = logs.filter((l) => l.student_id === s.id && new Date(l.sent_at).getTime() >= horizon);
        const failedN = stLogs.filter((l) => l.status === 'failed').length;
        const sentKinds = new Set(stLogs.filter((l) => l.status === 'sent').map((l) => l.kind));
        const anySent = sentKinds.size > 0;
        const parentSent = stLogs.some(
          (l) =>
            l.status === 'sent' &&
            normalizePhoneToE164(l.phone) === normalizePhoneToE164(s.parent_phone)
        );
        const studentSent = stLogs.some(
          (l) =>
            l.status === 'sent' &&
            normalizePhoneToE164(l.phone) === normalizePhoneToE164(s.phone)
        );
        const lessonReminderStudent = stLogs.some(
          (l) =>
            l.status === 'sent' &&
            l.kind === 'lesson_reminder' &&
            normalizePhoneToE164(l.phone) === normalizePhoneToE164(s.phone)
        );
        const lessonReminderParent = stLogs.some(
          (l) =>
            l.status === 'sent' &&
            l.kind === 'lesson_reminder_parent' &&
            normalizePhoneToE164(l.phone) === normalizePhoneToE164(s.parent_phone)
        );
        coach_student_summary.push({
          id: s.id,
          name: s.name,
          phone_ok: ph.student_ok,
          parent_phone_ok: ph.parent_ok,
          phone_issues: ph.issues,
          failed_last_7d: failedN,
          last_week_any_whatsapp_sent: anySent,
          student_line_sent: studentSent,
          parent_line_sent: parentSent,
          lesson_reminder_student_7d: lessonReminderStudent,
          lesson_reminder_parent_7d: lessonReminderParent
        });
      }
    }

    return res.status(200).json({
      server_time: new Date().toISOString(),
      mode,
      today_istanbul: today,
      known_crons: cronDefs.map((d) => ({ key: d.key, label: d.label, expectEveryMinutes: d.expectEveryMinutes })),
      summary: {
        sent_today: sentToday,
        failed_today: failedToday,
        sent_7d: sent7d,
        failed_7d: failed7d,
        pending_messages_today: pendingMessagesToday,
        pending_estimate: pendingSessions,
        pending_class_reminder_due_now: pendingDueNow,
        pending_class_reminder_waiting: pendingWaiting,
        pending_class_reminder_missed: pendingMissed,
        students_missing_phone: missingPhone,
        active_templates_count
      },
      cron_status,
      cron_recent_errors,
      cron_table_missing: cronTableMissing,
      templates: templates_detailed,
      logs: logs_enriched,
      live_events,
      coach_student_summary,
      hint_cron_sql: 'student-coaching-system/sql/2026-05-25-cron-run-log.sql'
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: msg });
  }
}
