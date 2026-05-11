import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { normalizePhoneToE164 } from '../api/_lib/phone-whatsapp.js';
import { metaWhatsAppConfigured } from '../api/_lib/meta-whatsapp.js';
import { sendWhatsAppUsingTemplateRow, OUTBOUND_LOG_CODE } from '../api/_lib/whatsapp-outbound.js';
import { insertWhatsAppAutomationLog } from '../api/_lib/message-log.js';
import { getIstanbulDateString } from '../api/_lib/istanbul-time.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';

const WINDOW_MS = 10 * 60 * 1000;
const KIND = 'class_lesson_reminder';
const TEMPLATE_TYPE = 'class_lesson_reminder';

function toUtcMs(dateStr, timeStr) {
  const safeTime = String(timeStr || '00:00:00').slice(0, 8);
  return new Date(`${dateStr}T${safeTime}+03:00`).getTime();
}

function uniqPhones(phoneList) {
  const seen = new Set();
  const out = [];
  for (const p of phoneList) {
    const e = normalizePhoneToE164(p);
    if (e && !seen.has(e)) {
      seen.add(e);
      out.push(e);
    }
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized cron' });

  const metaReady = metaWhatsAppConfigured();
  const logDate = getIstanbulDateString();
  const log = [];

  if (!metaReady) {
    console.warn('[cron-class-lesson-reminders] skipped: meta_whatsapp_not_ready');
    await recordCronRun({ jobKey: 'class_lesson_reminders', ok: true, skipped: 'meta_whatsapp_not_ready' });
    return res.status(200).json({ ok: true, skipped: 'meta_whatsapp_not_ready', log });
  }

  try {
    const { data: reminderTemplateRow, error: templateFetchErr } = await supabaseAdmin
      .from('message_templates')
      .select('*')
      .eq('type', TEMPLATE_TYPE)
      .maybeSingle();

    if (templateFetchErr) {
      const code = OUTBOUND_LOG_CODE.TEMPLATE_NOT_FOUND;
      console.error('[cron-class-lesson-reminders]', code, templateFetchErr.message);
      await insertWhatsAppAutomationLog({
        studentId: null,
        relatedId: null,
        kind: KIND,
        message: `${KIND}: template_select_error`,
        status: 'failed',
        logCode: code,
        error: templateFetchErr.message,
        logDate
      });
      return res.status(200).json({ ok: true, skipped: 'template_fetch_error', log });
    }

    if (!reminderTemplateRow?.content) {
      const code = OUTBOUND_LOG_CODE.TEMPLATE_NOT_FOUND;
      console.error('[cron-class-lesson-reminders]', code, { type: TEMPLATE_TYPE });
      await insertWhatsAppAutomationLog({
        studentId: null,
        relatedId: null,
        kind: KIND,
        message: `${KIND}: no_template_row`,
        status: 'failed',
        logCode: code,
        error: 'message_templates row missing or empty content',
        logDate
      });
      return res.status(200).json({ ok: true, skipped: 'template_not_found', log });
    }

    if (reminderTemplateRow.is_active === false) {
      console.warn('[cron-class-lesson-reminders] skipped: template_inactive');
      return res.status(200).json({ ok: true, skipped: 'class_lesson_reminder_inactive', log });
    }

    const metaNameDb = String(reminderTemplateRow.meta_template_name || '').trim();
    if (!metaNameDb) {
      const code = OUTBOUND_LOG_CODE.META_TEMPLATE_NAME_REQUIRED;
      console.error('[cron-class-lesson-reminders]', code, { type: TEMPLATE_TYPE });
      await insertWhatsAppAutomationLog({
        studentId: null,
        relatedId: null,
        kind: KIND,
        message: `${KIND}: meta_template_name empty in DB`,
        status: 'failed',
        logCode: code,
        error: 'meta_template_name not set on message_templates',
        logDate
      });
      return res.status(200).json({ ok: true, skipped: 'meta_template_name_required', log });
    }

    const now = Date.now();
    const { data: sessions } = await supabaseAdmin
      .from('class_sessions')
      .select('id,class_id,lesson_date,start_time,subject,meeting_link,reminder_sent,status')
      .eq('status', 'scheduled')
      .eq('reminder_sent', false);

    for (const s of sessions || []) {
      const startMs = toUtcMs(s.lesson_date, s.start_time);
      const until = startMs - now;
      if (until <= 0 || until > WINDOW_MS) continue;

      const [{ data: cls }, { data: classStudents }] = await Promise.all([
        supabaseAdmin.from('classes').select('name').eq('id', s.class_id).maybeSingle(),
        supabaseAdmin.from('class_students').select('student_id').eq('class_id', s.class_id)
      ]);
      const studentIds = (classStudents || []).map((x) => x.student_id);
      if (!studentIds.length) continue;

      const { data: students } = await supabaseAdmin
        .from('students')
        .select('id,name,phone,parent_phone')
        .in('id', studentIds);

      let anyOutboundAttempt = false;
      let allOutboundOk = true;

      for (const st of students || []) {
        const vars = {
          student_name: st.name || 'Öğrenci',
          class_name: cls?.name || 'Sınıf',
          subject: s.subject || 'Ders',
          lesson_time: String(s.start_time || '').slice(0, 5),
          meeting_link: s.meeting_link || ''
        };
        const phones = uniqPhones([st.phone, st.parent_phone]);
        if (!phones.length) {
          allOutboundOk = false;
          const code = OUTBOUND_LOG_CODE.INVALID_PHONE;
          console.error('[cron-class-lesson-reminders]', code, {
            session_id: s.id,
            student_id: st.id
          });
          await insertWhatsAppAutomationLog({
            studentId: st.id,
            relatedId: s.id,
            kind: KIND,
            message: `[${KIND}] session=${s.id}`,
            status: 'failed',
            logCode: code,
            error: 'no_valid_phone_for_student',
            logDate
          });
          log.push({
            session_id: s.id,
            student_id: st.id,
            ok: false,
            log_code: code
          });
          continue;
        }

        for (const ph of phones) {
          anyOutboundAttempt = true;
          let sent;
          try {
            sent = await sendWhatsAppUsingTemplateRow({
              phone: ph,
              templateRow: reminderTemplateRow,
              vars,
              templateType: TEMPLATE_TYPE
            });
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            console.error('[cron-class-lesson-reminders]', OUTBOUND_LOG_CODE.META_SEND_FAILED, errMsg);
            sent = {
              ok: false,
              logCode: OUTBOUND_LOG_CODE.META_SEND_FAILED,
              error: errMsg,
              sid: null,
              meta_template_name: metaNameDb,
              errorCode: null
            };
          }

          const lc = sent.logCode || (sent.ok ? null : OUTBOUND_LOG_CODE.META_SEND_FAILED);
          if (!sent.ok) {
            allOutboundOk = false;
            console.error('[cron-class-lesson-reminders]', lc || 'send_failed', {
              session_id: s.id,
              student_id: st.id,
              phone: ph,
              error: sent.error
            });
          }

          await insertWhatsAppAutomationLog({
            studentId: st.id,
            relatedId: s.id,
            kind: KIND,
            message: `[${KIND}] session=${s.id}`,
            status: sent.ok ? 'sent' : 'failed',
            logCode: lc || undefined,
            error: sent.ok ? null : sent.error || null,
            phone: ph,
            logDate,
            twilio_error_code: sent.errorCode != null ? String(sent.errorCode) : null,
            meta_message_id: sent.sid || null,
            meta_template_name: sent.meta_template_name || metaNameDb
          });

          log.push({
            session_id: s.id,
            student_id: st.id,
            phone: ph,
            ok: sent.ok,
            channel: sent.channel,
            meta_message_id: sent.sid,
            twilio_error_code: sent.errorCode,
            error: sent.ok ? undefined : sent.error,
            log_code: lc
          });
        }
      }

      /** Yalnızca tüm hedef gönderimler başarılıysa oturumu işaretle (kısmi başarıda reminder_sent true olmasın). */
      if (anyOutboundAttempt && allOutboundOk) {
        await supabaseAdmin.from('class_sessions').update({ reminder_sent: true }).eq('id', s.id);
      }
    }

    const sent = log.filter((x) => x && x.ok === true).length;
    const failed = log.filter((x) => x && x.error).length;
    await recordCronRun({
      jobKey: 'class_lesson_reminders',
      ok: true,
      messagesSent: sent,
      messagesFailed: failed,
      detail: { entries: log.length }
    });
    return res.status(200).json({ ok: true, processed: log.length, log });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cron-class-lesson-reminders] fatal', msg);
    await recordCronRun({ jobKey: 'class_lesson_reminders', ok: false, detail: { error: msg } });
    return res.status(500).json({ ok: false, error: msg, log });
  }
}
