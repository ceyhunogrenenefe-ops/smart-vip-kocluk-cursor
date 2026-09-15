/**
 * CRM canlı ops: ajan presence + 5 dk yanıtsız inbound → yönetici WhatsApp.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { sendMetaTextMessage, metaWhatsAppConfigured } from './meta-whatsapp.js';
import { insertWhatsAppAutomationLog } from './message-log.js';

export const CRM_REPLY_SLA_MS = 5 * 60 * 1000;
export const CRM_PRESENCE_ONLINE_MS = 90 * 1000;
export const CRM_REPLY_SLA_KIND = 'crm_reply_sla_manager';

const PANEL_URL = 'https://www.dersonlinevipkocluk.com/crm/inbox';

export function isPresenceOnline(lastSeenAt, nowMs = Date.now()) {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(t)) return false;
  return nowMs - t <= CRM_PRESENCE_ONLINE_MS;
}

export function formatReplySlaText({ contactName, channel, waitingMinutes, preview, panelUrl }) {
  const who = contactName || 'Bilinmeyen lead';
  const ch = channel || 'mesaj';
  const wait = waitingMinutes != null ? `${waitingMinutes} dk` : '5+ dk';
  return [
    `⚠️ CRM SLA: ${wait} yanıtsız ${ch} mesajı`,
    `Lead: ${who}`,
    preview ? `Önizleme: ${String(preview).slice(0, 120)}` : null,
    `Panel: ${panelUrl || PANEL_URL}`
  ]
    .filter(Boolean)
    .join('\n');
}

function isManagerUser(user) {
  const roles = [
    String(user?.role || '').toLowerCase(),
    ...((Array.isArray(user?.roles) ? user.roles : []).map((r) => String(r || '').toLowerCase()))
  ];
  return roles.some((r) => ['super_admin', 'admin', 'crm_manager', 'manager'].includes(r));
}

function isInboundMessage(msg) {
  if (!msg) return false;
  const dir = String(msg.direction || '').toLowerCase();
  if (dir === 'inbound') return true;
  if (dir === 'outbound') return false;
  return String(msg.sender_type || '').toLowerCase() === 'lead';
}

export async function upsertCrmAgentPresence({
  userId,
  institutionId = null,
  pagePath = null,
  userAgent = null
} = {}) {
  if (!userId) return { ok: false, error: 'user_id_required' };
  const now = new Date().toISOString();
  const row = {
    user_id: String(userId),
    institution_id: institutionId || null,
    last_seen_at: now,
    page_path: pagePath ? String(pagePath).slice(0, 240) : null,
    user_agent: userAgent ? String(userAgent).slice(0, 240) : null,
    updated_at: now
  };
  const { error } = await supabaseAdmin.from('crm_agent_presence').upsert(row, { onConflict: 'user_id' });
  if (error) {
    if (/crm_agent_presence|does not exist|schema cache/i.test(error.message || '')) {
      return { ok: false, error: 'presence_table_missing', hint: 'sql/2026-09-14-crm-live-ops.sql' };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, last_seen_at: now };
}

export async function listCrmAgentPresence({ institutionId = null, onlineOnly = false } = {}) {
  let q = supabaseAdmin
    .from('crm_agent_presence')
    .select('user_id, institution_id, last_seen_at, page_path, updated_at')
    .order('last_seen_at', { ascending: false })
    .limit(200);
  if (institutionId) q = q.eq('institution_id', institutionId);
  const { data, error } = await q;
  if (error) {
    if (/crm_agent_presence|does not exist|schema cache/i.test(error.message || '')) {
      return { ok: false, error: 'presence_table_missing', items: [], online_count: 0 };
    }
    throw error;
  }
  const now = Date.now();
  const rows = data || [];
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  let usersById = {};
  if (userIds.length) {
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, name, email, role, roles, phone')
      .in('id', userIds);
    usersById = Object.fromEntries((users || []).map((u) => [u.id, u]));
  }
  let items = rows.map((r) => {
    const u = usersById[r.user_id] || {};
    return {
      user_id: r.user_id,
      name: u.name || u.email || r.user_id,
      email: u.email || null,
      role: u.role || null,
      roles: u.roles || [],
      phone: u.phone || null,
      last_seen_at: r.last_seen_at,
      page_path: r.page_path,
      online: isPresenceOnline(r.last_seen_at, now)
    };
  });
  if (onlineOnly) items = items.filter((i) => i.online);
  return { ok: true, items, online_count: items.filter((i) => i.online).length };
}

async function resolveManagerPhones(institutionId) {
  const envPhone =
    process.env.CRM_MANAGER_WHATSAPP ||
    process.env.CRM_SLA_MANAGER_PHONE ||
    process.env.CRM_OPS_MANAGER_PHONE ||
    '';
  const phones = new Set();
  const e164Env = normalizePhoneToE164(envPhone);
  if (e164Env) phones.add(e164Env);

  try {
    let q = supabaseAdmin
      .from('users')
      .select('id, name, email, phone, role, roles, institution_id')
      .not('phone', 'is', null)
      .limit(100);
    if (institutionId) q = q.or(`institution_id.eq.${institutionId},institution_id.is.null`);
    const { data } = await q;
    for (const u of data || []) {
      if (!isManagerUser(u)) continue;
      const e164 = normalizePhoneToE164(u.phone);
      if (e164) phones.add(e164);
    }
  } catch {
    /* ignore */
  }
  return [...phones];
}

async function alreadyAlerted(conversationId, inboundMessageId) {
  const { data } = await supabaseAdmin
    .from('crm_reply_sla_alerts')
    .select('id, inbound_message_id')
    .eq('conversation_id', conversationId)
    .maybeSingle();
  if (!data?.id) return false;
  // Aynı inbound için tekrar gönderme; yeni yanıtsız mesajda yeniden uyar
  if (inboundMessageId && data.inbound_message_id && String(data.inbound_message_id) !== String(inboundMessageId)) {
    return false;
  }
  return true;
}

/** Son mesaj lead’den ve ≥5 dk geçmiş konuşmaları yöneticiye bildir. */
export async function runCrmReplySlaJob({ triggeredBy = 'crm-reply-sla' } = {}) {
  const cutoff = new Date(Date.now() - CRM_REPLY_SLA_MS).toISOString();
  const { data: convs, error } = await supabaseAdmin
    .from('crm_conversations')
    .select(
      'id, institution_id, channel, contact_name, contact_identifier, last_message_at, last_message_preview, status, assigned_user_id'
    )
    .in('status', ['open', 'pending'])
    .lt('last_message_at', cutoff)
    .order('last_message_at', { ascending: true })
    .limit(40);

  if (error) {
    return { ok: false, error: error.message, scanned: 0, notified: 0, skipped: 0 };
  }

  let scanned = 0;
  let notified = 0;
  let skipped = 0;
  const details = [];

  for (const conv of convs || []) {
    scanned += 1;
    const { data: lastMsgs } = await supabaseAdmin
      .from('crm_messages')
      .select('id, sender_type, direction, body, created_at')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: false })
      .limit(1);

    const last = lastMsgs?.[0];
    if (!last || !isInboundMessage(last)) {
      skipped += 1;
      continue;
    }
    if (await alreadyAlerted(conv.id, last.id)) {
      skipped += 1;
      continue;
    }
    const lastAt = new Date(last.created_at || conv.last_message_at).getTime();
    if (!Number.isFinite(lastAt) || Date.now() - lastAt < CRM_REPLY_SLA_MS) {
      skipped += 1;
      continue;
    }

    const waitingSeconds = Math.round((Date.now() - lastAt) / 1000);
    const waitingMinutes = Math.max(5, Math.round(waitingSeconds / 60));
    const text = formatReplySlaText({
      contactName: conv.contact_name || conv.contact_identifier,
      channel: conv.channel,
      waitingMinutes,
      preview: last.body || conv.last_message_preview,
      panelUrl: `${PANEL_URL}?c=${conv.id}`
    });

    const phones = await resolveManagerPhones(conv.institution_id);
    const waReady = metaWhatsAppConfigured();

    if (!phones.length || !waReady) {
      await supabaseAdmin.from('crm_reply_sla_alerts').upsert(
        {
          institution_id: conv.institution_id,
          conversation_id: conv.id,
          inbound_message_id: last.id,
          channel: conv.channel,
          contact_name: conv.contact_name,
          contact_identifier: conv.contact_identifier,
          waiting_seconds: waitingSeconds,
          manager_phone: null,
          notified_at: new Date().toISOString()
        },
        { onConflict: 'conversation_id' }
      );
      await insertWhatsAppAutomationLog({
        studentId: null,
        relatedId: conv.id,
        kind: CRM_REPLY_SLA_KIND,
        message: text,
        status: 'skipped',
        error: !phones.length ? 'manager_phone_missing' : 'meta_not_configured'
      });
      skipped += 1;
      details.push({ conversation_id: conv.id, status: 'skipped_no_manager', triggered_by: triggeredBy });
      continue;
    }

    let metaMessageId = null;
    let sendOk = false;
    let lastPhone = phones[0];
    for (const phone of phones) {
      lastPhone = phone;
      try {
        const sent = await sendMetaTextMessage({ toE164: phone, text });
        metaMessageId = sent?.messageId || sent?.id || null;
        sendOk = true;
        await insertWhatsAppAutomationLog({
          studentId: null,
          relatedId: conv.id,
          kind: CRM_REPLY_SLA_KIND,
          message: text,
          status: 'sent',
          phone,
          meta_message_id: metaMessageId
        });
        break;
      } catch (e) {
        await insertWhatsAppAutomationLog({
          studentId: null,
          relatedId: conv.id,
          kind: CRM_REPLY_SLA_KIND,
          message: text,
          status: 'failed',
          phone,
          error: e instanceof Error ? e.message : String(e)
        });
      }
    }

    await supabaseAdmin.from('crm_reply_sla_alerts').upsert(
      {
        institution_id: conv.institution_id,
        conversation_id: conv.id,
        inbound_message_id: last.id,
        channel: conv.channel,
        contact_name: conv.contact_name,
        contact_identifier: conv.contact_identifier,
        waiting_seconds: waitingSeconds,
        manager_phone: lastPhone,
        notified_at: new Date().toISOString(),
        meta_message_id: metaMessageId
      },
      { onConflict: 'conversation_id' }
    );

    if (sendOk) notified += 1;
    details.push({
      conversation_id: conv.id,
      status: sendOk ? 'notified' : 'send_failed',
      waiting_seconds: waitingSeconds,
      triggered_by: triggeredBy
    });
  }

  return { ok: true, scanned, notified, skipped, details };
}
