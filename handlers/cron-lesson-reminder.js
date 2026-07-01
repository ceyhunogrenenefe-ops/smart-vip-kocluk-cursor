import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { getIstanbulDateString, addCalendarDaysYmd } from '../api/_lib/istanbul-time.js';
import { wallTimeToUtcMs } from '../api/_lib/teacher-lesson-start-ms.js';
import { normalizePhoneToE164 } from '../api/_lib/phone-whatsapp.js';
import { resolveMetaTemplateName } from '../api/_lib/whatsapp-outbound.js';
import {
  resolveAutomationSendChannel,
  sendAutomationTemplateMessage
} from '../api/_lib/whatsapp-automation-channel.js';
import { getStudentPhones, classifyLessonReminderRecipients, getPrimaryAutomationPhone } from '../api/_lib/meetings-resolve.js';
import { alreadySentLessonReminder } from '../api/_lib/message-log.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';
import { parseReminderWindowConfig, isWithinReminderWindowMs } from '../api/_lib/lesson-reminder-window.js';
import {
  loadInstitutionWhatsappAutomationMap,
  studentAllowsWhatsappAutomation
} from '../api/_lib/whatsapp-automation-eligibility.js';
import { resolveGuestShareUrlForTeacherLesson } from '../api/_lib/guest-join-share-url.js';

const LESSON_WINDOW = parseReminderWindowConfig('LESSON_REMINDER');

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized cron' });

  const sendChannel = resolveAutomationSendChannel();

  const log = [];
  const nowMs = Date.now();
  const today = getIstanbulDateString();
  const tomorrow = addCalendarDaysYmd(today, 1);

  try {
    const { data: lrRow } = await supabaseAdmin
      .from('message_templates')
      .select('*')
      .eq('type', 'lesson_reminder')
      .maybeSingle();
    if (!lrRow?.content || lrRow.is_active === false) {
      await recordCronRun({ jobKey: 'lesson_reminders', ok: true, skipped: 'no_lesson_reminder_template' });
      await recordCronRun({
        jobKey: 'lesson_reminder_parent',
        ok: true,
        skipped: 'blocked_no_lesson_reminder_template'
      });
      return res.status(200).json({ ok: true, skipped: 'no_lesson_reminder_template', log });
    }
    const { data: lrParentRow } = await supabaseAdmin
      .from('message_templates')
      .select('*')
      .eq('type', 'lesson_reminder_parent')
      .maybeSingle();

    const parentMetaResolved = lrParentRow
      ? resolveMetaTemplateName(lrParentRow, 'lesson_reminder_parent')
      : '';
    const parentVeliCronReady =
      Boolean(lrParentRow?.content) &&
      lrParentRow?.is_active !== false &&
      (sendChannel === 'gateway' || Boolean(parentMetaResolved));

    let parentSentOk = 0;
    let parentSentFail = 0;
    let lessonsInReminderWindow = 0;

    const institutionFlags = await loadInstitutionWhatsappAutomationMap(supabaseAdmin);

    const { data: lessons, error: lErr } = await supabaseAdmin
      .from('teacher_lessons')
      .select('id, student_id, lesson_date, start_time, title, status')
      .in('lesson_date', [today, tomorrow])
      .eq('status', 'scheduled');
    if (lErr) throw lErr;

    const dueLessons = [];
    for (const lesson of lessons || []) {
      const startMs = wallTimeToUtcMs(lesson.lesson_date, lesson.start_time);
      if (startMs == null) {
        log.push({ lesson_id: lesson.id, note: 'bad_start_time' });
        continue;
      }
      const until = startMs - nowMs;
      if (!isWithinReminderWindowMs(until, LESSON_WINDOW)) continue;
      dueLessons.push({ lesson, startMs });
    }

    lessonsInReminderWindow = dueLessons.length;

    const studentIds = [...new Set(dueLessons.map(({ lesson }) => lesson.student_id).filter(Boolean))];
    const studentById = new Map();
    if (studentIds.length) {
      const { data: studentRows, error: stErr } = await supabaseAdmin
        .from('students')
        .select(
          'id, name, phone, parent_phone, class_level, class_label, group_name, institution_id, whatsapp_automation_enabled'
        )
        .in('id', studentIds);
      if (stErr) throw stErr;
      for (const row of studentRows || []) studentById.set(row.id, row);
    }

    for (const { lesson, startMs } of dueLessons) {
      const student = studentById.get(lesson.student_id);
      if (!student) {
        log.push({ lesson_id: lesson.id, note: 'no_student' });
        continue;
      }
      if (!studentAllowsWhatsappAutomation(student, institutionFlags)) {
        log.push({ lesson_id: lesson.id, student_id: student.id, note: 'whatsapp_automation_disabled' });
        continue;
      }

      const phones = await getStudentPhones(student);
      const primaryPhone = getPrimaryAutomationPhone(student);
      if (!primaryPhone) {
        log.push({ lesson_id: lesson.id, note: 'no_phone' });
        continue;
      }

      const recipients = classifyLessonReminderRecipients(student, phones).filter(
        (r) => normalizePhoneToE164(r.phone) === primaryPhone
      );
      const recipientsOrdered =
        recipients.length > 0
          ? recipients
          : [{ phone: primaryPhone, role: normalizePhoneToE164(student.parent_phone) === primaryPhone ? 'parent' : 'student' }];

      const timeLabel = new Intl.DateTimeFormat('tr-TR', {
        timeZone: 'Europe/Istanbul',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(new Date(startMs));

      const lessonLink = await resolveGuestShareUrlForTeacherLesson(lesson);

      const classLabel =
        String(student.class_level || student.class_label || student.group_name || '').trim() || 'Sınıf';

      const baseVars = {
        student_name: student.name || 'Öğrenci',
        studentName: student.name || 'Öğrenci',
        class_label: classLabel,
        lesson_name: lesson.title || 'Ders',
        lessonTime: timeLabel,
        time: timeLabel,
        lessonLink: lessonLink || '',
        link: lessonLink || ''
      };

      for (const { phone, role } of recipientsOrdered) {
        const isParentRecipient = role === 'parent';
        const e164 = normalizePhoneToE164(phone);
        if (!e164) {
          log.push({ lesson_id: lesson.id, phone: phone, note: 'invalid_phone' });
          continue;
        }

        try {
          const wasSent = await alreadySentLessonReminder(lesson.id, e164);
          if (wasSent) {
            log.push({ lesson_id: lesson.id, phone: e164, note: 'already_sent' });
            continue;
          }
        } catch {
          /* devam */
        }

        if (sendChannel === 'none') {
          log.push({ lesson_id: lesson.id, note: 'automation_channel_not_ready' });
          break;
        }

        let templateType = 'lesson_reminder';
        let logKind = 'lesson_reminder';
        let templateRow = lrRow;
        if (role === 'parent') {
          if (parentVeliCronReady && lrParentRow) {
            templateType = 'lesson_reminder_parent';
            logKind = 'lesson_reminder_parent';
            templateRow = lrParentRow;
          } else {
            log.push({
              lesson_id: lesson.id,
              phone: e164,
              note: 'lesson_reminder_parent_fallback_student_template'
            });
          }
        }

        try {
          const sent = await sendAutomationTemplateMessage({
            phone: e164,
            templateRow,
            vars: baseVars,
            templateType
          });
          const preview = sent.bodyPreview || '';
          const { error: insErr } = await supabaseAdmin.from('message_logs').insert({
            student_id: lesson.student_id,
            kind: logKind,
            related_id: lesson.id,
            message: preview,
            status: sent.ok ? 'sent' : 'failed',
            log_date: today,
            error: sent.ok ? null : sent.error || null,
            phone: e164,
            twilio_sid: null,
            twilio_error_code: sent.errorCode || null,
            twilio_content_sid: null,
            meta_message_id: sent.sid || sent.gateway_message_id || null,
            meta_template_name: sent.meta_template_name || null
          });
          if (insErr?.code === '23505') {
            log.push({ lesson_id: lesson.id, phone: e164, note: 'duplicate_race' });
          } else if (insErr) {
            log.push({ lesson_id: lesson.id, phone: e164, error: insErr.message });
          } else if (sent.ok) {
            log.push({ lesson_id: lesson.id, phone: e164, ok: true });
            if (isParentRecipient) parentSentOk += 1;
          } else {
            log.push({ lesson_id: lesson.id, phone: e164, error: sent.error, twilio_error_code: sent.errorCode });
            if (isParentRecipient) parentSentFail += 1;
          }
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          if (isParentRecipient) parentSentFail += 1;
          try {
            await supabaseAdmin.from('message_logs').insert({
              student_id: lesson.student_id,
              kind: logKind,
              related_id: lesson.id,
              message: '',
              status: 'failed',
              log_date: today,
              error: errMsg,
              phone: e164,
              twilio_sid: null,
              twilio_error_code: null,
              twilio_content_sid: null,
              meta_message_id: null,
              meta_template_name: null
            });
          } catch {
            /* log insert başarısız */
          }
          log.push({ lesson_id: lesson.id, phone: e164, error: errMsg });
        }
      }
    }

    const sent = log.filter((x) => x && x.ok === true).length;
    const failed = log.filter((x) => x && x.error).length;

    let parentSkipped = null;
    if (sendChannel === 'none') parentSkipped = 'automation_channel_not_ready';
    else if (!parentVeliCronReady && parentSentOk === 0 && parentSentFail === 0) {
      parentSkipped = 'parent_template_missing_or_inactive';
    }

    await recordCronRun({
      jobKey: 'lesson_reminders',
      ok: true,
      messagesSent: sent,
      messagesFailed: failed,
      detail: {
        meta_ready: sendChannel === 'meta',
        send_channel: sendChannel,
        entries: log.length,
        lessons_total: (lessons || []).length,
        lessons_in_reminder_window: lessonsInReminderWindow,
        max_lead_minutes: LESSON_WINDOW.maxMinutes,
        window_mode: LESSON_WINDOW.mode,
        window_label: LESSON_WINDOW.label
      }
    });
    await recordCronRun({
      jobKey: 'lesson_reminder_parent',
      ok: true,
      skipped: parentSkipped,
      messagesSent: parentSentOk,
      messagesFailed: parentSentFail,
      detail: {
        parent_template_ready: parentVeliCronReady,
        parent_meta_resolved: parentMetaResolved,
        meta_ready: sendChannel === 'meta',
        send_channel: sendChannel,
        lessons_total: (lessons || []).length,
        lessons_in_reminder_window: lessonsInReminderWindow,
        parent_meta_language: lrParentRow?.meta_template_language ?? null
      }
    });
    return res.status(200).json({
      ok: true,
      processed: log.length,
      log,
      note: 'class_group_reminders run via /api/cron/class-lesson-reminders only'
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordCronRun({ jobKey: 'lesson_reminders', ok: false, detail: { error: msg } });
    await recordCronRun({ jobKey: 'lesson_reminder_parent', ok: false, detail: { error: msg } });
    return res.status(500).json({
      ok: false,
      error: msg,
      log,
      hint:
        'SQL: student-coaching-system/sql/2026-05-14-whatsapp-logs-phone.sql; teacher_lessons: 2026-05-08-teacher-lessons.sql.'
    });
  }
}
