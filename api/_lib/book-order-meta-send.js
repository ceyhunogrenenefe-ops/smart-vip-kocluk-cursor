/**
 * Kitap siparişi WhatsApp — Meta BM: kitap_siparisi1 · Turkish · 10 named param.
 * Gönderim: sendWhatsAppUsingTemplateRow (ders hatırlatma / taksit ile aynı yol + named→positional fallback).
 */
import { supabaseAdmin } from './supabase-admin.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { metaWhatsAppConfigured, parseMetaSendError } from './meta-whatsapp.js';
import { sendWhatsAppUsingTemplateRow } from './whatsapp-outbound.js';
import { renderMessageTemplate } from './template-engine.js';
import {
  sendGatewayTextMessage,
  getGatewaySendEnvStatus,
  bookOrderGatewaySessionId,
  resolveBookOrderGatewaySessionId,
  reportReminderGatewaySessionId,
  gatewayConfiguredForSession
} from './whatsapp-gateway-send.js';

export const BOOK_ORDER_TEMPLATE_TYPE = 'kitap_siparis_bildirim';

export const BOOK_ORDER_META_NAME =
  String(process.env.BOOK_ORDER_META_TEMPLATE_NAME || 'kitap_siparisi1').trim() || 'kitap_siparisi1';

export const BOOK_ORDER_META_LANGUAGE = 'tr';

/** Meta şablon gövdesindeki sıra */
export const BOOK_ORDER_META_BINDINGS = [
  'veli_ad_soyad',
  'ogrenci_ad_soyad',
  'sinif',
  'kitap_seti',
  'ucret_durumu',
  'telefon',
  'adres',
  'ilce',
  'il',
  'siparis_notu'
];

const BOOK_ORDER_TEMPLATE_CONTENT = `📚 YENİ KİTAP SİPARİŞİ
Veli Ad Soyad:
{{veli_ad_soyad}}
Öğrenci Ad Soyad:
{{ogrenci_ad_soyad}}
Sınıf:
{{sinif}}
📦 Gönderilecek Kitap Seti:
{{kitap_seti}}
Ücret Durumu:
{{ucret_durumu}}
Telefon:
{{telefon}}
Adres:
{{adres}}
İlçe:
{{ilce}}
İl:
{{il}}
Sipariş Notu:
{{siparis_notu}}
────────────────────────
Online VIP Dershane tarafından oluşturulan kitap siparişidir.
Kargo işlemi tamamlandıktan sonra aşağıdaki bilgilerin paylaşılması rica olunur:
🚚 Kargo Firması:
🚚 Takip Numarası:
Teşekkür ederiz.
Online VIP Dershane`;

function sanitizeParam(v) {
  const s = String(v ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 1024);
  return s || '-';
}

function isParamMismatch(errOrMsg) {
  const parsed =
    errOrMsg && typeof errOrMsg === 'object' && 'message' in errOrMsg
      ? parseMetaSendError(errOrMsg)
      : { message: String(errOrMsg || ''), code: null };
  const code = Number(parsed.code || 0);
  const msg = String(parsed.message || '').toLowerCase();
  return code === 132018 || code === 100 || msg.includes('132018') || msg.includes('parameter');
}

export function buildBookOrderTemplateRow() {
  return {
    type: BOOK_ORDER_TEMPLATE_TYPE,
    name: 'kitap_siparisi1 (Meta)',
    content: BOOK_ORDER_TEMPLATE_CONTENT,
    variables: BOOK_ORDER_META_BINDINGS,
    twilio_variable_bindings: BOOK_ORDER_META_BINDINGS,
    meta_template_name: BOOK_ORDER_META_NAME,
    meta_template_language: BOOK_ORDER_META_LANGUAGE,
    meta_named_body_parameters: true,
    channel: 'whatsapp',
    is_active: true,
    whatsapp_template_status: 'APPROVED'
  };
}

export function buildBookOrderTemplateVars(order) {
  const kitap_seti = sanitizeParam(order.kitap_seti || order.kitaplar);
  return {
    veli_ad_soyad: sanitizeParam(order.veli_ad_soyad || order.veli_adi),
    ogrenci_ad_soyad: sanitizeParam(order.ogrenci_ad_soyad || order.ogrenci_adi),
    sinif: sanitizeParam(order.sinif),
    kitap_seti,
    ucret_durumu: sanitizeParam(order.ucret_durumu),
    telefon: sanitizeParam(order.telefon),
    adres: sanitizeParam(order.adres),
    ilce: sanitizeParam(order.ilce),
    il: sanitizeParam(order.il),
    siparis_notu: sanitizeParam(order.siparis_notu || order.notlar)
  };
}

/** Gateway: Meta şablonu yerine düz metin gövdesi */
export function renderBookOrderWhatsAppBody(order) {
  return renderMessageTemplate(BOOK_ORDER_TEMPLATE_CONTENT, buildBookOrderTemplateVars(order)).trim();
}

function bookOrderSendChannelPreference() {
  const raw = String(process.env.BOOK_ORDER_WHATSAPP_CHANNEL || 'gateway').trim().toLowerCase();
  if (!raw || raw === 'auto' || raw === 'baileys' || raw === 'wa_gateway') return 'gateway';
  if (raw === 'meta' || raw === 'cloud' || raw === 'meta_cloud_api') return 'meta';
  return raw;
}

/** Gateway yoksa veya düşerse Meta yedek (varsayılan açık). BOOK_ORDER_WHATSAPP_FALLBACK_META=0 ile kapatılır. */
export function bookOrderMetaFallbackEnabled() {
  const pref = bookOrderSendChannelPreference();
  if (pref === 'meta') return false;
  return String(process.env.BOOK_ORDER_WHATSAPP_FALLBACK_META ?? '1').trim() !== '0';
}

export function bookOrderGatewaySessionCandidates(gatewaySessionId) {
  return [
    ...new Set(
      [
        String(gatewaySessionId || '').trim(),
        bookOrderGatewaySessionId(),
        reportReminderGatewaySessionId()
      ]
        .map((x) => String(x || '').trim())
        .filter(Boolean)
    )
  ];
}

export function bookOrderGatewayReady(gatewaySessionId) {
  return bookOrderGatewaySessionCandidates(gatewaySessionId).some((id) => gatewayConfiguredForSession(id));
}

/** Önce gateway (bağlı oturum), olmazsa Meta — otomasyon kanalı ile aynı mantık. */
export function bookOrderSendPlan(opts = {}) {
  const pref = bookOrderSendChannelPreference();
  const gwReady = bookOrderGatewayReady(opts.gatewaySessionId);
  const metaReady = metaWhatsAppConfigured();
  const metaFallback = bookOrderMetaFallbackEnabled();
  const tryGateway = pref !== 'meta' && gwReady;
  const tryMeta = metaReady && (pref === 'meta' || metaFallback || !gwReady);
  return { pref, gwReady, metaReady, metaFallback, tryGateway, tryMeta };
}

/** Gateway: düz metin — env oturumu, giriş yapan kullanıcı veya bağlı paylaşımlı oturum */
export async function sendBookOrderViaGateway(phone, order, gatewaySessionId) {
  const message = renderBookOrderWhatsAppBody(order);
  const primarySid = resolveBookOrderGatewaySessionId(gatewaySessionId);
  const sessionCandidates = [
    ...new Set(
      [
        primarySid,
        bookOrderGatewaySessionId(),
        reportReminderGatewaySessionId(),
        String(gatewaySessionId || '').trim()
      ]
        .map((x) => String(x || '').trim())
        .filter(Boolean)
    )
  ];
  return sendGatewayTextMessage({
    phone,
    message,
    sessionId: primarySid,
    sessionCandidates,
    allowSharedFallback: true
  });
}

export async function upsertBookOrderTemplateDefaults() {
  const now = new Date().toISOString();
  const row = { ...buildBookOrderTemplateRow(), updated_at: now };
  const { data, error } = await supabaseAdmin
    .from('message_templates')
    .upsert(row, { onConflict: 'type' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function activateBookOrderMetaTemplate(opts = {}) {
  const template = await upsertBookOrderTemplateDefaults();
  const plan = bookOrderSendPlan(opts);
  const gateway = getGatewaySendEnvStatus();
  const sendVia = plan.tryGateway ? 'gateway' : plan.tryMeta ? 'meta_cloud_api' : 'none';
  return {
    ok: true,
    template,
    sync_warning: null,
    meta_configured: plan.metaReady,
    channel: sendVia,
    send_via: sendVia,
    send_plan: plan,
    gateway,
    gateway_session_id: bookOrderGatewaySessionId() || null,
    meta_template_name: BOOK_ORDER_META_NAME,
    meta_template_language: BOOK_ORDER_META_LANGUAGE,
    meta_named_body_parameters: true,
    bindings: BOOK_ORDER_META_BINDINGS
  };
}

function mapSendResult(sent) {
  if (!sent.ok) {
    return {
      ok: false,
      error: sent.error,
      errorCode: sent.errorCode || 'META_SEND_FAILED',
      meta_template_name: sent.meta_template_name || BOOK_ORDER_META_NAME,
      validation: sent.validation || null
    };
  }

  const mid = sent.sid || sent.meta_message_id || null;
  const messageStatus = String(sent.meta_message_status || 'accepted').trim().toLowerCase();

  return {
    ok: true,
    sid: mid,
    meta_message_id: mid,
    meta_template_name: sent.meta_template_name || BOOK_ORDER_META_NAME,
    meta_language_used: sent.meta_language_used || BOOK_ORDER_META_LANGUAGE,
    meta_message_status: messageStatus,
    meta_contact_wa_id: sent.meta_contact_wa_id || null,
    meta_send_mode: sent.bodyPreview || null,
    channel: sent.channel || 'meta',
    bodyPreview: sent.bodyPreview || `[template:${BOOK_ORDER_META_NAME}]`,
    content_variables_json: sent.content_variables_json || null
  };
}

/** Önce gateway (QR), bağlı değilse veya gönderim düşerse Meta şablonu — atlama yok. */
export async function sendBookOrderWhatsApp(phone, order, opts = {}) {
  const { tryGateway, tryMeta } = bookOrderSendPlan(opts);
  let lastGw = null;

  if (tryGateway) {
    const gw = await sendBookOrderViaGateway(phone, order, opts.gatewaySessionId);
    if (gw.ok) return gw;
    lastGw = gw;
    if (!tryMeta) return gw;
  }

  if (tryMeta) {
    const meta = await sendBookOrderMetaWhatsApp(phone, order);
    if (!meta.ok && lastGw) {
      meta.error = `${lastGw.error || 'gateway_failed'} · Meta: ${meta.error || 'failed'}`;
      meta.gateway_attempt = lastGw.errorCode || null;
    } else if (meta.ok && lastGw) {
      meta.fallback_from = 'gateway';
      meta.channel = 'meta';
    }
    return meta;
  }

  if (lastGw) return lastGw;

  return {
    ok: false,
    error:
      bookOrderSendPlan(opts).metaReady || metaWhatsAppConfigured()
        ? 'Gönderim kanalı seçilemedi.'
        : 'WhatsApp yapılandırılmamış: gateway QR bağlayın veya META_WHATSAPP_TOKEN + META_PHONE_NUMBER_ID tanımlayın.',
    errorCode: 'NO_CHANNEL'
  };
}

/** Ders hatırlatma / taksit ile aynı Meta gönderim yolu. */
export async function sendBookOrderMetaWhatsApp(phone, order) {
  if (!metaWhatsAppConfigured()) {
    return {
      ok: false,
      error: 'Meta WhatsApp yapılandırılmamış: META_WHATSAPP_TOKEN ve META_PHONE_NUMBER_ID gerekli.',
      errorCode: 'ENV'
    };
  }

  const e164 = normalizePhoneToE164(phone);
  if (!e164) {
    return { ok: false, error: 'Geçersiz telefon numarası.', errorCode: 'PHONE' };
  }

  await upsertBookOrderTemplateDefaults().catch(() => {});

  const vars = buildBookOrderTemplateVars(order);
  const namedRow = buildBookOrderTemplateRow();

  let sent = await sendWhatsAppUsingTemplateRow({
    phone: e164,
    templateRow: namedRow,
    vars,
    templateType: BOOK_ORDER_TEMPLATE_TYPE
  });

  if (!sent.ok && isParamMismatch(sent.error)) {
    sent = await sendWhatsAppUsingTemplateRow({
      phone: e164,
      templateRow: { ...namedRow, meta_named_body_parameters: false },
      vars,
      templateType: BOOK_ORDER_TEMPLATE_TYPE
    });
  }

  const out = mapSendResult(sent);
  if (!out.ok) return out;

  if (out.meta_message_status === 'held_for_quality_assessment') {
    out.delivery_warning =
      'Meta mesajı kalite incelemesine aldı — gecikebilir veya düşmeyebilir. Şablon kategorisini UTILITY yapın.';
  }

  if (!out.meta_contact_wa_id) {
    out.delivery_warning =
      (out.delivery_warning ? `${out.delivery_warning} ` : '') +
      'Meta alıcı wa_id döndürmedi — numara WhatsApp kayıtlı mı kontrol edin.';
  }

  return out;
}
