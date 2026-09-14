/**
 * CRM görev hatırlatması — atanan ajana due_at'ten ~5 dk önce.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { GRADE_PROGRAM_LABELS } from './registration-tracking-utils.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { sendMetaTextMessage, metaWhatsAppConfigured } from './meta-whatsapp.js';
import { insertWhatsAppAutomationLog } from './message-log.js';
import { reclassifyLeadGradesFromSnippets } from './registration-channel-ingest.js';

export const CRM_TASK_REMINDER_KIND = 'crm_task_reminder';
export const CRM_TASK_REMINDER_LEAD_MS = 5 * 60 * 1000;
const WINDOW_MIN_MS = 3.5 * 60 * 1000;
const WINDOW_MAX_MS = 6.5 * 60 * 1000;
const LATE_GRACE_MS = 2 * 60 * 1000;
const PANEL_ORIGIN = 'https://www.dersonlinevipkocluk.com';

/** due_at 5 dk kala (veya cron gecikmesinde hemen önce / 2 dk gecikmeye kadar). */
export function isCrmTaskReminderWindow(dueAt, nowMs = Date.now()) {
  if (!dueAt) return false;
  const due = new Date(dueAt).getTime();
  if (!Number.isFinite(due)) return false;
  const until = due - nowMs;
  if (until > WINDOW_MAX_MS) return false;
  if (until >= WINDOW_MIN_MS) return true;
  if (until > 0 && until < WINDOW_MIN_MS) return true;
  if (until <= 0 && until >= -LATE_GRACE_MS) return true;
  return false;
}

export function formatCrmTaskReminderText({
  agentName,
  title,
  leadName,
  leadPhone,
  dueAt,
  gradeLabel,
  panelUrl
}) {
  const when = dueAt
    ? new Date(dueAt).toLocaleString('tr-TR', {
        timeZone: 'Europe/Istanbul',
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit'
      })
    : '';
  const who = agentName ? `${agentName}, ` : '';
  const lines = [
    `${who}CRM görevinize 5 dakika kaldı.`,
    title ? `Görev: ${title}` : null,
    leadName ? `Lead: ${leadName}${gradeLabel ? ` · ${gradeLabel}` : ''}` : null,
    leadPhone ? `Telefon: ${leadPhone}` : null,
    when ? `Saat: ${when}` : null,
    panelUrl ? `Panel: ${panelUrl}` : null
  ].filter(Boolean);
  return lines.join('\n');
}

function reminderLink(taskId, leadId) {
  const q = new URLSearchParams();
  q.set('rt_task', taskId);
  if (leadId) q.set('rt_lead', leadId);
  return `/crm?${q.toString()}`;
}

async function hasInAppReminder(taskId) {
  try {
    const { data } = await supabaseAdmin
      .from('platform_notifications')
      .select('id')
      .ilike('link_url', `%rt_task=${taskId}%`)
      .limit(1);
    return Boolean(data?.length);
  } catch {
    return false;
  }
}

async function hasWaReminder(taskId) {
  try {
    const { data } = await supabaseAdmin
      .from('message_logs')
      .select('id')
      .eq('kind', CRM_TASK_REMINDER_KIND)
      .eq('related_id', taskId)
      .in('status', ['sent', 'skipped'])
      .limit(1);
    return Boolean(data?.length);
  } catch {
    return false;
  }
}

async function markReminderSent(task) {
  try {
    await supabaseAdmin
      .from('registration_tasks')
      .update({ reminder_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', task.id);
  } catch {
    /* kolon yoksa sessiz */
  }
}

async function notifyAgentInApp({ task, text, institutionId }) {
  if (!task.assigned_to) return false;
  try {
    await supabaseAdmin.from('platform_notifications').insert({
      title: 'CRM görev hatırlatması (5 dk)',
      body: text.slice(0, 4000),
      target_type: 'user',
      target_user_id: task.assigned_to,
      sender_user_id: 'system',
      sender_role: 'admin',
      institution_id: institutionId || task.institution_id || null,
      priority: 'high',
      link_url: reminderLink(task.id, task.lead_id)
    });
    return true;
  } catch (e) {
    console.warn('[crm-task-reminders] notify:', e instanceof Error ? e.message : e);
    return false;
  }
}

async function loadAgentContact(userId) {
  if (!userId) return null;
  const { data } = await supabaseAdmin
    .from('users')
    .select('id, name, email, phone')
    .eq('id', userId)
    .maybeSingle();
  if (!data) return null;
  let phone = data.phone || '';
  if (!normalizePhoneToE164(phone) && data.email) {
    const { data: coach } = await supabaseAdmin
      .from('coaches')
      .select('phone')
      .eq('email', data.email)
      .maybeSingle();
    if (coach?.phone) phone = coach.phone;
  }
  return { ...data, phone };
}

async function sendAgentWhatsApp(agent, text, taskId) {
  const e164 = normalizePhoneToE164(agent?.phone);
  if (!e164 || !metaWhatsAppConfigured()) {
    await insertWhatsAppAutomationLog({
      studentId: null,
      relatedId: taskId,
      kind: CRM_TASK_REMINDER_KIND,
      message: text,
      status: 'skipped',
      error: e164 ? 'meta_not_configured' : 'agent_phone_missing',
      phone: e164
    });
    return { ok: false, skipped: true };
  }
  try {
    const sent = await sendMetaTextMessage({ toE164: e164, text });
    await insertWhatsAppAutomationLog({
      studentId: null,
      relatedId: taskId,
      kind: CRM_TASK_REMINDER_KIND,
      message: text,
      status: 'sent',
      phone: e164,
      meta_message_id: sent?.messageId || sent?.id || null
    });
    return { ok: true };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await insertWhatsAppAutomationLog({
      studentId: null,
      relatedId: taskId,
      kind: CRM_TASK_REMINDER_KIND,
      message: text,
      status: 'failed',
      error: err,
      phone: e164
    });
    return { ok: false, error: err };
  }
}

export async function runCrmTaskRemindersJob({ triggeredBy = 'crm-task-reminders' } = {}) {
  const now = Date.now();
  const windowStart = new Date(now - LATE_GRACE_MS).toISOString();
  const windowEnd = new Date(now + WINDOW_MAX_MS).toISOString();

  let gradeFix = { scanned: 0, updated: 0 };
  try {
    gradeFix = await reclassifyLeadGradesFromSnippets({ limit: 200 });
  } catch (e) {
    console.warn('[crm-task-reminders] grade backfill:', e instanceof Error ? e.message : e);
  }

  const { data: tasks, error } = await supabaseAdmin
    .from('registration_tasks')
    .select(
      'id, lead_id, institution_id, assigned_to, title, description, task_type, status, due_at, reminder_sent_at'
    )
    .in('status', ['pending', 'in_progress', 'overdue'])
    .not('due_at', 'is', null)
    .gte('due_at', windowStart)
    .lte('due_at', windowEnd)
    .limit(80);

  let rows = tasks || [];
  if (error) {
    if (/reminder_sent_at|column/i.test(error.message || '')) {
      const { data: flat, error: e2 } = await supabaseAdmin
        .from('registration_tasks')
        .select('id, lead_id, institution_id, assigned_to, title, description, task_type, status, due_at')
        .in('status', ['pending', 'in_progress', 'overdue'])
        .not('due_at', 'is', null)
        .gte('due_at', windowStart)
        .lte('due_at', windowEnd)
        .limit(80);
      if (e2) throw e2;
      rows = flat || [];
    } else {
      throw error;
    }
  }

  const due = rows.filter((t) => !t.reminder_sent_at && isCrmTaskReminderWindow(t.due_at, now));
  const leadIds = [...new Set(due.map((t) => t.lead_id).filter(Boolean))];
  let leads = [];
  if (leadIds.length) {
    const { data } = await supabaseAdmin
      .from('registration_leads')
      .select('id, first_name, last_name, full_name, phone, normalized_phone, grade_program')
      .in('id', leadIds);
    leads = data || [];
  }
  const leadById = Object.fromEntries(leads.map((l) => [l.id, l]));

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const task of due) {
    const inAppDone = await hasInAppReminder(task.id);
    const waDone = await hasWaReminder(task.id);
    if (inAppDone && waDone) {
      await markReminderSent(task);
      skipped += 1;
      continue;
    }
    const lead = leadById[task.lead_id] || {};
    const agent = await loadAgentContact(task.assigned_to);
    const leadName = lead.full_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Lead';
    const text = formatCrmTaskReminderText({
      agentName: agent?.name || '',
      title: task.title,
      leadName,
      leadPhone: lead.phone || lead.normalized_phone || '',
      dueAt: task.due_at,
      gradeLabel: GRADE_PROGRAM_LABELS[lead.grade_program] || lead.grade_program || '',
      panelUrl: `${PANEL_ORIGIN}${reminderLink(task.id, task.lead_id)}`
    });
    let inApp = inAppDone;
    if (!inApp) inApp = await notifyAgentInApp({ task, text, institutionId: task.institution_id });
    let wa = waDone ? { ok: true } : await sendAgentWhatsApp(agent, text, task.id);
    if (inApp || wa.ok || wa.skipped) {
      await markReminderSent(task);
      if (wa.ok || inApp) sent += 1;
      else skipped += 1;
    } else {
      failed += 1;
    }
  }

  return {
    ok: true,
    triggeredBy,
    scanned: rows.length,
    due: due.length,
    sent,
    skipped,
    failed,
    grade_backfill: gradeFix
  };
}
