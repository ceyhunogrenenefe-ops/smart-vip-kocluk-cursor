import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { getIstanbulDateString, addCalendarDaysYmd } from '../api/_lib/istanbul-time.js';
import { wallTimeToUtcMs } from '../api/_lib/teacher-lesson-start-ms.js';
import { normalizePhoneToE164 } from '../api/_lib/phone-whatsapp.js';
import { metaWhatsAppConfigured } from '../api/_lib/meta-whatsapp.js';
import { sendAutomatedWhatsApp } from '../api/_lib/whatsapp-outbound.js';
import { getStudentPhones, classifyLessonReminderRecipients } from '../api/_lib/meetings-resolve.js';
import { alreadySentLessonReminder } from '../api/_lib/message-log.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';

/** Ders başlangıcına kalan süre: (0, 10] dakika (10 dk veya daha az) */
const MAX_LEAD_MS = 10 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized cron' });

  const metaReady = metaWhatsAppConfigured();

  const log = [];
  const nowMs = Date.now();
  const today = getIstanbulDateString();
  const tomorrow = addCalendarDaysYmd(today, 1);

  try {
    const { data: lrRow } = await supabaseAdmin.from('message_templates').select('type').eq('type', 'lesson_reminder').maybeSingle();
    if (!lrRow) {
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

    const parentVeliCronReady =
      Boolean(lrParentRow?.content) &&
      Boolean(String(lrParentRow?.meta_template_name || '').trim()) &&
      lrParentRow?.is_active !== false;

    let parentSentOk = 0;
    let parentSentFail = 0;

    const { data: lessons, error: lErr } = await supabaseAdmin
      .from('teacher_lessons')
      .select('*')
      .in('lesson_date', [today, tomorrow])
      .eq('status', 'scheduled');
    if (lErr) throw lErr;

    for (const lesson of lessons || []) {
      const startMs = wallTimeToUtcMs(lesson.lesson_date, lesson.start_time);
      if (startMs == null) {
        log.push({ lesson_id: lesson.id, note: 'bad_start_time' });
        continue;
      }
      const until = startMs - nowMs;
      if (until <= 0) {
        continue;
      }
      if (until > MAX_LEAD_MS) {
        continue;
      }

      const { data: student } = await supabaseAdmin.from('students').select('*').eq('id', lesson.student_id).maybeSingle();
      if (!student) {
        log.push({ lesson_id: lesson.id, note: 'no_student' });
        continue;
      }

      const phones = await getStudentPhones(student);
      if (!phones.length) {
        log.push({ lesson_id: lesson.id, note: 'no_phone' });
        continue;
      }

      const recipients = classifyLessonReminderRecipients(student, phones);

      const timeLabel = new Intl.DateTimeFormat('tr-TR', {
        timeZone: 'Europe/Istanbul',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(new Date(startMs));

      const lessonLink = lesson.meeting_link || process.env.APP_BASE_URL || '';

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

      for (const { phone, role } of recipients) {
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

        if (!metaReady) {
          log.push({ lesson_id: lesson.id, note: 'missing_meta_whatsapp_env' });
          break;
        }

        let templateType = 'lesson_reminder';
        let logKind = 'lesson_reminder';
        if (role === 'parent') {
          if (!parentVeliCronReady) {
            log.push({
              lesson_id: lesson.id,
              phone: e164,
              note: 'lesson_reminder_parent_skipped_meta_or_inactive'
            });
            continue;
          }
          templateType = 'lesson_reminder_parent';
          logKind = 'lesson_reminder_parent';
        }

        try {
          const sent = await sendAutomatedWhatsApp({
            phone: e164,
            templateType,
            vars: baseVars
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
            meta_message_id: sent.sid || null,
            meta_template_name: sent.meta_template_name || null
          });
          if (insErr?.code === '23505') {
            log.push({ lesson_id: lesson.id, phone: e164, note: 'duplicate_race' });
          } else if (insErr) {
            log.push({ lesson_id: lesson.id, phone: e164, error: insErr.message });
          } else if (sent.ok) {
            log.push({ lesson_id: lesson.id, phone: e164, ok: true });
            if (templateType === 'lesson_reminder_parent') parentSentOk += 1;
          } else {
            log.push({ lesson_id: lesson.id, phone: e164, error: sent.error, twilio_error_code: sent.errorCode });
            if (templateType === 'lesson_reminder_parent') parentSentFail += 1;
          }
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          if (logKind === 'lesson_reminder_parent') parentSentFail += 1;
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
    if (!metaReady) parentSkipped = 'missing_meta_whatsapp_env';
    else if (!parentVeliCronReady && parentSentOk === 0 && parentSentFail === 0) {
      parentSkipped = 'parent_template_meta_missing_or_inactive';
    }

    await recordCronRun({
      jobKey: 'lesson_reminders',
      ok: true,
      messagesSent: sent,
      messagesFailed: failed,
      detail: { meta_ready: metaReady, entries: log.length }
    });
    await recordCronRun({
      jobKey: 'lesson_reminder_parent',
      ok: true,
      skipped: parentSkipped,
      messagesSent: parentSentOk,
      messagesFailed: parentSentFail,
      detail: { parent_template_ready: parentVeliCronReady, meta_ready: metaReady }
    });
    return res.status(200).json({ ok: true, processed: log.length, log });
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
