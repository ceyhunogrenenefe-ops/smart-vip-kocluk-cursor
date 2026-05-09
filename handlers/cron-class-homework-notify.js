import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { normalizePhoneToE164 } from '../api/_lib/phone-whatsapp.js';
import { metaWhatsAppConfigured } from '../api/_lib/meta-whatsapp.js';
import { sendAutomatedWhatsApp, OUTBOUND_LOG_CODE } from '../api/_lib/whatsapp-outbound.js';
import { insertWhatsAppAutomationLog } from '../api/_lib/message-log.js';
import { getIstanbulDateString } from '../api/_lib/istanbul-time.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';

const KIND = 'class_homework_notice';
const TEMPLATE_TYPE = 'class_homework_notice';

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
    await recordCronRun({ jobKey: 'class_homework_notify', ok: true, skipped: 'meta_whatsapp_not_ready' });
    return res.status(200).json({ ok: true, skipped: 'meta_whatsapp_not_ready' });
  }

  const now = Date.now();
  try {
    const { data: tmpl } = await supabaseAdmin.from('message_templates').select('*').eq('type', TEMPLATE_TYPE).maybeSingle();
    if (!tmpl?.content || !String(tmpl.meta_template_name || '').trim()) {
      await recordCronRun({
        jobKey: 'class_homework_notify',
        ok: false,
        skipped: tmpl?.content ? 'meta_template_name_required' : 'template_not_found'
      });
      return res.status(200).json({
        ok: true,
        skipped: tmpl?.content ? 'meta_template_name_required' : 'template_not_found',
        log
      });
    }

    const { data: sessions } = await supabaseAdmin
      .from('class_sessions')
      .select('id,class_id,lesson_date,end_time,subject,homework,homework_sent,status')
      .eq('status', 'scheduled')
      .eq('homework_sent', false)
      .not('homework', 'is', null);

    for (const s of sessions || []) {
      const endMs = toUtcMs(s.lesson_date, s.end_time);
      if (now < endMs) continue;

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
          homework: s.homework || '-'
        };
        const phones = uniqPhones([st.phone, st.parent_phone]);
        if (!phones.length) {
          allOutboundOk = false;
          await insertWhatsAppAutomationLog({
            studentId: st.id,
            relatedId: s.id,
            kind: KIND,
            message: `[${KIND}] session=${s.id}`,
            status: 'failed',
            logCode: OUTBOUND_LOG_CODE.INVALID_PHONE,
            error: 'no_valid_phone',
            logDate
          });
          log.push({ session_id: s.id, student_id: st.id, ok: false, log_code: OUTBOUND_LOG_CODE.INVALID_PHONE });
          continue;
        }

        for (const ph of phones) {
          anyOutboundAttempt = true;
          const sent = await sendAutomatedWhatsApp({
            phone: ph,
            templateType: TEMPLATE_TYPE,
            vars
          });
          const lc = sent.logCode || (sent.ok ? null : OUTBOUND_LOG_CODE.META_SEND_FAILED);
          if (!sent.ok) allOutboundOk = false;

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
            meta_template_name: sent.meta_template_name || null
          });

          log.push({
            session_id: s.id,
            student_id: st.id,
            phone: ph,
            ok: sent.ok,
            meta_message_id: sent.sid,
            error: sent.ok ? undefined : sent.error,
            log_code: lc
          });
        }
      }

      if (anyOutboundAttempt && allOutboundOk) {
        await supabaseAdmin.from('class_sessions').update({ homework_sent: true }).eq('id', s.id);
      }
    }

    const sentOk = log.filter((x) => x.ok === true).length;
    const failed = log.filter((x) => x.ok === false).length;
    await recordCronRun({
      jobKey: 'class_homework_notify',
      ok: true,
      messagesSent: sentOk,
      messagesFailed: failed,
      detail: { entries: log.length }
    });
    return res.status(200).json({ ok: true, processed: log.length, log });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordCronRun({ jobKey: 'class_homework_notify', ok: false, detail: { error: msg } });
    return res.status(500).json({ ok: false, error: msg, log });
  }
}
