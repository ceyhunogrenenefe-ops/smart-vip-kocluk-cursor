/**
 * Günlük rapor hatırlatması — rapor girmeyen öğrencilere WhatsApp.
 * Kanal: kurum Meta WhatsApp API (notification-config report_reminder).
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
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { coachDailyReportReminderEnabled } from './coach-notification-prefs.js';
import { getCoachGatewayHealth } from './message-service.js';
import { sendAutomationTemplateMessage } from './whatsapp-automation-channel.js';
import { resolveEffectiveSendChannel, SEND_CHANNELS } from './notification-config.js';

export function reportReminderSendChannel() {
  return resolveEffectiveSendChannel('report_reminder') === SEND_CHANNELS.META_API ? 'meta' : 'gateway';
}

export function reportReminderIstHour() {
  const raw = process.env.REPORT_REMINDER_IST_HOUR;
  if (raw != null && String(raw).trim() !== '') {
    const h = Number(raw);
    if (Number.isFinite(h) && h >= 0 && h <= 23) return Math.floor(h);
  }
  return 22;
}

function reportReminderPhoneKey(studentId, phone) {
  const norm = normalizePhoneToE164(phone) || String(phone || '').trim();
  return `${studentId}:${norm}`;
}

const coachPrefsCache = new Map();
const coachGatewayCache = new Map();

async function coachCanSendDailyReport(coachId) {
  const cid = String(coachId || '').trim();
  if (!cid) return { ok: false, reason: 'no_coach' };
  if (!coachPrefsCache.has(cid)) {
    coachPrefsCache.set(cid, await coachDailyReportReminderEnabled(cid));
  }
  if (!coachPrefsCache.get(cid)) return { ok: false, reason: 'disabled_by_coach' };
  if (reportReminderSendChannel() === 'meta') {
    return { ok: true };
  }
  if (!coachGatewayCache.has(cid)) {
    coachGatewayCache.set(cid, await getCoachGatewayHealth(cid));
  }
  const gw = coachGatewayCache.get(cid);
  if (!gw?.connected) {
    return { ok: false, reason: 'gateway_disconnected', gateway: gw };
  }
  return { ok: true, gateway: gw };
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

  const { data: template, error: tErr } = await supabaseAdmin
    .from('message_templates')
    .select('content, meta_template_name, is_active')
    .eq('type', 'report_reminder')
    .maybeSingle();
  if (tErr) throw tErr;
  if (!template?.content || template.is_active === false) {
    return { ok: true, skipped: 'no_report_reminder_template', channel, log };
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
  const sentPhoneKeys = new Set(
    (sentRows || [])
      .filter((r) => r.phone)
      .map((r) => reportReminderPhoneKey(r.student_id, r.phone))
  );

  const institutionFlags = await loadInstitutionWhatsappAutomationMap(supabaseAdmin);

  const { data: students, error: sErr } = await supabaseAdmin
    .from('students')
    .select('id,name,phone,parent_phone,email,institution_id,whatsapp_automation_enabled,coach_id')
    .limit(8000);
  if (sErr) throw sErr;

  for (const student of students || []) {
    if (!studentAllowsWhatsappAutomation(student, institutionFlags)) {
      log.push({ student_id: student.id, note: 'whatsapp_automation_disabled' });
      continue;
    }
    if (!studentNeedsReportReminder(student.id, entries || [], plannerStudentIds)) {
      continue;
    }

    const coachId = String(student.coach_id || '').trim();
    const coachGate = await coachCanSendDailyReport(coachId);
    if (!coachGate.ok) {
      log.push({
        student_id: student.id,
        coach_id: coachId || null,
        note: coachGate.reason,
        gateway_status: coachGate.gateway?.status || null
      });
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
      const phoneDedupeKey = reportReminderPhoneKey(student.id, phone);

      if (sentKeys.has(dedupeKey) || sentPhoneKeys.has(phoneDedupeKey)) {
        log.push({ student_id: student.id, phone, role, note: 'already_sent_today' });
        continue;
      }

      try {
        const sent = await sendAutomationTemplateMessage({
          phone,
          templateRow: template,
          vars: tmplVars,
          templateType: 'report_reminder',
          coachId
        });

        const usedChannel = sent.channel || 'coach_gateway';

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
            usedChannel === 'coach_gateway' || sent.meta_template_name === 'gateway_plain'
              ? 'gateway_plain'
              : sent.meta_template_name || template.meta_template_name || null
        });

        if (insErr?.code === '23505') {
          log.push({ student_id: student.id, phone, role, note: 'duplicate_race' });
        } else if (insErr) {
          log.push({ student_id: student.id, phone, role, error: insErr.message });
        } else if (sent.ok) {
          sentKeys.add(dedupeKey);
          sentPhoneKeys.add(phoneDedupeKey);
          log.push({
            student_id: student.id,
            coach_id: coachId,
            phone,
            role,
            ok: true,
            channel: usedChannel
          });
        } else {
          log.push({
            student_id: student.id,
            coach_id: coachId,
            phone,
            role,
            channel: usedChannel,
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
          meta_template_name: 'gateway_plain'
        });
        log.push({ student_id: student.id, coach_id: coachId, phone, role, error: errMsg });
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
