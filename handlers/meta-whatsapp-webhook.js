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

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const objectType = String(body.object || '').toLowerCase();
  const entries = Array.isArray(body.entry) ? body.entry : [];

  try {
    // Instagram Messaging (object: instagram)
    if (objectType === 'instagram') {
      for (const entry of entries) {
        const messaging = Array.isArray(entry?.messaging) ? entry.messaging : [];
        if (messaging.length) {
          await ingestInstagramMessagingEvents(messaging);
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
              await ingestInstagramMessagingEvents([
                {
                  sender: { id: from },
                  timestamp: m?.timestamp,
                  message: { mid: m?.id || m?.mid, text }
                }
              ]);
            }
          }
        }
      }
      return res.status(200).json({ ok: true, channel: 'instagram', received: getIstanbulDateString() });
    }

    // WhatsApp Cloud API (+ page messaging fallback)
    for (const entry of entries) {
      const messaging = Array.isArray(entry?.messaging) ? entry.messaging : [];
      if (messaging.length && (objectType === 'page' || objectType === 'instagram')) {
        await ingestInstagramMessagingEvents(messaging);
      }

      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        if (String(change?.field || '') !== 'messages') continue;
        const value = change?.value && typeof change.value === 'object' ? change.value : {};

        const statuses = Array.isArray(value.statuses) ? value.statuses : [];
        for (const row of statuses) {
          await applyDeliveryStatus(row.id, row.status, row.errors);
        }

        if (Array.isArray(value.messages) && value.messages.length) {
          await ingestWhatsAppCloudMessages(value);
        }
      }
    }
  } catch (e) {
    console.error('[meta-webhook] ingest error:', e instanceof Error ? e.message : e);
    // Meta'ya her zaman 200 dön — aksi halde retry storm
  }

  return res.status(200).json({ ok: true, received: getIstanbulDateString() });
}
