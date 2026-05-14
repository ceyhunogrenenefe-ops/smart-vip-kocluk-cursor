import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { getIstanbulDateString, getIstanbulHour } from '../api/_lib/istanbul-time.js';
import { renderMessageTemplate } from '../api/_lib/template-engine.js';
import { sendAutomatedWhatsApp } from '../api/_lib/whatsapp-outbound.js';
import { metaWhatsAppConfigured } from '../api/_lib/meta-whatsapp.js';
import { getStudentPhoneForReport } from '../api/_lib/meetings-resolve.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';

/**
 * Rapor = bugün (İstanbul) `weekly_entries` satırı olan öğrenci (dolduranlar hariç).
 *
 * Zaman sözleşmesi: `api/_lib/vercel-cron-contract.js` → `CRON_DAILY_REPORT_REMINDERS_UTC` (vercel.json ile aynı string).
 * Vercel tetiklemesi UTC’tir; üretimde İstanbul 23:00 için cron **20:00 UTC** olmalıdır.
 *
 * `auth.source === 'vercel'`: yalnızca İstanbul saati 23 iken gönder (yanlış cron saatinden koruma).
 * Bearer ile manuel tetikleme: her saat mümkün (saat filtresi atlanır — geliştirici/test).
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized cron' });

  const metaReady = metaWhatsAppConfigured();

  const log = [];
  const today = getIstanbulDateString();
  const hourIst = getIstanbulHour();

  if (auth.source === 'vercel' && hourIst !== 23) {
    await recordCronRun({
      jobKey: 'daily_report_reminder',
      ok: true,
      skipped: 'report_reminder_only_istanbul_hour_23',
      detail: { istanbul_hour: hourIst }
    });
    return res.status(200).json({
      ok: true,
      skipped: 'report_reminder_only_istanbul_hour_23',
      istanbul_hour: hourIst,
      log
    });
  }

  if (!metaReady) {
    await recordCronRun({ jobKey: 'daily_report_reminder', ok: true, skipped: 'missing_meta_whatsapp_env' });
    return res.status(200).json({ ok: true, skipped: 'missing_meta_whatsapp_env', log: [] });
  }

  try {
    const { data: template, error: tErr } = await supabaseAdmin
      .from('message_templates')
      .select('content')
      .eq('type', 'report_reminder')
      .maybeSingle();
    if (tErr) throw tErr;
    if (!template?.content) {
      await recordCronRun({ jobKey: 'daily_report_reminder', ok: true, skipped: 'no_report_reminder_template' });
      return res.status(200).json({ ok: true, skipped: 'no_report_reminder_template', log });
    }

    const { data: entries, error: eErr } = await supabaseAdmin
      .from('weekly_entries')
      .select('student_id')
      .eq('date', today);
    if (eErr) throw eErr;
    const reportedSet = new Set((entries || []).map((r) => r.student_id));

    const { data: sentRows } = await supabaseAdmin
      .from('message_logs')
      .select('student_id')
      .eq('kind', 'report_reminder')
      .eq('log_date', today)
      .eq('status', 'sent');
    const alreadySent = new Set((sentRows || []).map((r) => r.student_id));

    const { data: students, error: sErr } = await supabaseAdmin
      .from('students')
      .select('id,name,phone,parent_phone,email')
      .limit(8000);
    if (sErr) throw sErr;

    for (const student of students || []) {
      if (reportedSet.has(student.id)) continue;
      if (alreadySent.has(student.id)) continue;

      const dest = await getStudentPhoneForReport(student);
      if (!dest) {
        log.push({ student_id: student.id, note: 'no_student_phone' });
        continue;
      }

      const tmplVars = {
        student_name: student.name || 'Öğrenci',
        studentName: student.name || 'Öğrenci'
      };
      const body = renderMessageTemplate(template.content, tmplVars);

      try {
        const sent = await sendAutomatedWhatsApp({
          phone: dest,
          templateType: 'report_reminder',
          vars: tmplVars
        });
        const { error: insErr } = await supabaseAdmin.from('message_logs').insert({
          student_id: student.id,
          kind: 'report_reminder',
          related_id: null,
          message: sent.bodyPreview || body,
          status: sent.ok ? 'sent' : 'failed',
          log_date: today,
          error: sent.ok ? null : sent.error || null,
          phone: dest,
          twilio_sid: null,
          twilio_error_code: sent.errorCode || null,
          twilio_content_sid: null,
          meta_message_id: sent.sid || null,
          meta_template_name: sent.meta_template_name || null
        });
        if (insErr?.code === '23505') log.push({ student_id: student.id, note: 'duplicate_race' });
        else if (insErr) log.push({ student_id: student.id, error: insErr.message });
        else if (sent.ok) {
          alreadySent.add(student.id);
          log.push({ student_id: student.id, ok: true });
        } else {
          log.push({ student_id: student.id, error: sent.error, twilio_error_code: sent.errorCode });
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        await supabaseAdmin.from('message_logs').insert({
          student_id: student.id,
          kind: 'report_reminder',
          related_id: null,
          message: body,
          status: 'failed',
          log_date: today,
          error: errMsg,
          phone: dest,
          twilio_sid: null,
          twilio_error_code: null,
          twilio_content_sid: null,
          meta_message_id: null,
          meta_template_name: null
        });
        log.push({ student_id: student.id, error: errMsg });
      }
    }

    const sent = log.filter((x) => x && x.ok === true).length;
    const failed = log.filter((x) => x && x.error).length;
    await recordCronRun({
      jobKey: 'daily_report_reminder',
      ok: true,
      messagesSent: sent,
      messagesFailed: failed,
      detail: { processed: log.length }
    });
    return res.status(200).json({ ok: true, processed: sent, log });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordCronRun({ jobKey: 'daily_report_reminder', ok: false, detail: { error: msg } });
    return res.status(500).json({
      ok: false,
      error: msg,
      log,
      hint: 'Tablolar: student-coaching-system/sql/2026-05-03-whatsapp-automation-templates-logs.sql'
    });
  }
}
