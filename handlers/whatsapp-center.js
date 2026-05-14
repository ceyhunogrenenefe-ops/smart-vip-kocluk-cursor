import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { enrichStudentActor } from '../api/_lib/enrich-student-actor.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { getIstanbulDateString, addCalendarDaysYmd } from '../api/_lib/istanbul-time.js';
import { normalizePhoneToE164 } from '../api/_lib/phone-whatsapp.js';
import { normalizedUserRolesFromDb } from '../api/_lib/user-roles-fetch.js';
import { getTeacherGroupClassStudentScope } from '../api/_lib/teacher-class-scope.js';
import { getTemplateBindingKeys } from '../api/_lib/whatsapp-outbound.js';

/** Panel — `cron_run_log.job_key`; ek kayıtlar otomatik birleştirilir */
export const TEMPLATE_TYPE_TO_CRON_JOB_KEY = {
  lesson_reminder: 'lesson_reminders',
  lesson_reminder_parent: 'lesson_reminder_parent',
  report_reminder: 'daily_report_reminder',
  class_lesson_reminder: 'class_lesson_reminders',
  class_homework_notice: 'class_homework_notify',
  meeting_notification: 'meeting_reminders',
  /** Grup yoklaması devamsızlık — anlık gönderim mark-attendance; cron yalnızca başarısız yeniden deneme */
  class_absent_notice_1: 'absent_student_notification'
};

export const KNOWN_CRON_JOBS = [
  { key: 'class_lesson_reminders', label: 'Grup dersi hatırlatma (10 dk)', expectEveryMinutes: 5 },
  { key: 'daily_report_reminder', label: 'Günlük rapor hatırlatması', expectEveryMinutes: 24 * 60 },
  { key: 'lesson_reminders', label: 'Birebir ders hatırlatma — öğrenci', expectEveryMinutes: 5 },
  { key: 'lesson_reminder_parent', label: 'Veli ders hatırlatma (Meta)', expectEveryMinutes: 5 },
  { key: 'meeting_reminders', label: 'Görüşme 10 dk hatırlatma', expectEveryMinutes: 5 },
  { key: 'class_homework_notify', label: 'Grup ödev bildirimi', expectEveryMinutes: 10 },
  { key: 'coach_followup', label: 'Koç otomasyon (Meta şablon)', expectEveryMinutes: 15 },
  { key: 'study_evening_reminder', label: 'Akşam çalışma hatırlatması', expectEveryMinutes: 24 * 60 },
  { key: 'absent_student_notification', label: 'Devamsızlık bildirimi (anlık + başarısız yeniden deneme)', expectEveryMinutes: 15 },
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

function cronVisualState(def, last, nowMs) {
  const ranAt = last?.ran_at ? new Date(last.ran_at).getTime() : 0;
  const ageMin = ranAt ? (nowMs - ranAt) / 60000 : null;
  if (def.awaiting_first_run) return { state: 'pending', age_minutes: null };
  if (!last) return { state: 'stale', age_minutes: null };
  if (last.ok === false && !last.skipped) return { state: 'error', age_minutes: ageMin };
  const expectMin = def.expectEveryMinutes || 60;
  const frequent = expectMin <= 30;
  if (frequent && ageMin != null && ageMin > 60) {
    return { state: 'idle_1h', age_minutes: ageMin };
  }
  if (ageMin != null && ageMin > expectMin * 2.5) {
    return { state: 'stale', age_minutes: ageMin };
  }
  return { state: 'ok', age_minutes: ageMin };
}

function kindForTemplateType(type) {
  const t = String(type || '').trim();
  const map = {
    class_lesson_reminder: 'class_lesson_reminder',
    class_homework_notice: 'class_homework_notice',
    class_absent_notice_1: 'class_absent_notice_1',
    class_absent_notice: 'class_absent_notice',
    lesson_reminder: 'lesson_reminder',
    lesson_reminder_parent: 'lesson_reminder_parent',
    report_reminder: 'report_reminder',
    meeting_notification: 'meeting_notification'
  };
  return map[t] || t;
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

function templateTelemetry(tpl, logsForStats) {
  const type = String(tpl.type || '');
  const kind = kindForTemplateType(type);
  const metaName = String(tpl.meta_template_name || '').trim();
  let total = 0;
  let ok = 0;
  let fail = 0;
  let lastSent = null;
  for (const row of logsForStats) {
    const k = String(row.kind || '');
    const matches =
      k === kind ||
      (metaName && String(row.meta_template_name || '').trim() === metaName) ||
      (type === 'meeting_notification' &&
        (k === 'meeting_notification' || k === 'whatsapp_created' || k === 'whatsapp_reminder_10m'));
    if (!matches) continue;
    total += 1;
    if (row.status === 'sent') {
      ok += 1;
      const t = row.sent_at ? new Date(row.sent_at).getTime() : 0;
      if (t && (!lastSent || t > new Date(lastSent).getTime())) lastSent = row.sent_at;
    } else if (row.status === 'failed') fail += 1;
  }
  const isActive = tpl.is_active !== false;
  const metaMissing = !metaName;
  let badge = 'active';
  if (!isActive) badge = 'inactive';
  else if (metaMissing) badge = 'meta_missing';
  else if (fail > ok && total > 2) badge = 'unhealthy';
  const bindingKeys = getTemplateBindingKeys(tpl);
  const varsArr = Array.isArray(tpl.variables) ? tpl.variables.map((x) => String(x || '').trim()).filter(Boolean) : [];
  return {
    id: tpl.id,
    name: tpl.name,
    type,
    channel: tpl.channel || 'whatsapp',
    is_active: isActive,
    meta_template_name: tpl.meta_template_name || null,
    meta_template_language: tpl.meta_template_language || 'tr',
    whatsapp_template_status: tpl.whatsapp_template_status || null,
    total_sent_window: total,
    success_count: ok,
    failed_count: fail,
    last_sent_at: lastSent,
    badge,
    meta_missing: metaMissing,
    /** Test gönderimi: Meta {{1}}… sırası — twilio_variable_bindings öncelikli */
    binding_keys: bindingKeys,
    variables: varsArr
  };
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

    let logQuery = supabaseAdmin
      .from('message_logs')
      .select(
        'id,student_id,kind,related_id,message,status,sent_at,log_date,error,phone,meta_template_name,twilio_error_code'
      )
      .order('sent_at', { ascending: false })
      .limit(mode === 'admin' ? 500 : 250);

    if (mode === 'scoped') {
      if (scopedStudentIds?.length) logQuery = logQuery.in('student_id', scopedStudentIds);
      else logQuery = logQuery.eq('student_id', '__none__');
    } else if (!isSuper && institutionId) {
      const instIds = students.map((s) => s.id);
      if (instIds.length) logQuery = logQuery.in('student_id', instIds);
    }

    if (sinceParam) {
      logQuery = logQuery.gt('sent_at', sinceParam);
    }

    const { data: rawLogs, error: logErr } = await logQuery;
    if (logErr) throw logErr;
    const logs = rawLogs || [];

    let sentToday = 0;
    let failedToday = 0;
    const todayRows = logs.filter((l) => l.log_date === today);
    for (const l of todayRows) {
      if (l.status === 'sent') sentToday += 1;
      else if (l.status === 'failed') failedToday += 1;
    }
    let pendingMessagesToday = 0;
    if (sinceParam === '') {
      const cQ = supabaseAdmin
        .from('message_logs')
        .select('id', { count: 'exact', head: true })
        .eq('log_date', today)
        .eq('status', 'sent');
      const fQ = supabaseAdmin
        .from('message_logs')
        .select('id', { count: 'exact', head: true })
        .eq('log_date', today)
        .eq('status', 'failed');
      const pQ = supabaseAdmin
        .from('message_logs')
        .select('id', { count: 'exact', head: true })
        .eq('log_date', today)
        .eq('status', 'pending');
      if (mode === 'scoped' && scopedStudentIds?.length) {
        cQ.in('student_id', scopedStudentIds);
        fQ.in('student_id', scopedStudentIds);
        pQ.in('student_id', scopedStudentIds);
      } else if (mode === 'admin' && !isSuper && institutionId) {
        const ids = students.map((s) => s.id);
        if (ids.length) {
          cQ.in('student_id', ids);
          fQ.in('student_id', ids);
          pQ.in('student_id', ids);
        }
      }
      const [{ count: sc }, { count: fc }, { count: pc }] = await Promise.all([cQ, fQ, pQ]);
      sentToday = sc ?? sentToday;
      failedToday = fc ?? failedToday;
      pendingMessagesToday = pc ?? 0;
    }

    const { data: tplRows } = await supabaseAdmin
      .from('message_templates')
      .select('*')
      .order('type', { ascending: true });

    const { data: cronRows } = await supabaseAdmin
      .from('cron_run_log')
      .select('job_key,ran_at,ok,skipped,messages_sent,messages_failed,detail')
      .order('ran_at', { ascending: false })
      .limit(1200);

    const latestByJob = new Map();
    for (const row of cronRows || []) {
      const k = row.job_key;
      if (!latestByJob.has(k)) latestByJob.set(k, row);
    }

    const { data: cronFailRows } = await supabaseAdmin
      .from('cron_run_log')
      .select('job_key,ran_at,ok,skipped,detail,messages_failed')
      .eq('ok', false)
      .order('ran_at', { ascending: false })
      .limit(20);

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
      const vis = cronVisualState(def, last, nowMs);
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
        age_minutes: vis.age_minutes,
        state: vis.state
      };
    });

    const statsPool =
      sinceParam === ''
        ? (
            await supabaseAdmin
              .from('message_logs')
              .select('kind,status,sent_at,meta_template_name,log_date')
              .order('sent_at', { ascending: false })
              .limit(mode === 'admin' ? 12000 : 4000)
          ).data || []
        : [];

    const templates_detailed =
      mode === 'admin'
        ? (tplRows || []).map((t) => templateTelemetry(t, statsPool))
        : [];

    const active_templates_count = (tplRows || []).filter(
      (t) => t.is_active !== false && String(t.meta_template_name || '').trim()
    ).length;

    /** lesson_date İstanbul takvim günü; UTC .toISOString() ile karşılaştırma sınır günü kaydırabiliyordu */
    const todayIst = getIstanbulDateString();
    const upcomingIso = addCalendarDaysYmd(todayIst, 2);
    let pendingSessions = 0;
    if (mode === 'admin') {
      let clsq = supabaseAdmin.from('classes').select('id');
      if (!isSuper && institutionId) clsq = clsq.eq('institution_id', institutionId);
      const { data: cls } = await clsq.limit(8000);
      const cids = (cls || []).map((c) => c.id);
      if (cids.length) {
        const { count } = await supabaseAdmin
          .from('class_sessions')
          .select('id', { count: 'exact', head: true })
          .in('class_id', cids)
          .eq('status', 'scheduled')
          .eq('reminder_sent', false)
          .lte('lesson_date', upcomingIso);
        pendingSessions = count ?? 0;
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
        pending_messages_today: pendingMessagesToday,
        pending_estimate: pendingSessions,
        students_missing_phone: missingPhone,
        active_templates_count
      },
      cron_status,
      cron_recent_errors,
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
