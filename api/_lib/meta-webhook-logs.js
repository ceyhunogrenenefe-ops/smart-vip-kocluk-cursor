/**
 * Meta webhook dayanıklı günlük — her payload işlenmeden önce kaydedilir.
 * Secret/token loglanmaz; yalnızca yapılandırılmış JSON.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { collectChangeMessagingEvents } from './instagram-messaging-normalize.js';

const DDL = `
CREATE TABLE IF NOT EXISTS public.meta_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NULL,
  object_type text NULL,
  event_type text NULL,
  page_id text NULL,
  instagram_account_id text NULL,
  sender_id text NULL,
  recipient_id text NULL,
  message_id text NULL,
  comment_id text NULL,
  payload_json jsonb NULL,
  processing_status text NOT NULL DEFAULT 'received',
  processing_error text NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL
);
CREATE INDEX IF NOT EXISTS idx_meta_webhook_logs_received
  ON public.meta_webhook_logs (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_webhook_logs_status
  ON public.meta_webhook_logs (processing_status, received_at DESC);
`;

let ensured = false;

export async function ensureMetaWebhookLogsTable() {
  if (ensured) return { ok: true, skipped: true };
  try {
    // Prefer RPC if present; otherwise rely on migration / soft-fail inserts
    const { error } = await supabaseAdmin.rpc('exec_sql', { sql: DDL }).maybeSingle?.() ?? { error: { message: 'no_rpc' } };
    if (error && !/no_rpc|function|schema cache|does not exist/i.test(error.message || '')) {
      console.warn('[meta-webhook-logs] ensure rpc:', error.message);
    }
  } catch {
    /* soft */
  }
  ensured = true;
  return { ok: true };
}

/** Payload’dan teşhis alanlarını çıkar (token yok). */
export function summarizeMetaWebhookPayload(body) {
  const objectType = String(body?.object || '').toLowerCase() || null;
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  // Gönderen taşıyan entry’yi seç — çok entry’li POST’larda ilki çoğu zaman
  // okundu/echo olup gerçek DM ikinci entry’de gelir.
  const entryEvents = (e) => [
    ...(Array.isArray(e?.messaging) ? e.messaging : []),
    ...(Array.isArray(e?.standby) ? e.standby : []),
    ...collectChangeMessagingEvents(e)
  ];
  const hasContent = (e) =>
    entryEvents(e).some((ev) => ev?.sender?.id && (ev.message || ev.referral || ev.postback)) ||
    (Array.isArray(e?.changes) ? e.changes : []).some((c) => c?.value?.from?.id);
  const entry =
    entries.find(hasContent) ||
    entries.find((e) => entryEvents(e).some((ev) => ev?.sender?.id)) ||
    entries[0] ||
    {};
  const pageOrIgId = entry?.id != null ? String(entry.id) : null;

  let eventType = null;
  let senderId = null;
  let recipientId = null;
  let messageId = null;
  let commentId = null;

  const messaging = [
    ...(Array.isArray(entry?.messaging) ? entry.messaging : []),
    ...(Array.isArray(entry?.standby) ? entry.standby : []),
    ...collectChangeMessagingEvents(entry)
  ];
  if (messaging.length) {
    const m = messaging[0] || {};
    eventType = m.referral || m.message?.referral ? 'messaging_referral' : m.postback ? 'messaging_postback' : 'messages';
    senderId = m.sender?.id != null ? String(m.sender.id) : null;
    recipientId = m.recipient?.id != null ? String(m.recipient.id) : null;
    messageId = m.message?.mid != null ? String(m.message.mid) : null;
  }

  for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
    const field = String(change?.field || '').toLowerCase();
    const value = change?.value && typeof change.value === 'object' ? change.value : {};
    if (!eventType) eventType = field || null;
    if (field === 'comments' || field === 'live_comments') {
      eventType = field;
      commentId = value.id != null ? String(value.id) : commentId;
      senderId = value.from?.id != null ? String(value.from.id) : senderId;
    }
    if (field === 'feed' && String(value.item || '') === 'comment') {
      eventType = 'feed_comment';
      commentId = value.comment_id != null ? String(value.comment_id) : commentId;
      senderId = value.from?.id != null ? String(value.from.id) : senderId;
    }
    if (Array.isArray(value.messages) && value.messages[0]) {
      eventType = eventType || 'messages';
      messageId = value.messages[0].id != null ? String(value.messages[0].id) : messageId;
      senderId = value.messages[0].from != null ? String(value.messages[0].from) : senderId;
    }
  }

  const platform =
    objectType === 'instagram'
      ? 'instagram'
      : objectType === 'page'
        ? 'facebook'
        : objectType === 'whatsapp_business_account'
          ? 'whatsapp'
          : objectType;

  return {
    platform,
    object_type: objectType,
    event_type: eventType,
    page_id: objectType === 'page' ? pageOrIgId : null,
    instagram_account_id: objectType === 'instagram' ? pageOrIgId : null,
    sender_id: senderId,
    recipient_id: recipientId,
    message_id: messageId,
    comment_id: commentId
  };
}

export async function insertMetaWebhookLog(body, { status = 'received' } = {}) {
  const summary = summarizeMetaWebhookPayload(body);
  try {
    const { data, error } = await supabaseAdmin
      .from('meta_webhook_logs')
      .insert({
        ...summary,
        payload_json: body && typeof body === 'object' ? body : { raw: body },
        processing_status: status,
        received_at: new Date().toISOString()
      })
      .select('id')
      .maybeSingle();
    if (error) {
      if (!/meta_webhook_logs|schema cache|does not exist/i.test(error.message || '')) {
        console.warn('[meta-webhook-logs] insert:', error.message);
      }
      // Fallback: legacy hits table (compact)
      try {
        await supabaseAdmin.from('meta_webhook_hits').insert({
          object_type: summary.object_type,
          field: summary.event_type,
          message_count: summary.message_id || summary.comment_id ? 1 : 0,
          status_count: 0,
          wa_from: summary.sender_id,
          sample: summary
        });
      } catch {
        /* ignore */
      }
      return { id: null, summary };
    }
    return { id: data?.id || null, summary };
  } catch (e) {
    console.warn('[meta-webhook-logs] insert failed:', e instanceof Error ? e.message : e);
    return { id: null, summary };
  }
}

export async function finalizeMetaWebhookLog(id, { status = 'processed', error = null } = {}) {
  if (!id) return;
  try {
    await supabaseAdmin
      .from('meta_webhook_logs')
      .update({
        processing_status: status,
        processing_error: error ? String(error).slice(0, 1000) : null,
        processed_at: new Date().toISOString()
      })
      .eq('id', id);
  } catch (e) {
    console.warn('[meta-webhook-logs] finalize:', e instanceof Error ? e.message : e);
  }
}

export async function listRecentMetaWebhookLogs(limit = 20) {
  const n = Math.min(50, Math.max(1, Number(limit) || 20));
  try {
    const { data, error } = await supabaseAdmin
      .from('meta_webhook_logs')
      .select(
        'id, platform, object_type, event_type, page_id, instagram_account_id, sender_id, recipient_id, message_id, comment_id, processing_status, processing_error, received_at, processed_at'
      )
      .order('received_at', { ascending: false })
      .limit(n);
    if (error) throw error;
    return data || [];
  } catch {
    try {
      const { data } = await supabaseAdmin
        .from('meta_webhook_hits')
        .select('id, received_at, object_type, field, message_count, sample')
        .order('received_at', { ascending: false })
        .limit(n);
      return (data || []).map((h) => ({
        id: h.id,
        platform: h.object_type,
        object_type: h.object_type,
        event_type: h.field,
        processing_status: 'legacy_hit',
        received_at: h.received_at,
        sample: h.sample
      }));
    } catch {
      return [];
    }
  }
}
