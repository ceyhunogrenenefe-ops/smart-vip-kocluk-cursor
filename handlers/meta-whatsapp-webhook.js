/**
 * Meta WhatsApp / Instagram webhook
 * - WhatsApp: teslimat statuses + gelen mesajlar → Kayıt Takibi lead kartı
 * - Instagram Messaging: gelen DM → lead kartı
 * - Instagram Comments: gönderi / canlı yayın yorumları → CRM inbox (Kommo comment karşılığı)
 *
 * Meta BM → Webhook URL:
 *   https://www.dersonlinevipkocluk.com/api/meta/webhook
 * Vercel env: META_WEBHOOK_VERIFY_TOKEN
 * Abonelik: messages (WhatsApp); Instagram messaging + comments; Page messaging + feed
 */
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { getIstanbulDateString } from '../api/_lib/istanbul-time.js';
import {
  ingestWhatsAppCloudMessages,
  ingestInstagramMessagingEvents,
  ingestInstagramCommentChanges,
  ingestFacebookCommentChanges
} from '../api/_lib/registration-channel-ingest.js';
import {
  syncWhatsAppValueToCrm,
  syncInstagramMessagingToCrm,
  syncInstagramCommentsToCrm,
  syncFacebookCommentsToCrm
} from '../api/_lib/crm-inbox.js';
import {
  collectEntryMessagingEvents,
  normalizeInstagramMessagingEvent,
  resolveSocialChannelFromWebhook
} from '../api/_lib/instagram-messaging-normalize.js';
import { collectInstagramCommentChanges } from '../api/_lib/instagram-comments-normalize.js';
import {
  collectFacebookFeedCommentChanges
} from '../api/_lib/facebook-comments-normalize.js';
import {
  insertMetaWebhookLog,
  finalizeMetaWebhookLog
} from '../api/_lib/meta-webhook-logs.js';
import { classifyMetaWebhookIngress } from '../api/_lib/meta-webhook-ingress-diag.js';
import { takeMessengerThreadControl } from '../api/_lib/meta-social-inbound.js';

function verifyToken() {
  // Vercel’de tek kaynak: META_WEBHOOK_VERIFY_TOKEN (Meta BM Verify Token ile birebir)
  return String(
    process.env.META_WEBHOOK_VERIFY_TOKEN ||
      process.env.META_VERIFY_TOKEN ||
      process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
      ''
  ).trim();
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
      // Instagram-style messaging[] + standby + changes[field=messages] (reklam / handover)
      const messaging = collectEntryMessagingEvents(entry);
      if (messaging.length) {
        messageCount += messaging.filter((m) => {
          if (m?.message?.is_echo) return false;
          return Boolean(m?.message || m?.referral || m?.postback);
        }).length;
        if (!sample) {
          const first = messaging[0] || {};
          sample = {
            field: Array.isArray(entry?.standby) && entry.standby.length ? 'standby' : 'messaging',
            count: messaging.length,
            has_referral: Boolean(first.referral || first.message?.referral),
            has_text: Boolean(first.message?.text),
            sender_suffix: first.sender?.id ? String(first.sender.id).slice(-6) : null
          };
        }
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

  // CRM toplu mesaj / inbox teslimat durumu (ulaştı / okundu / hata)
  try {
    const { applyCrmDeliveryStatus } = await import('../api/_lib/crm-delivery-status.js');
    await applyCrmDeliveryStatus(id, st, errText);
  } catch (e) {
    console.warn('[meta-webhook] crm delivery status:', e instanceof Error ? e.message : e);
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

/**
 * Gelen mesajı doğru kuruma yaz: numara kimliği (WhatsApp) veya Instagram hesabı
 * crm_meta_connections'ta hangi kuruma bağlıysa o kurum. Eşleşme yoksa null döner
 * ve eski davranış (platform / varsayılan kurum) geçerli kalır.
 */
async function institutionForIncoming({ phoneNumberId, igUserId } = {}) {
  try {
    const { findInstitutionByMetaIds } = await import('../api/_lib/crm-meta-connection.js');
    return await findInstitutionByMetaIds({ phoneNumberId, igUserId });
  } catch (e) {
    console.warn('[meta-webhook] kurum eşleşmesi:', e instanceof Error ? e.message : e);
    return null;
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

  // Ingress teşhisi — parse/filter’dan ÖNCE (token/metin yok)
  const ingressDiag = classifyMetaWebhookIngress(body, req);
  console.info('[meta-webhook] ingress_diag', {
    received_at: ingressDiag.received_at,
    method: ingressDiag.method,
    object: ingressDiag.object,
    entry_id: ingressDiag.entry_id,
    channel_class: ingressDiag.channel_class,
    has_messaging: ingressDiag.has_messaging,
    has_standby: ingressDiag.has_standby,
    has_comment: ingressDiag.has_comment,
    has_handover: ingressDiag.has_handover,
    has_referral: ingressDiag.has_referral,
    has_text: ingressDiag.has_text,
    is_echo: ingressDiag.is_echo,
    is_synthetic_meta_test: ingressDiag.is_synthetic_meta_test,
    sender_id: ingressDiag.sender_id,
    recipient_id: ingressDiag.recipient_id,
    message_mid_suffix: ingressDiag.message_mid_suffix,
    change_fields: ingressDiag.change_fields,
    verdict: ingressDiag.verdict,
    drop_reason: ingressDiag.drop_reason,
    meta_headers: ingressDiag.meta_headers
  });

  // Teşhis kaydı (tablo yoksa sessizce atlanır)
  void logWebhookHit(body);
  const webhookLog = await insertMetaWebhookLog(body).catch(() => ({ id: null }));
  let webhookLogStatus = 'processed';
  let webhookLogError = null;
  console.info('[meta-webhook] POST received', {
    object: String(body?.object || '').toLowerCase() || null,
    entries: Array.isArray(body?.entry) ? body.entry.length : 0
  });

  if (ingressDiag?.drop_reason === 'DROP_SYNTHETIC_META_TEST') {
    webhookLogStatus = 'ignored';
    webhookLogError = 'DROP_SYNTHETIC_META_TEST';
    console.info('[meta-webhook] DROP_SYNTHETIC_META_TEST — Meta App Dashboard test payload (entry.id=0); CRM konuşması yazılmaz');
    await finalizeMetaWebhookLog(webhookLog?.id, {
      status: webhookLogStatus,
      error: webhookLogError
    }).catch(() => null);
    return res.status(200).json({
      ok: true,
      ignored: true,
      ignore_reason: 'DROP_SYNTHETIC_META_TEST',
      ingress: ingressDiag,
      webhook_log_id: webhookLog?.id || null,
      received: getIstanbulDateString()
    });
  }


  const objectType = String(body.object || '').toLowerCase();
  const entries = Array.isArray(body.entry) ? body.entry : [];
  let waIngested = 0;
  let igIngested = 0;
  let statusesApplied = 0;
  let inboundMessageCount = 0;
  let statusOnly = true;
  /** @type {{ processed?: number; skipped?: number; issues?: string[] } | null} */
  let crmWaSync = null;
  /** @type {{ processed?: number; channel?: string; facebook_comments?: number; comments?: number } | null} */
  let crmIgSync = null;
  /** @type {string[]} */
  const crmSyncErrors = [];

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
    // Bilinmeyen object → raw log + ignore_reason (sessiz drop yok)
    if (objectType && objectType !== 'instagram' && objectType !== 'page' && objectType !== 'whatsapp_business_account') {
      webhookLogStatus = 'ignored';
      webhookLogError = `DROP_UNSUPPORTED_OBJECT:${objectType}`;
      console.info('[meta-webhook] DROP_UNSUPPORTED_OBJECT', { object: objectType, entries: entries.length });
      await finalizeMetaWebhookLog(webhookLog?.id, {
        status: webhookLogStatus,
        error: webhookLogError
      }).catch(() => null);
      return res.status(200).json({
        ok: true,
        ignored: true,
        ignore_reason: `DROP_UNSUPPORTED_OBJECT:${objectType}`,
        received: getIstanbulDateString(),
        webhook_log_id: webhookLog?.id || null
      });
    }

    // Instagram Messaging (object: instagram)
    if (objectType === 'instagram') {
      for (const entry of entries) {
        const messaging = collectEntryMessagingEvents(entry);
        if (messaging.length) {
          inboundMessageCount += messaging.filter((m) => {
            const n = normalizeInstagramMessagingEvent(m);
            if (n.isEcho) {
              console.info('[meta-webhook] DROP_ECHO', { mid_suffix: n.messageId ? String(n.messageId).slice(-8) : null });
              return false;
            }
            if (!n.senderId) {
              console.info('[meta-webhook] DROP_UNKNOWN_SENDER', { has_text: Boolean(n.text) });
              return false;
            }
            if (!n.hasInboundContent) {
              console.info('[meta-webhook] DROP_NO_INBOUND_CONTENT', { sender_suffix: String(n.senderId).slice(-6) });
              return false;
            }
            return true;
          }).length;
          statusOnly = false;
          const r = await ingestInstagramMessagingEvents(messaging);
          igIngested += Number(r?.processed || 0);
          try {
            const igInstitutionId = await institutionForIncoming({
              igUserId: messaging?.[0]?.recipient?.id || null
            });
            crmIgSync = await syncInstagramMessagingToCrm(
              messaging,
              igInstitutionId ? { institutionId: igInstitutionId } : {}
            );
            console.info('[meta-webhook] crm ig synced', crmIgSync?.processed || 0);
          } catch (e) {
            console.warn('[meta-webhook] crm ig sync:', e instanceof Error ? e.message : e);
            crmIgSync = { processed: 0 };
          }
        }

        // Standby = başka partner (Kommo) birincil; mesajı yaz + thread kontrolünü al
        if (Array.isArray(entry?.standby) && entry.standby.length) {
          for (const ev of entry.standby) {
            const uid = ev?.sender?.id != null ? String(ev.sender.id) : '';
            if (!uid) continue;
            try {
              const take = await takeMessengerThreadControl(uid, { metadata: 'smartkocluk_standby_claim' });
              console.info('[meta-webhook] take_thread_control', { sender_suffix: uid.slice(-6), ok: take?.ok, error: take?.error || null });
            } catch (e) {
              console.warn('[meta-webhook] take_thread_control failed:', e instanceof Error ? e.message : e);
            }
          }
        }

        // Gönderi / canlı yayın yorumları (Kommo comment inbox)
        const commentChanges = collectInstagramCommentChanges(entry);
        if (commentChanges.length) {
          inboundMessageCount += commentChanges.length;
          statusOnly = false;
          try {
            const cr = await ingestInstagramCommentChanges(commentChanges);
            igIngested += Number(cr?.processed || 0);
          } catch (e) {
            console.warn('[meta-webhook] ig comment ingest:', e instanceof Error ? e.message : e);
          }
          try {
            const igc = await syncInstagramCommentsToCrm(commentChanges);
            crmIgSync = {
              processed: Number(crmIgSync?.processed || 0) + Number(igc?.processed || 0),
              comments: Number(igc?.processed || 0)
            };
            console.info('[meta-webhook] crm ig comments synced', igc?.processed || 0);
          } catch (e) {
            console.warn('[meta-webhook] crm ig comment sync:', e instanceof Error ? e.message : e);
          }
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
              const text =
                m?.text?.body != null
                  ? String(m.text.body)
                  : m?.message?.text != null
                    ? String(m.message.text)
                    : null;
              const evt = {
                sender: { id: from },
                timestamp: m?.timestamp,
                message: { mid: m?.id || m?.mid, text },
                referral: m?.referral || value?.referral || null
              };
              const r = await ingestInstagramMessagingEvents([evt]);
              igIngested += Number(r?.processed || 0);
              try {
                const ig = await syncInstagramMessagingToCrm([evt]);
                crmIgSync = {
                  processed: Number(crmIgSync?.processed || 0) + Number(ig?.processed || 0)
                };
              } catch (e) {
                console.warn('[meta-webhook] crm ig sync:', e instanceof Error ? e.message : e);
              }
            }
          }
        }
      }
      if (!webhookLogError && ingressDiag?.drop_reason) {
        webhookLogError = ingressDiag.drop_reason;
      }
      if (!webhookLogError && ingressDiag?.verdict && String(ingressDiag.verdict).startsWith('DROP_')) {
        webhookLogStatus = 'ignored';
        webhookLogError = ingressDiag.verdict;
      }
      await finalizeMetaWebhookLog(webhookLog?.id, { status: webhookLogStatus, error: webhookLogError }).catch(() => null);
      return res.status(200).json({
        ok: true,
        channel: 'instagram',
        ingested: igIngested,
        inbound_messages_seen: inboundMessageCount,
        crm_sync: crmIgSync,
        webhook_log_id: webhookLog?.id || null,
        ingress: {
          verdict: ingressDiag?.verdict || null,
          drop_reason: ingressDiag?.drop_reason || null,
          has_standby: ingressDiag?.has_standby || false,
          is_synthetic_meta_test: ingressDiag?.is_synthetic_meta_test || false,
          sender_id: ingressDiag?.sender_id || null
        },
        received: getIstanbulDateString()
      });
    }

    // WhatsApp Cloud API (+ page messaging fallback — IG reklam CTM sıkça object=page)
    for (const entry of entries) {
      const messaging = collectEntryMessagingEvents(entry);
      if (messaging.length && (objectType === 'page' || objectType === 'instagram')) {
        inboundMessageCount += messaging.filter((m) => {
          const n = normalizeInstagramMessagingEvent(m);
          if (n.isEcho) {
            console.info('[meta-webhook] DROP_ECHO', { mid_suffix: n.messageId ? String(n.messageId).slice(-8) : null, via: 'page' });
            return false;
          }
          if (!n.senderId) {
            console.info('[meta-webhook] DROP_UNKNOWN_SENDER', { has_text: Boolean(n.text), via: 'page' });
            return false;
          }
          if (!n.hasInboundContent) {
            console.info('[meta-webhook] DROP_NO_INBOUND_CONTENT', { sender_suffix: String(n.senderId).slice(-6), via: 'page' });
            return false;
          }
          return true;
        }).length;
        statusOnly = false;
        const igBusinessId = String(
          process.env.META_IG_BUSINESS_ID || process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || ''
        ).trim();
        const pageId = String(process.env.META_PAGE_ID || process.env.FACEBOOK_PAGE_ID || entry?.id || '').trim();
        // Per-event channel: IG business recipient → instagram; page recipient → facebook (CTM ads included)
        const byChannel = new Map();
        for (const evt of messaging) {
          const socialChannel = resolveSocialChannelFromWebhook({
            objectType,
            event: evt,
            igBusinessId,
            pageId
          });
          if (!byChannel.has(socialChannel)) byChannel.set(socialChannel, []);
          byChannel.get(socialChannel).push(evt);
        }
        for (const [socialChannel, batch] of byChannel) {
          const r = await ingestInstagramMessagingEvents(batch, { channel: socialChannel });
          igIngested += Number(r?.processed || 0);
          try {
            const batchInstitutionId = await institutionForIncoming({
              igUserId: batch?.[0]?.recipient?.id || null
            });
            const ig = await syncInstagramMessagingToCrm(batch, {
              channel: socialChannel,
              ...(batchInstitutionId ? { institutionId: batchInstitutionId } : {})
            });
            crmIgSync = {
              processed: Number(crmIgSync?.processed || 0) + Number(ig?.processed || 0),
              channel: socialChannel
            };
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.warn('[meta-webhook] crm social sync:', msg);
            crmSyncErrors.push(`social:${socialChannel}:${msg}`);
          }
        }
      }

      
      // Facebook Page feed yorumları
      const fbComments = collectFacebookFeedCommentChanges(entry);
      if (fbComments.length) {
        inboundMessageCount += fbComments.length;
        statusOnly = false;
        try {
          const fr = await ingestFacebookCommentChanges(fbComments);
          igIngested += Number(fr?.processed || 0);
        } catch (e) {
          console.warn('[meta-webhook] fb comment ingest:', e instanceof Error ? e.message : e);
          webhookLogError = e instanceof Error ? e.message : String(e);
        }
        try {
          const fc = await syncFacebookCommentsToCrm(fbComments);
          crmIgSync = {
            processed: Number(crmIgSync?.processed || 0) + Number(fc?.processed || 0),
            facebook_comments: Number(fc?.processed || 0)
          };
          console.info('[meta-webhook] crm fb comments synced', fc?.processed || 0);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn('[meta-webhook] crm fb comment sync:', msg);
          webhookLogError = msg;
          crmSyncErrors.push(`facebook_comment:${msg}`);
        }
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
          // Şirket hattı (META_PHONE_NUMBER_ID / 0850) gelenleri CRM inbox'a yaz
          try {
            const waInstitutionId = await institutionForIncoming({
              phoneNumberId: value?.metadata?.phone_number_id
            });
            crmWaSync = await syncWhatsAppValueToCrm(
              value,
              waInstitutionId ? { institutionId: waInstitutionId } : {}
            );
            if (crmWaSync?.processed) {
              console.info('[meta-webhook] crm wa synced', crmWaSync.processed);
            } else if (crmWaSync?.skipped || crmWaSync?.issues?.length) {
              console.warn('[meta-webhook] crm wa skipped', crmWaSync);
            }
          } catch (e) {
            console.error('[meta-webhook] crm wa sync FAILED:', e instanceof Error ? e.message : e);
            crmWaSync = { processed: 0, skipped: 1, issues: ['exception'] };
          }
        }
      }
    }
  } catch (e) {
    console.error('[meta-webhook] ingest error:', e instanceof Error ? e.message : e);
    webhookLogStatus = 'error';
    webhookLogError = e instanceof Error ? e.message : String(e);
    // Meta'ya her zaman 200 dön — aksi halde retry storm
  }
  await finalizeMetaWebhookLog(webhookLog?.id, { status: webhookLogStatus, error: webhookLogError }).catch(() => null);

  if (statusOnly && statusesApplied > 0 && waIngested === 0) {
    console.info(
      '[meta-webhook] yalnızca teslimat statuses geldi (inbound message yok). Müşteri mesajı yoksa Meta Development Mode / messages aboneliği / yanlış WABA numarası kontrol edin.'
    );
  }

  const response = {
    ok: true,
    received: getIstanbulDateString(),
    wa_ingested: waIngested,
    ig_ingested: igIngested,
    statuses: statusesApplied,
    inbound_messages_seen: inboundMessageCount,
    crm_sync: crmWaSync || crmIgSync,
    crm_sync_errors: crmSyncErrors.length ? crmSyncErrors : null
  };
  console.info('[meta-webhook] POST done', {
    wa_ingested: waIngested,
    ig_ingested: igIngested,
    statuses: statusesApplied,
    inbound_messages_seen: inboundMessageCount,
    crm_processed: response.crm_sync?.processed ?? null,
    crm_skipped: response.crm_sync?.skipped ?? null,
    crm_issues: response.crm_sync?.issues || null
  });
  return res.status(200).json(response);
}
