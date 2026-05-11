import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { getIstanbulDateString, getIstanbulHour } from '../api/_lib/istanbul-time.js';
import { renderMessageTemplate } from '../api/_lib/template-engine.js';
import { sendAutomatedWhatsApp } from '../api/_lib/whatsapp-outbound.js';
import { metaWhatsAppConfigured } from '../api/_lib/meta-whatsapp.js';
import { getStudentPhoneForReport } from '../api/_lib/meetings-resolve.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';

/**
 * İstanbul 22:00 — Bugün için henüz günlük kayıt girmemiş öğrencilere hatırlatma.
 * Şablon: message_templates.type = `study_evening_reminder`
 *
 * Manuel Bearer ile tetiklenebilir (saat filtresi atlanır).
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized cron' });

  const metaReady = metaWhatsAppConfigured();
  const hourIst = getIstanbulHour();

  if (auth.source === 'vercel' && hourIst !== 22) {
    await recordCronRun({
      jobKey: 'study_evening_reminder',
      ok: true,
      skipped: 'only_istanbul_hour_22',
      detail: { istanbul_hour: hourIst },
    });
    return res.status(200).json({
      ok: true,
      skipped: 'only_istanbul_hour_22',
      istanbul_hour: hourIst,
      log: [],
    });
  }

  if (!metaReady) {
    await recordCronRun({ jobKey: 'study_evening_reminder', ok: true, skipped: 'missing_meta_whatsapp_env' });
    return res.status(200).json({ ok: true, skipped: 'missing_meta_whatsapp_env', log: [] });
  }

  const log = [];
  const today = getIstanbulDateString();

  try {
    const { data: template, error: tErr } = await supabaseAdmin
      .from('message_templates')
      .select('content')
      .eq('type', 'study_evening_reminder')
      .maybeSingle();
    if (tErr) throw tErr;
    if (!template?.content) {
      await recordCronRun({
        jobKey: 'study_evening_reminder',
        ok: true,
        skipped: 'no_study_evening_reminder_template',
      });
      return res.status(200).json({ ok: true, skipped: 'no_study_evening_reminder_template', log });
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
      .eq('kind', 'study_evening_reminder')
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
        studentName: student.name || 'Öğrenci',
        lesson_name: '',
        time: '',
        link: '',
      };
      const body = renderMessageTemplate(template.content, tmplVars);

      try {
        const sent = await sendAutomatedWhatsApp({
          phone: dest,
          templateType: 'study_evening_reminder',
          vars: tmplVars,
        });
        const { error: insErr } = await supabaseAdmin.from('message_logs').insert({
          student_id: student.id,
          kind: 'study_evening_reminder',
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
          meta_template_name: sent.meta_template_name || null,
        });
        if (insErr?.code === '23505') log.push({ student_id: student.id, note: 'duplicate_race' });
        else if (insErr) log.push({ student_id: student.id, error: insErr.message });
        else if (sent.ok) {
          alreadySent.add(student.id);
          log.push({ student_id: student.id, ok: true });
        } else {
          log.push({ student_id: student.id, error: sent.error, twilio_error_code: sent.errorCode });
        }
      } catch (sendErr) {
        log.push({ student_id: student.id, ok: false, note: String(sendErr) });
      }
    }

    await recordCronRun({
      jobKey: 'study_evening_reminder',
      ok: true,
      detail: { sent: log.filter((l) => l.ok).length },
    });
    return res.status(200).json({ ok: true, today, log });
  } catch (e) {
    console.error('[cron-study-evening-reminder]', e);
    await recordCronRun({ jobKey: 'study_evening_reminder', ok: false, detail: { error: String(e) } });
    return res.status(500).json({ ok: false, error: String(e) });
  }
}
