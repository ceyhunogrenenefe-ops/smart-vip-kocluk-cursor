import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { getIstanbulDateString, getIstanbulHour } from '../api/_lib/istanbul-time.js';
import { renderMessageTemplate } from '../api/_lib/template-engine.js';
import { sendAutomatedWhatsApp } from '../api/_lib/whatsapp-outbound.js';
import { metaWhatsAppConfigured } from '../api/_lib/meta-whatsapp.js';
import { getReportReminderRecipients } from '../api/_lib/meetings-resolve.js';
import { studentNeedsReportReminder } from '../api/_lib/report-reminder-eligibility.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';

/** İstanbul 22:00 — vercel.json `0 19 * * *` (UTC+3) */
const REPORT_REMINDER_IST_HOUR = 22;

/**
 * Meta şablon: message_templates.type = report_reminder
 * meta_template_name Meta BM ile aynı olmalı (örn. report_reminder).
 *
 * `auth.source === 'vercel'`: yalnızca İstanbul saati 22 iken gönder.
 * Bearer ile manuel tetikleme: saat filtresi atlanır.
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

  if (auth.source === 'vercel' && hourIst !== REPORT_REMINDER_IST_HOUR) {
    await recordCronRun({
      jobKey: 'daily_report_reminder',
      ok: true,
      skipped: 'report_reminder_only_istanbul_hour_22',
      detail: { istanbul_hour: hourIst, expected_hour: REPORT_REMINDER_IST_HOUR }
    });
    return res.status(200).json({
      ok: true,
      skipped: 'report_reminder_only_istanbul_hour_22',
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
      .select('content, meta_template_name, is_active')
      .eq('type', 'report_reminder')
      .maybeSingle();
    if (tErr) throw tErr;
    if (!template?.content || template.is_active === false) {
      await recordCronRun({ jobKey: 'daily_report_reminder', ok: true, skipped: 'no_report_reminder_template' });
      return res.status(200).json({ ok: true, skipped: 'no_report_reminder_template', log });
    }
    if (!String(template.meta_template_name || '').trim()) {
      await recordCronRun({
        jobKey: 'daily_report_reminder',
        ok: true,
        skipped: 'meta_template_name_missing',
        detail: { hint: 'message_templates.meta_template_name = report_reminder (Meta BM adı)' }
      });
      return res.status(200).json({ ok: true, skipped: 'meta_template_name_missing', log });
    }

    const { data: entries, error: eErr } = await supabaseAdmin
      .from('weekly_entries')
      .select('student_id,correct,wrong,blank,solved_questions')
      .eq('date', today);
    if (eErr) throw eErr;

    const { data: plannerRows, error: pErr } = await supabaseAdmin
      .from('weekly_planner_entries')
      .select('student_id')
      .eq('planner_date', today);
    if (pErr) throw pErr;

    const plannerStudentIds = new Set((plannerRows || []).map((r) => String(r.student_id)));

    const { data: sentRows } = await supabaseAdmin
      .from('message_logs')
      .select('student_id, kind, phone')
      .in('kind', ['report_reminder', 'report_reminder_parent'])
      .eq('log_date', today)
      .eq('status', 'sent');
    const sentKeys = new Set(
      (sentRows || []).map((r) => `${r.student_id}:${r.kind}:${String(r.phone || '').trim()}`)
    );

    const { data: students, error: sErr } = await supabaseAdmin
      .from('students')
      .select('id,name,phone,parent_phone,email')
      .limit(8000);
    if (sErr) throw sErr;

    for (const student of students || []) {
      if (!studentNeedsReportReminder(student.id, entries || [], plannerStudentIds)) {
        continue;
      }

      const recipients = getReportReminderRecipients(student);
      if (!recipients.length) {
        log.push({ student_id: student.id, note: 'no_phone' });
        continue;
      }

      const tmplVars = {
        student_name: student.name || 'Öğrenci',
        studentName: student.name || 'Öğrenci'
      };
      const body = renderMessageTemplate(template.content, tmplVars);

      for (const { phone, role, kind } of recipients) {
        const dedupeKey = `${student.id}:${kind}:${phone}`;
        if (sentKeys.has(dedupeKey)) {
          log.push({ student_id: student.id, phone, role, note: 'already_sent_today' });
          continue;
        }

        try {
          const sent = await sendAutomatedWhatsApp({
            phone,
            templateType: 'report_reminder',
            vars: tmplVars
          });
          const { error: insErr } = await supabaseAdmin.from('message_logs').insert({
            student_id: student.id,
            kind,
            related_id: null,
            message: sent.bodyPreview || body,
            status: sent.ok ? 'sent' : 'failed',
            log_date: today,
            error: sent.ok ? null : sent.error || null,
            phone,
            twilio_sid: null,
            twilio_error_code: sent.errorCode || null,
            twilio_content_sid: null,
            meta_message_id: sent.sid || null,
            meta_template_name: sent.meta_template_name || template.meta_template_name || null
          });
          if (insErr?.code === '23505') {
            log.push({ student_id: student.id, phone, role, note: 'duplicate_race' });
          } else if (insErr) {
            log.push({ student_id: student.id, phone, role, error: insErr.message });
          } else if (sent.ok) {
            sentKeys.add(dedupeKey);
            log.push({ student_id: student.id, phone, role, ok: true });
          } else {
            log.push({
              student_id: student.id,
              phone,
              role,
              error: sent.error,
              twilio_error_code: sent.errorCode
            });
          }
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          await supabaseAdmin.from('message_logs').insert({
            student_id: student.id,
            kind,
            related_id: null,
            message: body,
            status: 'failed',
            log_date: today,
            error: errMsg,
            phone,
            twilio_sid: null,
            twilio_error_code: null,
            twilio_content_sid: null,
            meta_message_id: null,
            meta_template_name: template.meta_template_name || null
          });
          log.push({ student_id: student.id, phone, role, error: errMsg });
        }
      }
    }

    const sent = log.filter((x) => x && x.ok === true).length;
    const failed = log.filter((x) => x && x.error).length;
    await recordCronRun({
      jobKey: 'daily_report_reminder',
      ok: true,
      messagesSent: sent,
      messagesFailed: failed,
      detail: { processed: log.length, istanbul_hour: hourIst }
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
