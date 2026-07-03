/**
 * Grup dersi hatırlatma cron gövdesi — HTTP handler + birebir ders cron yedek tetikleyicisi.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { OUTBOUND_LOG_CODE } from './whatsapp-outbound.js';
import { insertWhatsAppAutomationLog } from './message-log.js';
import { getIstanbulDateString } from './istanbul-time.js';
import { recordCronRun } from './cron-run-log.js';
import { resolveAutomationSendChannel } from './whatsapp-automation-channel.js';
import { ensureClassSessionsFromWeeklySlots } from './class-sessions-from-slots.js';
import { reconcileClassSessionsForReminders } from './class-session-reminder-reconcile.js';
import { addCalendarDaysYmd } from './istanbul-time.js';
import {
  CLASS_LESSON_REMINDER_MAX_LEAD_MINUTES,
  CLASS_LESSON_REMINDER_WINDOW_LABEL,
  isInReminderWindow,
  buildClassStudentMap,
  buildStudentDaySessionIndex,
  summarizeUnsentClassSessions,
  shouldSkipClassLessonReminder
} from './class-lesson-reminder-logic.js';
import {
  CLASS_LESSON_REMINDER_KIND,
  CLASS_LESSON_REMINDER_TEMPLATE,
  loadClassLessonReminderTemplate,
  validateClassLessonReminderTemplate,
  sendClassLessonReminderForSession,
  claimClassSessionReminder,
  releaseClassSessionReminderClaim
} from './class-lesson-reminder-send.js';
import {
  buildClassStudentSubjectMap,
  filterStudentIdsForClassSubject,
  loadClassStudentSubjectRows
} from './class-student-subjects.js';

/**
 * @param {{ triggeredBy?: string }} [opts]
 */
export async function runClassLessonRemindersJob(opts = {}) {
  const triggeredBy = String(opts.triggeredBy || 'cron').trim() || 'cron';
  const logDate = getIstanbulDateString();
  const log = [];
  const now = Date.now();

  const sendChannel = resolveAutomationSendChannel();
  if (sendChannel === 'none') {
    await recordCronRun({
      jobKey: 'class_lesson_reminders',
      ok: true,
      skipped: 'automation_channel_not_ready',
      detail: { hint: 'WHATSAPP_AUTOMATION_CHANNEL=gateway + gateway QR veya Meta env' }
    });
    return { ok: true, skipped: 'automation_channel_not_ready', log, triggeredBy };
  }

  const reminderTemplateRow = await loadClassLessonReminderTemplate();
  const tplCheck = validateClassLessonReminderTemplate(reminderTemplateRow);
  if (!tplCheck.ok) {
    const code =
      tplCheck.code === 'meta_template_name_required'
        ? OUTBOUND_LOG_CODE.META_TEMPLATE_NAME_REQUIRED
        : OUTBOUND_LOG_CODE.TEMPLATE_NOT_FOUND;
    await insertWhatsAppAutomationLog({
      studentId: null,
      relatedId: null,
      kind: CLASS_LESSON_REMINDER_KIND,
      message: `${CLASS_LESSON_REMINDER_KIND}: ${tplCheck.code}`,
      status: 'failed',
      logCode: code,
      error: tplCheck.code,
      logDate
    });
    await recordCronRun({ jobKey: 'class_lesson_reminders', ok: true, skipped: tplCheck.code });
    return { ok: true, skipped: tplCheck.code, log, triggeredBy };
  }

  const materializeToday = await ensureClassSessionsFromWeeklySlots(logDate);
  const materializeTomorrow = await ensureClassSessionsFromWeeklySlots(addCalendarDaysYmd(logDate, 1));
  const materialize = {
    today: materializeToday,
    tomorrow: materializeTomorrow,
    created: (materializeToday.created || 0) + (materializeTomorrow.created || 0)
  };
  if (materialize.created > 0) {
    console.info('[class-lesson-reminders]', triggeredBy, 'materialized sessions', materialize);
  }

  const { data: rawToday, error: sessErrToday } = await supabaseAdmin
    .from('class_sessions')
    .select('id,class_id,lesson_date,start_time,end_time,subject,meeting_link,reminder_sent,status')
    .eq('lesson_date', logDate)
    .order('start_time', { ascending: true });
  const tomorrow = addCalendarDaysYmd(logDate, 1);
  const { data: rawTomorrow, error: sessErrTomorrow } = await supabaseAdmin
    .from('class_sessions')
    .select('id,class_id,lesson_date,start_time,end_time,subject,meeting_link,reminder_sent,status')
    .eq('lesson_date', tomorrow)
    .order('start_time', { ascending: true });
  const sessErr = sessErrToday || sessErrTomorrow;
  const rawDaySessions = [...(rawToday || []), ...(rawTomorrow || [])];
  if (sessErr) throw sessErr;

  const reconcile = await reconcileClassSessionsForReminders(rawDaySessions || [], now);
  const daySessions = (reconcile.sessions || []).filter((s) => String(s.status || '') === 'scheduled');
  if (reconcile.reopened > 0 || reconcile.resetReminderSent > 0) {
    console.info('[class-lesson-reminders]', triggeredBy, 'reconcile', reconcile);
  }

  const unsentSummary = summarizeUnsentClassSessions(daySessions || [], now);
  const dueSessions = (daySessions || []).filter(
    (s) =>
      !s.reminder_sent &&
      !shouldSkipClassLessonReminder(s.subject) &&
      isInReminderWindow(s.lesson_date, s.start_time, now)
  );

  if (!dueSessions.length) {
    const detail = {
      due_sessions: 0,
      max_lead_minutes: CLASS_LESSON_REMINDER_MAX_LEAD_MINUTES,
      window_label: CLASS_LESSON_REMINDER_WINDOW_LABEL,
      log_date: logDate,
      materialize,
      reconcile,
      scheduled_today: (daySessions || []).length,
      unsent: unsentSummary,
      triggered_by: triggeredBy
    };
    await recordCronRun({
      jobKey: 'class_lesson_reminders',
      ok: true,
      messagesSent: 0,
      messagesFailed: 0,
      detail
    });
    return {
      ok: true,
      processed: 0,
      due_sessions: 0,
      max_lead_minutes: CLASS_LESSON_REMINDER_MAX_LEAD_MINUTES,
      window_label: CLASS_LESSON_REMINDER_WINDOW_LABEL,
      materialize,
      reconcile,
      scheduled_today: (daySessions || []).length,
      unsent: unsentSummary,
      log,
      triggeredBy
    };
  }

  const classIds = [...new Set(dueSessions.map((s) => String(s.class_id)))];
  const classStudentRows = await loadClassStudentSubjectRows(classIds);
  const classStudentSubjectMap = buildClassStudentSubjectMap(classStudentRows);

  const classToStudents = buildClassStudentMap(classStudentRows || []);
  const studentDaySessions = buildStudentDaySessionIndex(daySessions || [], classToStudents);

  const allStudentIds = [...new Set([...studentDaySessions.keys()])];
  const { data: students, error: stErr } = allStudentIds.length
    ? await supabaseAdmin
        .from('students')
        .select('id,name,phone,parent_phone')
        .in('id', allStudentIds)
    : { data: [], error: null };
  if (stErr) throw stErr;
  const studentById = new Map((students || []).map((s) => [String(s.id), s]));

  const classIdsUnique = [...new Set(dueSessions.map((s) => s.class_id))];
  const { data: classes, error: clsErr } = await supabaseAdmin
    .from('classes')
    .select('id,name')
    .in('id', classIdsUnique);
  if (clsErr) throw clsErr;
  const classById = new Map((classes || []).map((c) => [String(c.id), c]));

  for (const s of dueSessions) {
    const claimed = await claimClassSessionReminder(s.id);
    if (!claimed) {
      log.push({
        session_id: s.id,
        ok: true,
        skipped: 'already_claimed',
        note: 'Başka cron veya eşzamanlı işlem bu oturumu işledi'
      });
      continue;
    }

    const studentIds = filterStudentIdsForClassSubject(
      classStudentSubjectMap,
      s.class_id,
      s.subject,
      classToStudents.get(String(s.class_id)) || []
    );
    const result = await sendClassLessonReminderForSession({
      session: s,
      templateRow: reminderTemplateRow,
      className: classById.get(String(s.class_id))?.name || 'Sınıf',
      studentIds,
      studentById,
      studentDaySessions,
      applyConsecutiveSkip: true,
      logDate,
      source: 'cron'
    });
    log.push(...result.log);

    if (!result.anySucceeded) {
      await releaseClassSessionReminderClaim(s.id);
    }
  }

  const sent = log.filter((x) => x && x.ok === true && !x.skipped).length;
  const skippedConsecutive = log.filter((x) => x?.skipped === 'consecutive_same_lesson').length;
  const failed = log.filter((x) => x && x.error && !x.skipped).length;
  await recordCronRun({
    jobKey: 'class_lesson_reminders',
    ok: true,
    messagesSent: sent,
    messagesFailed: failed,
    detail: {
      entries: log.length,
      max_lead_minutes: CLASS_LESSON_REMINDER_MAX_LEAD_MINUTES,
      window_label: CLASS_LESSON_REMINDER_WINDOW_LABEL,
      due_sessions: dueSessions.length,
      skipped_consecutive_same_lesson: skippedConsecutive,
      log_date: logDate,
      materialize,
      reconcile,
      triggered_by: triggeredBy
    }
  });

  return {
    ok: true,
    processed: log.length,
    due_sessions: dueSessions.length,
    max_lead_minutes: CLASS_LESSON_REMINDER_MAX_LEAD_MINUTES,
    skipped_consecutive: skippedConsecutive,
    messages_sent: sent,
    messages_failed: failed,
    log,
    triggeredBy
  };
}
