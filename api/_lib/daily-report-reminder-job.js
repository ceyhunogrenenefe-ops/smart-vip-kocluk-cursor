/**
 * Günlük rapor hatırlatması — rapor girmeyen öğrencilere WhatsApp.
 * Kanal: varsayılan gateway (ücretsiz Baileys); Meta yedek. WHATSAPP_AUTOMATION_CHANNEL=gateway|meta
 */
import { supabaseAdmin } from './supabase-admin.js';
import { getIstanbulDateString, getIstanbulHour } from './istanbul-time.js';
import { renderMessageTemplate } from './template-engine.js';
import { getReportReminderRecipients } from './meetings-resolve.js';
import { studentNeedsReportReminder } from './report-reminder-eligibility.js';
import {
  loadInstitutionWhatsappAutomationMap,
  studentAllowsWhatsappAutomation
} from './whatsapp-automation-eligibility.js';
import {
  gatewayConfiguredForSession,
  reportReminderGatewaySessionId,
  sendGatewayTextMessage
} from './whatsapp-gateway-send.js';
import { sendAutomatedWhatsApp } from './whatsapp-outbound.js';
import { reportReminderSendChannel as resolveReportChannel } from './whatsapp-automation-channel.js';

export function reportReminderSendChannel() {
  return resolveReportChannel();
}

export function reportReminderIstHour() {
  const raw = process.env.REPORT_REMINDER_IST_HOUR;
  if (raw != null && String(raw).trim() !== '') {
    const h = Number(raw);
    if (Number.isFinite(h) && h >= 0 && h <= 23) return Math.floor(h);
  }
  return 22;
}

/**
 * @param {{ skipHourCheck?: boolean, istanbulHour?: number, todayTr?: string }} opts
 */
export async function runDailyReportReminderJob(opts = {}) {
  const channel = reportReminderSendChannel();
  const expectedHour = reportReminderIstHour();
  const hourIst = opts.istanbulHour != null ? opts.istanbulHour : getIstanbulHour();
  const today = opts.todayTr ?? getIstanbulDateString();
  const log = [];

  if (!opts.skipHourCheck && hourIst !== expectedHour) {
    return {
      ok: true,
      skipped: 'report_reminder_wrong_istanbul_hour',
      channel,
      istanbul_hour: hourIst,
      expected_hour: expectedHour,
      log
    };
  }

  if (channel === 'none') {
    return {
      ok: false,
      skipped: true,
      reason: 'no_report_reminder_channel',
      hint: 'Gateway: REPORT_REMINDER_GATEWAY_SESSION_ID + WHATSAPP_GATEWAY_UPSTREAM. Meta: META_WHATSAPP_TOKEN.',
      log
    };
  }

  const { data: template, error: tErr } = await supabaseAdmin
    .from('message_templates')
    .select('content, meta_template_name, is_active')
    .eq('type', 'report_reminder')
    .maybeSingle();
  if (tErr) throw tErr;
  if (!template?.content || template.is_active === false) {
    return { ok: true, skipped: 'no_report_reminder_template', channel, log };
  }

  if (channel === 'meta' && !String(template.meta_template_name || '').trim()) {
    return {
      ok: true,
      skipped: 'meta_template_name_missing',
      channel,
      hint: 'message_templates.meta_template_name veya WHATSAPP_AUTOMATION_CHANNEL=gateway',
      log
    };
  }

  if (channel === 'gateway') {
    const sessionId = reportReminderGatewaySessionId();
    if (!gatewayConfiguredForSession(sessionId)) {
      return {
        ok: false,
        skipped: true,
        reason: 'gateway_env_missing',
        channel,
        hint: 'REPORT_REMINDER_GATEWAY_SESSION_ID, WHATSAPP_GATEWAY_UPSTREAM, APP_JWT_SECRET',
        log
      };
    }
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

  const institutionFlags = await loadInstitutionWhatsappAutomationMap(supabaseAdmin);

  const { data: students, error: sErr } = await supabaseAdmin
    .from('students')
    .select('id,name,phone,parent_phone,email,institution_id,whatsapp_automation_enabled')
    .limit(8000);
  if (sErr) throw sErr;

  const gatewaySessionId = reportReminderGatewaySessionId();

  for (const student of students || []) {
    if (!studentAllowsWhatsappAutomation(student, institutionFlags)) {
      log.push({ student_id: student.id, note: 'whatsapp_automation_disabled' });
      continue;
    }
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
        const sent =
          channel === 'gateway'
            ? await sendGatewayTextMessage({
                phone,
                message: body,
                sessionId: gatewaySessionId,
                sessionCandidates: [
                  gatewaySessionId,
                  reportReminderGatewaySessionId(),
                  String(process.env.BOOK_ORDER_GATEWAY_SESSION_ID || '').trim()
                ].filter(Boolean),
                allowSharedFallback: true
              })
            : await sendAutomatedWhatsApp({
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
          meta_message_id: sent.sid || sent.gateway_message_id || sent.meta_message_id || null,
          meta_template_name:
            channel === 'gateway' ? 'gateway_plain' : sent.meta_template_name || template.meta_template_name || null
        });

        if (insErr?.code === '23505') {
          log.push({ student_id: student.id, phone, role, note: 'duplicate_race' });
        } else if (insErr) {
          log.push({ student_id: student.id, phone, role, error: insErr.message });
        } else if (sent.ok) {
          sentKeys.add(dedupeKey);
          log.push({ student_id: student.id, phone, role, ok: true, channel });
        } else {
          log.push({
            student_id: student.id,
            phone,
            role,
            channel,
            error: sent.error,
            error_code: sent.errorCode
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
          meta_template_name: channel === 'gateway' ? 'gateway_plain' : template.meta_template_name || null
        });
        log.push({ student_id: student.id, phone, role, error: errMsg });
      }
    }
  }

  const sent = log.filter((x) => x && x.ok === true).length;
  const failed = log.filter((x) => x && x.error).length;

  return {
    ok: true,
    channel,
    expected_hour: expectedHour,
    istanbul_hour: hourIst,
    today_tr: today,
    processed: sent,
    messages_sent: sent,
    messages_failed: failed,
    log
  };
}
