import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { getIstanbulDateString, addCalendarDaysYmd } from '../api/_lib/istanbul-time.js';
import { wallTimeToUtcMs } from '../api/_lib/teacher-lesson-start-ms.js';
import { renderMessageTemplate } from '../api/_lib/template-engine.js';
import { sendWhatsAppMessage, normalizePhoneToE164 } from '../api/_lib/whatsapp-twilio.js';
import { getStudentPhones, classifyLessonReminderRecipients } from '../api/_lib/meetings-resolve.js';
import { alreadySentLessonReminder } from '../api/_lib/message-log.js';

/** Ders başlangıcına kalan süre: (0, 10] dakika (10 dk veya daha az) */
const MAX_LEAD_MS = 10 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized cron' });

  const twilioReady =
    Boolean(process.env.TWILIO_ACCOUNT_SID) &&
    Boolean(process.env.TWILIO_AUTH_TOKEN) &&
    Boolean(process.env.TWILIO_WHATSAPP_FROM);

  const log = [];
  const nowMs = Date.now();
  const today = getIstanbulDateString();
  const tomorrow = addCalendarDaysYmd(today, 1);

  try {
    const { data: templates, error: tErr } = await supabaseAdmin
      .from('message_templates')
      .select('type, content')
      .in('type', ['lesson_reminder', 'lesson_reminder_parent']);
    if (tErr) throw tErr;
    const byType = Object.fromEntries((templates || []).map((r) => [r.type, r.content]));
    if (!byType.lesson_reminder) {
      return res.status(200).json({ ok: true, skipped: 'no_lesson_reminder_template', log });
    }
    if (!byType.lesson_reminder_parent) {
      byType.lesson_reminder_parent = byType.lesson_reminder;
    }

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

      const baseVars = {
        student_name: student.name || 'Öğrenci',
        studentName: student.name || 'Öğrenci',
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

        if (!twilioReady) {
          log.push({ lesson_id: lesson.id, note: 'missing_twilio_env' });
          break;
        }

        const tmpl =
          role === 'parent' ? byType.lesson_reminder_parent || byType.lesson_reminder : byType.lesson_reminder;
        const body = renderMessageTemplate(tmpl, baseVars);

        try {
          await sendWhatsAppMessage(e164, body);
          const { error: insErr } = await supabaseAdmin.from('message_logs').insert({
            student_id: lesson.student_id,
            kind: 'lesson_reminder',
            related_id: lesson.id,
            message: body,
            status: 'sent',
            log_date: today,
            error: null,
            phone: e164
          });
          if (insErr?.code === '23505') {
            log.push({ lesson_id: lesson.id, phone: e164, note: 'duplicate_race' });
          } else if (insErr) {
            log.push({ lesson_id: lesson.id, phone: e164, error: insErr.message });
          } else {
            log.push({ lesson_id: lesson.id, phone: e164, ok: true });
          }
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          try {
            await supabaseAdmin.from('message_logs').insert({
              student_id: lesson.student_id,
              kind: 'lesson_reminder',
              related_id: lesson.id,
              message: body,
              status: 'failed',
              log_date: today,
              error: errMsg,
              phone: e164
            });
          } catch {
            /* log insert başarısız */
          }
          log.push({ lesson_id: lesson.id, phone: e164, error: errMsg });
        }
      }
    }

    return res.status(200).json({ ok: true, processed: log.length, log });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({
      ok: false,
      error: msg,
      log,
      hint:
        'SQL: student-coaching-system/sql/2026-05-14-whatsapp-logs-phone.sql; teacher_lessons: 2026-05-08-teacher-lessons.sql.'
    });
  }
}
