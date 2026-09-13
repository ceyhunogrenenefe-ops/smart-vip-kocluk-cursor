/**
 * CRM Unified Inbox — conversations / messages / Meta send / ad-source extract
 * Şirket hattı (0850 303 40 14 / META_PHONE_NUMBER_ID) üzerinden WA Cloud + IG DM.
 */
import { supabaseAdmin } from './supabase-admin.js';
import {
  loadMetaWhatsAppSecretsFromDb,
  metaWhatsAppConfigured,
  normalizePhoneToE164,
  sendMetaTextMessage
} from './meta-whatsapp.js';

/**
 * Meta WhatsApp `from` / Graph `to` için rakam kimliği (örn. 90555…).
 * 05… / +90… / 90… hepsini Cloud API formatına çevirir.
 */
export function toMetaWaContactId(phoneOrWaId) {
  const e164 = normalizePhoneToE164(phoneOrWaId);
  if (e164) return e164.replace(/\D/g, '');
  const d = String(phoneOrWaId || '')
    .replace(/^whatsapp:/i, '')
    .replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('90') && d.length >= 12) return d;
  if (d.startsWith('0') && d.length === 11) return `90${d.slice(1)}`;
  if (d.length === 10 && d.startsWith('5')) return `90${d}`;
  return d;
}

function snippet(text, max = 140) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function isoFromTs(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return new Date().toISOString();
  const ms = n > 1e12 ? n : n * 1000;
  return new Date(ms).toISOString();
}

/** Click-to-WhatsApp / Instagram ad referral metadata */
export function extractAdSourceData({ channel, message, messagingEvent } = {}) {
  const out = {};
  try {
    if (channel === 'whatsapp' && message && typeof message === 'object') {
      const ref = message.referral || null;
      if (ref && typeof ref === 'object') {
        out.source_type = ref.source_type || ref.source || 'whatsapp_ad';
        if (ref.source_id) out.source_id = String(ref.source_id);
        if (ref.source_url) out.source_url = String(ref.source_url);
        if (ref.headline) out.headline = String(ref.headline);
        if (ref.body) out.body = String(ref.body);
        if (ref.media_type) out.media_type = String(ref.media_type);
        if (ref.image_url) out.image_url = String(ref.image_url);
        if (ref.ctwa_clid) out.ctwa_clid = String(ref.ctwa_clid);
      }
    }
    if (channel === 'instagram' && messagingEvent && typeof messagingEvent === 'object') {
      const ref = messagingEvent.referral || messagingEvent.postback?.referral || null;
      if (ref && typeof ref === 'object') {
        out.source_type = ref.source || ref.type || 'instagram_ad';
        if (ref.ad_id) out.ad_id = String(ref.ad_id);
        if (ref.ads_context_data) out.ads_context_data = ref.ads_context_data;
        if (ref.ref) out.ref = String(ref.ref);
      }
    }
  } catch {
    /* ignore */
  }
  return Object.keys(out).length ? out : null;
}

/** Panel / kayıt takibi ile aynı ana kurum (Online Vip Dershane) */
const PRIMARY_CRM_INSTITUTION_ID = '73323d75-eea1-4552-8bba-d50555423589';

async function resolveDefaultInstitutionId() {
  const envId = String(
    process.env.CRM_INBOUND_INSTITUTION_ID ||
      process.env.REGISTRATION_INBOUND_INSTITUTION_ID ||
      process.env.META_WHATSAPP_DEFAULT_INSTITUTION_ID ||
      process.env.DEFAULT_INSTITUTION_ID ||
      ''
  ).trim();
  if (envId) return envId;

  // Env yoksa: kayıt takibi ile aynı PRIMARY kurum — aksi halde mesajlar yanlış
  // institution_id altına düşüp CRM listesinde görünmez.
  try {
    const { data: primary } = await supabaseAdmin
      .from('institutions')
      .select('id')
      .eq('id', PRIMARY_CRM_INSTITUTION_ID)
      .maybeSingle();
    if (primary?.id) return primary.id;
  } catch {
    /* fallback */
  }

  try {
    const { data: byName } = await supabaseAdmin
      .from('institutions')
      .select('id, name')
      .ilike('name', '%Online Vip%')
      .limit(5);
    const preferred =
      (byName || []).find((r) => /dershane/i.test(String(r.name || ''))) || byName?.[0];
    if (preferred?.id) return preferred.id;
  } catch {
    /* fallback */
  }

  try {
    const { data } = await supabaseAdmin.from('institutions').select('id').limit(1);
    return data?.[0]?.id || null;
  } catch {
    return null;
  }
}

export async function getCrmInboundInstitutionId() {
  return resolveDefaultInstitutionId();
}

/**
 * Upsert conversation + append message (inbound or outbound).
 * Idempotent on Meta message_id.
 */
export async function upsertCrmMessage({
  channel,
  contactIdentifier,
  contactName = null,
  body = null,
  mediaUrl = null,
  messageType = 'text',
  messageId = null,
  timestamp = null,
  direction = 'inbound',
  senderType = null,
  senderId = null,
  institutionId = null,
  leadId = null,
  adSourceData = null,
  payload = null,
  deliveryStatus = null
} = {}) {
  const ch = channel === 'instagram' ? 'instagram' : 'whatsapp';
  const rawContact = String(contactIdentifier || '').trim();
  const contact = ch === 'whatsapp' ? toMetaWaContactId(rawContact) || rawContact : rawContact;
  if (!contact) return { skipped: true, reason: 'missing_contact' };

  const instId = institutionId || (await resolveDefaultInstitutionId());
  const occurredAt = isoFromTs(timestamp);
  const extId = messageId ? String(messageId) : null;

  if (extId) {
    try {
      const { data: dup } = await supabaseAdmin
        .from('crm_messages')
        .select('id, conversation_id')
        .eq('message_id', extId)
        .maybeSingle();
      if (dup?.id) return { skipped: true, reason: 'duplicate', conversation_id: dup.conversation_id };
    } catch (e) {
      if (/crm_messages|does not exist|schema cache/i.test(e?.message || '')) {
        return { skipped: true, reason: 'table_missing' };
      }
    }
  }

  let conversation = null;
  try {
    let q = supabaseAdmin
      .from('crm_conversations')
      .select('*')
      .eq('channel', ch)
      .eq('contact_identifier', contact)
      .limit(1);
    if (instId) q = q.eq('institution_id', instId);
    const { data, error } = await q;
    if (error && !/crm_conversations|does not exist|schema cache/i.test(error.message || '')) throw error;
    conversation = Array.isArray(data) ? data[0] || null : data || null;
  } catch (e) {
    if (/crm_conversations|does not exist|schema cache/i.test(e?.message || '')) {
      return { skipped: true, reason: 'table_missing' };
    }
    throw e;
  }

  const now = new Date().toISOString();
  const preview = snippet(body);

  if (!conversation) {
    const row = {
      institution_id: instId,
      contact_identifier: contact,
      channel: ch,
      contact_name: contactName || null,
      status: 'open',
      lead_id: leadId || null,
      ad_source_data: adSourceData || {},
      last_message_at: occurredAt,
      last_message_preview: preview,
      unread_count: direction === 'inbound' ? 1 : 0,
      updated_at: now
    };
    const { data, error } = await supabaseAdmin.from('crm_conversations').insert(row).select('*').maybeSingle();
    if (error) {
      if (/duplicate|unique/i.test(error.message || '')) {
        const { data: again } = await supabaseAdmin
          .from('crm_conversations')
          .select('*')
          .eq('channel', ch)
          .eq('contact_identifier', contact)
          .eq('institution_id', instId)
          .maybeSingle();
        conversation = again;
      } else {
        throw error;
      }
    } else {
      conversation = data;
    }
  } else {
    const patch = {
      last_message_at: occurredAt,
      last_message_preview: preview,
      updated_at: now
    };
    if (conversation.status === 'closed' && direction === 'inbound') patch.status = 'open';
    if (contactName && !conversation.contact_name) patch.contact_name = contactName;
    if (leadId && !conversation.lead_id) patch.lead_id = leadId;
    if (adSourceData && Object.keys(adSourceData).length) {
      patch.ad_source_data = { ...(conversation.ad_source_data || {}), ...adSourceData };
    }
    if (direction === 'inbound') {
      patch.unread_count = Number(conversation.unread_count || 0) + 1;
    }
    const { data } = await supabaseAdmin
      .from('crm_conversations')
      .update(patch)
      .eq('id', conversation.id)
      .select('*')
      .maybeSingle();
    if (data) conversation = data;
  }

  if (!conversation?.id) return { skipped: true, reason: 'conversation_failed' };

  const resolvedSenderType = senderType || (direction === 'outbound' ? 'agent' : 'lead');

  const msgRow = {
    conversation_id: conversation.id,
    institution_id: conversation.institution_id || instId,
    sender_type: resolvedSenderType,
    sender_id: senderId || null,
    body: body != null ? String(body) : null,
    media_url: mediaUrl || null,
    message_type: String(messageType || 'text').slice(0, 40),
    message_id: extId,
    delivery_status: deliveryStatus || (direction === 'outbound' ? 'sent' : 'received'),
    payload: payload || null,
    created_at: occurredAt
  };

  const { data: saved, error: msgErr } = await supabaseAdmin
    .from('crm_messages')
    .insert(msgRow)
    .select('*')
    .maybeSingle();
  if (msgErr) {
    if (/duplicate|unique/i.test(msgErr.message || '')) {
      return { skipped: true, reason: 'duplicate', conversation_id: conversation.id };
    }
    throw msgErr;
  }

  return { ok: true, conversation_id: conversation.id, message: saved, conversation };
}

/** Bridge from Meta WA Cloud value.messages */
export async function syncWhatsAppValueToCrm(value, { institutionId } = {}) {
  const messages = Array.isArray(value?.messages) ? value.messages : [];
  if (!messages.length) return { processed: 0 };
  const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
  const nameByWa = new Map();
  for (const c of contacts) {
    const waId = String(c?.wa_id || '').trim();
    const name = c?.profile?.name ? String(c.profile.name).trim() : '';
    if (waId && name) nameByWa.set(waId, name);
  }
  let processed = 0;
  for (const m of messages) {
    const from = String(m?.from || '').trim();
    if (!from) continue;
    const type = String(m?.type || 'text').toLowerCase();
    let textBody = null;
    let mediaUrl = null;
    if (type === 'text') textBody = m?.text?.body != null ? String(m.text.body) : null;
    else if (type === 'button') textBody = m?.button?.text != null ? String(m.button.text) : '[button]';
    else if (type === 'interactive') {
      textBody =
        m?.interactive?.button_reply?.title ||
        m?.interactive?.list_reply?.title ||
        '[interactive]';
    } else if (['image', 'audio', 'video', 'document', 'sticker'].includes(type)) {
      const caption = m?.[type]?.caption;
      textBody = caption ? String(caption) : `[${type}]`;
      mediaUrl = m?.[type]?.id ? `meta-media:${m[type].id}` : null;
    } else {
      textBody = `[${type}]`;
    }
    await upsertCrmMessage({
      channel: 'whatsapp',
      contactIdentifier: from,
      contactName: nameByWa.get(from) || null,
      body: textBody,
      mediaUrl,
      messageType: type,
      messageId: m?.id ? String(m.id) : null,
      timestamp: m?.timestamp,
      direction: 'inbound',
      senderType: 'lead',
      institutionId,
      adSourceData: extractAdSourceData({ channel: 'whatsapp', message: m }),
      payload: m
    });
    processed += 1;
  }
  return { processed };
}

export async function syncInstagramMessagingToCrm(events, { institutionId } = {}) {
  const list = Array.isArray(events) ? events : [];
  let processed = 0;
  for (const ev of list) {
    if (ev?.message?.is_echo) continue;
    const senderId = ev?.sender?.id ? String(ev.sender.id) : null;
    if (!senderId) continue;
    const text = ev?.message?.text != null ? String(ev.message.text) : null;
    if (!text && !ev?.message?.attachments) continue;
    await upsertCrmMessage({
      channel: 'instagram',
      contactIdentifier: senderId,
      body: text || '[medya / ek]',
      messageType: text ? 'text' : 'attachment',
      messageId: ev?.message?.mid ? String(ev.message.mid) : null,
      timestamp: ev?.timestamp,
      direction: 'inbound',
      senderType: 'lead',
      institutionId,
      adSourceData: extractAdSourceData({ channel: 'instagram', messagingEvent: ev }),
      payload: ev
    });
    processed += 1;
  }
  return { processed };
}

export async function sendCrmWhatsAppText({ phone, text }) {
  // Panel / commerce_settings üzerinden token + phone_number_id (0850 hattı) yükle
  await loadMetaWhatsAppSecretsFromDb();
  if (!metaWhatsAppConfigured()) {
    const err = new Error(
      'whatsapp_not_configured — META_WHATSAPP_TOKEN + META_PHONE_NUMBER_ID (0850 hattı) veya panel commerce_settings.meta.whatsapp gerekli'
    );
    err.code = 'ENV';
    throw err;
  }
  const e164 = normalizePhoneToE164(phone) || (toMetaWaContactId(phone) ? `+${toMetaWaContactId(phone)}` : null);
  if (!e164) {
    const err = new Error('invalid_phone');
    err.code = 'PHONE';
    throw err;
  }
  const result = await sendMetaTextMessage({ toE164: e164, text });
  return {
    messageId: result?.messages?.[0]?.id || result?.messageId || result?.id || null,
    raw: result
  };
}

export async function sendCrmInstagramDm({ igScopedId, text }) {
  const token =
    process.env.INSTAGRAM_PAGE_ACCESS_TOKEN ||
    process.env.META_PAGE_ACCESS_TOKEN ||
    process.env.META_WHATSAPP_TOKEN ||
    '';
  const pageId =
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID ||
    process.env.META_IG_BUSINESS_ID ||
    process.env.META_PAGE_ID ||
    '';
  if (!token || !pageId) {
    const err = new Error('instagram_not_configured');
    err.code = 'ENV';
    throw err;
  }
  const graphVer = String(process.env.META_GRAPH_API_VERSION || 'v21.0').trim() || 'v21.0';
  const url = `https://graph.facebook.com/${graphVer}/${encodeURIComponent(pageId)}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      recipient: { id: String(igScopedId) },
      messaging_type: 'RESPONSE',
      message: { text: String(text || '').slice(0, 1000) }
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error?.message || `instagram_send_http_${res.status}`);
    err.code = 'META';
    err.raw = json;
    throw err;
  }
  return { messageId: json?.message_id || json?.id || null, raw: json };
}

export async function getCrmAgentAssignment(userId, institutionId) {
  if (!userId) return null;
  try {
    let q = supabaseAdmin
      .from('crm_user_assignments')
      .select('*')
      .eq('user_id', String(userId))
      .eq('is_active', true)
      .limit(1);
    if (institutionId) q = q.eq('institution_id', institutionId);
    const { data, error } = await q.maybeSingle();
    if (error && /crm_user_assignments|does not exist/i.test(error.message || '')) return null;
    if (error) throw error;
    return data || null;
  } catch {
    return null;
  }
}
