/**
 * Meta WhatsApp / Instagram webhook
 * - WhatsApp: teslimat statuses + gelen mesajlar → Kayıt Takibi lead kartı
 * - Instagram Messaging: gelen DM → lead kartı
 *
 * Meta BM → Webhook URL:
 *   https://www.dersonlinevipkocluk.com/api/meta/webhook
 * Vercel env: META_WEBHOOK_VERIFY_TOKEN
 * Abonelik: messages (WhatsApp); Instagram messaging (DM)
 */
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { getIstanbulDateString } from '../api/_lib/istanbul-time.js';
import {
  ingestWhatsAppCloudMessages,
  ingestInstagramMessagingEvents
} from '../api/_lib/registration-channel-ingest.js';

function verifyToken() {
  return String(process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN || '').trim();
}

/** Meta gerçekten POST atıyor mu? (Supabase meta_webhook_hits — SQL migration gerekir) */
async function logWebhookHit(body) {
  try {
    const objectType = String(body?.object || '').toLowerCase() || null;
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    let messageCount = 0;
    let statusCount = 0;
    let field = null;
    let phoneNumberId = null;
    let displayPhone = null;
    let waFrom = null;
    let sample = null;

    for (const entry of entries) {
      for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
        field = field || (change?.field != null ? String(change.field) : null);
        const value = change?.value && typeof change.value === 'object' ? change.value : {};
        const msgs = Array.isArray(value.messages) ? value.messages : [];
        const statuses = Array.isArray(value.statuses) ? value.statuses : [];
        messageCount += msgs.length;
        statusCount += statuses.length;
        phoneNumberId =
          phoneNumberId || value?.metadata?.phone_number_id || value?.metadata?.phone_number_id || null;
        displayPhone =
          displayPhone ||
          value?.metadata?.display_phone_number ||
          value?.metadata?.display_phone_number ||
          null;
        if (!waFrom && msgs[0]?.from) waFrom = String(msgs[0].from);
        if (!sample && (msgs.length || statuses.length)) {
          sample = {
            field: change?.field,
            message_types: msgs.map((m) => m?.type).filter(Boolean).slice(0, 5),
            status_types: statuses.map((s) => s?.status).filter(Boolean).slice(0, 5),
            first_text: msgs[0]?.text?.body != null ? String(msgs[0].text.body).slice(0, 120) : null
          };
        }
      }
      // Instagram-style messaging[]
      const messaging = Array.isArray(entry?.messaging) ? entry.messaging : [];
      if (messaging.length) {
        messageCount += messaging.filter((m) => m?.message && !m?.message?.is_echo).length;
        if (!sample) sample = { field: 'messaging', count: messaging.length };
      }
    }

    const { error } = await supabaseAdmin.from('meta_webhook_hits').insert({
      object_type: objectType,
      field,
      message_count: messageCount,
      status_count: statusCount,
      phone_number_id: phoneNumberId != null ? String(phoneNumberId) : null,
      display_phone: displayPhone != null ? String(displayPhone) : null,
      wa_from: waFrom,
      sample
    });
    if (error && !/meta_webhook_hits|schema cache|does not exist/i.test(error.message || '')) {
      console.warn('[meta-webhook] hit log:', error.message);
    }
  } catch (e) {
    console.warn('[meta-webhook] hit log failed:', e instanceof Error ? e.message : e);
  }
}

/** hub.mode / hub.verify_token / hub.challenge — Vercel query noktalı anahtarları */
function hubQuery(req) {
  const q = req.query && typeof req.query === 'object' ? req.query : {};
  let mode = String(q['hub.mode'] ?? q.hub_mode ?? '').trim();
  let token = String(q['hub.verify_token'] ?? q.hub_verify_token ?? '').trim();
  let challenge = q['hub.challenge'] ?? q.hub_challenge ?? '';

  if ((!mode || !token) && typeof req.url === 'string') {
    try {
      const u = new URL(req.url, 'https://www.dersonlinevipkocluk.com');
      mode = mode || String(u.searchParams.get('hub.mode') || '').trim();
      token = token || String(u.searchParams.get('hub.verify_token') || '').trim();
      if (challenge === '' || challenge == null) {
        challenge = u.searchParams.get('hub.challenge') ?? '';
      }
    } catch {
      /* ignore */
    }
  }

  challenge = challenge == null ? '' : String(challenge);
  return { mode, token, challenge };
}

async function applyDeliveryStatus(wamid, status, errors) {
  const id = String(wamid || '').trim();
  const st = String(status || '').trim().toLowerCase();
  if (!id || !st) return;

  const errText =
    Array.isArray(errors) && errors.length
      ? errors.map((e) => String(e?.title || e?.message || e?.code || '')).filter(Boolean).join('; ')
      : null;

  const { data: orders } = await supabaseAdmin
    .from('kitap_siparisleri')
    .select('id, whatsapp_status')
    .eq('meta_message_id', id)
    .limit(5);

  for (const order of orders || []) {
    /** @type {Record<string, unknown>} */
    const patch = {
      meta_delivery_status: st,
      updated_at: new Date().toISOString()
    };
    if (st === 'delivered' || st === 'read') {
      patch.whatsapp_status = 'delivered';
      patch.whatsapp_error = null;
      patch.status = 'notified';
    } else if (st === 'failed') {
      patch.whatsapp_status = 'failed';
      patch.status = 'approved';
      patch.whatsapp_error = (errText || 'Meta teslimat hatası — şablon/parametre veya alıcı engeli').slice(0, 500);
    } else if (st === 'sent') {
      patch.whatsapp_status = 'accepted';
    }
    await supabaseAdmin.from('kitap_siparisleri').update(patch).eq('id', order.id);
  }

  if (st === 'failed' && errText) {
    try {
      await supabaseAdmin
        .from('message_logs')
        .update({ status: 'failed', error: errText.slice(0, 500) })
        .eq('meta_message_id', id);
    } catch {
      /* opsiyonel */
    }
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { mode, token, challenge } = hubQuery(req);
    const expected = verifyToken();

    if (!expected) {
      return res.status(503).json({
        error: 'verify_failed',
        reason: 'env_missing',
        hint: 'Vercel → Environment Variables → META_WEBHOOK_VERIFY_TOKEN tanımlayın (Meta BM Verify Token ile aynı olmalı).'
      });
    }
    if (mode !== 'subscribe') {
      return res.status(403).json({
        error: 'verify_failed',
        reason: 'invalid_hub_mode',
        hint: 'Meta yalnızca hub.mode=subscribe ile doğrular.'
      });
    }
    if (!challenge) {
      return res.status(403).json({
        error: 'verify_failed',
        reason: 'missing_challenge',
        hint: 'hub.challenge parametresi eksik.'
      });
    }
    if (token !== expected) {
      return res.status(403).json({
        error: 'verify_failed',
        reason: 'token_mismatch',
        hint: 'Meta BM Verify Token ile Vercel META_WEBHOOK_VERIFY_TOKEN birebir aynı olmalı (boşluk yok).'
      });
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(challenge);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch {
      body = {};
    }
  }
  if (!body || typeof body !== 'object') body = {};

  // Teşhis kaydı (tablo yoksa sessizce atlanır)
  void logWebhookHit(body);

  const objectType = String(body.object || '').toLowerCase();
  const entries = Array.isArray(body.entry) ? body.entry : [];
  let waIngested = 0;
  let igIngested = 0;
  let statusesApplied = 0;
  let inboundMessageCount = 0;
  let statusOnly = true;

  // Teşhis: Meta gerçekten messages mi yolluyor, yoksa sadece statuses mı?
  try {
    for (const entry of entries) {
      for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
        const value = change?.value && typeof change.value === 'object' ? change.value : {};
        const msgN = Array.isArray(value.messages) ? value.messages.length : 0;
        const stN = Array.isArray(value.statuses) ? value.statuses.length : 0;
        inboundMessageCount += msgN;
        if (msgN > 0) statusOnly = false;
        if (msgN || stN) {
          console.info('[meta-webhook] change', {
            object: objectType,
            field: change?.field,
            messages: msgN,
            statuses: stN,
            phone_number_id: value?.metadata?.phone_number_id || null,
            display_phone: value?.metadata?.display_phone_number || null
          });
        }
      }
    }
  } catch {
    /* ignore probe errors */
  }

  try {
    // Instagram Messaging (object: instagram)
    if (objectType === 'instagram') {
      for (const entry of entries) {
        const messaging = Array.isArray(entry?.messaging) ? entry.messaging : [];
        if (messaging.length) {
          const r = await ingestInstagramMessagingEvents(messaging);
          igIngested += Number(r?.processed || 0);
        }
        // bazı IG abonelikleri changes[] ile gelir
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        for (const change of changes) {
          const value = change?.value && typeof change.value === 'object' ? change.value : {};
          if (Array.isArray(value.messages)) {
            // nadir: WA benzeri IG payload — telefon yok, contact id kullan
            for (const m of value.messages) {
              const from = String(m?.from || m?.sender?.id || '').trim();
              if (!from) continue;
              const text = m?.text?.body != null ? String(m.text.body) : m?.message?.text != null ? String(m.message.text) : null;
              const r = await ingestInstagramMessagingEvents([
                {
                  sender: { id: from },
                  timestamp: m?.timestamp,
                  message: { mid: m?.id || m?.mid, text }
                }
              ]);
              igIngested += Number(r?.processed || 0);
            }
          }
        }
      }
      return res.status(200).json({
        ok: true,
        channel: 'instagram',
        ingested: igIngested,
        received: getIstanbulDateString()
      });
    }

    // WhatsApp Cloud API (+ page messaging fallback)
    for (const entry of entries) {
      const messaging = Array.isArray(entry?.messaging) ? entry.messaging : [];
      if (messaging.length && (objectType === 'page' || objectType === 'instagram')) {
        const r = await ingestInstagramMessagingEvents(messaging);
        igIngested += Number(r?.processed || 0);
      }

      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        if (String(change?.field || '') !== 'messages') continue;
        const value = change?.value && typeof change.value === 'object' ? change.value : {};

        const statuses = Array.isArray(value.statuses) ? value.statuses : [];
        for (const row of statuses) {
          await applyDeliveryStatus(row.id, row.status, row.errors);
          statusesApplied += 1;
        }

        if (Array.isArray(value.messages) && value.messages.length) {
          const r = await ingestWhatsAppCloudMessages(value);
          waIngested += Number(r?.processed || 0);
        }
      }
    }
  } catch (e) {
    console.error('[meta-webhook] ingest error:', e instanceof Error ? e.message : e);
    // Meta'ya her zaman 200 dön — aksi halde retry storm
  }

  if (statusOnly && statusesApplied > 0 && waIngested === 0) {
    console.info(
      '[meta-webhook] yalnızca teslimat statuses geldi (inbound message yok). Müşteri mesajı yoksa Meta Development Mode / messages aboneliği / yanlış WABA numarası kontrol edin.'
    );
  }

  return res.status(200).json({
    ok: true,
    received: getIstanbulDateString(),
    wa_ingested: waIngested,
    ig_ingested: igIngested,
    statuses: statusesApplied,
    inbound_messages_seen: inboundMessageCount
  });
}
