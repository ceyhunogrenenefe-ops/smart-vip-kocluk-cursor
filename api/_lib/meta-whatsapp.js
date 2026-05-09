import { normalizePhoneDigitsForMeta } from './phone-whatsapp.js';

export { normalizePhoneToE164 } from './phone-whatsapp.js';

const GRAPH = () => String(process.env.META_GRAPH_API_VERSION || 'v21.0').trim() || 'v21.0';

function token() {
  return process.env.META_WHATSAPP_TOKEN?.trim();
}

function phoneNumberId() {
  return process.env.META_PHONE_NUMBER_ID?.trim();
}

/** Sunucu gönderimi için zorunlu: token + Cloud API telefon numarası kimliği */
export function metaWhatsAppConfigured() {
  return Boolean(token() && phoneNumberId());
}

/**
 * İstemci / Ayarlar için özet — sırlar döndürülmez.
 */
export function getMetaWhatsAppEnvStatus() {
  const tok = token();
  const pid = phoneNumberId();
  const waba = process.env.META_WABA_ID?.trim();
  const configured = Boolean(tok && pid);
  return {
    configured,
    provider: 'meta_cloud_api',
    graph_api_version: GRAPH(),
    phone_number_id_suffix: pid && pid.length > 4 ? pid.slice(-6) : null,
    waba_id_suffix: waba && waba.length > 4 ? waba.slice(-6) : null,
    has_token: Boolean(tok),
    hint: configured
      ? 'Otomasyon için message_templates.meta_template_name ve Meta Business’ta onaylı şablonlar gerekir; koç otomasyonu için META_COACH_AUTOMATION_TEMPLATE_NAME kullanılır.'
      : 'Vercel’de META_WHATSAPP_TOKEN ve META_PHONE_NUMBER_ID tanımlayın; şablon senkronu için META_WABA_ID önerilir.'
  };
}

function graphUserMessage(json, httpStatus) {
  const err = json?.error;
  const msg = err?.message || json?.message;
  if (msg) return String(msg);
  return `meta_http_${httpStatus}`;
}

/**
 * Graph API hata gövdesinden kısa mesaj + kod (log / UI).
 */
export function parseMetaSendError(error) {
  const e = error && typeof error === 'object' ? error : {};
  const meta = e.meta && typeof e.meta === 'object' ? e.meta : null;
  const graphErr = meta?.error;
  const code =
    graphErr?.code ?? graphErr?.error_subcode ?? e.status ?? e.code ?? undefined;
  const message =
    graphErr?.message ||
    (e instanceof Error ? e.message : String(error || 'meta_send_failed'));
  const hint = metaGraphHint(graphErr);
  return {
    code: code != null ? String(code) : undefined,
    message: hint ? `${message} (${hint})` : message
  };
}

function metaGraphHint(graphErr) {
  const msg = String(graphErr?.message || '').toLowerCase();
  const sc = Number(graphErr?.error_subcode);
  const c = Number(graphErr?.code);
  if (msg.includes('24 hour') || msg.includes('24-hour') || sc === 2534037) {
    return 'Alıcı için oturum penceresi yok; onaylı şablon kullanın.';
  }
  if (msg.includes('template') && msg.includes('not')) {
    return 'Şablon adı/dili Meta’da yok veya henüz onaylanmadı.';
  }
  if (c === 190 || msg.includes('oauth')) {
    return 'META_WHATSAPP_TOKEN süresi dolmuş veya geçersiz olabilir.';
  }
  return '';
}

/**
 * Meta şablon gövdesi {{1}}… sırasıyla metin parametreleri.
 * @param {string[]} bodyParameterTexts
 */
export async function sendMetaTemplateMessage({
  toE164,
  templateName,
  languageCode = 'tr',
  bodyParameterTexts
}) {
  const pid = phoneNumberId();
  const tok = token();
  if (!pid || !tok) {
    const err = new Error('missing_meta_whatsapp_env');
    err.code = 'ENV';
    throw err;
  }

  const to = normalizePhoneDigitsForMeta(toE164);
  if (!to || to.length < 8) {
    const err = new Error('invalid_phone');
    err.code = 'PHONE';
    throw err;
  }

  const url = `https://graph.facebook.com/${GRAPH()}/${pid}/messages`;
  const name = String(templateName || '').trim();
  if (!name) {
    const err = new Error('template_name_required');
    err.code = 'TEMPLATE';
    throw err;
  }

  const lang = String(languageCode || 'tr').trim() || 'tr';
  const texts = Array.isArray(bodyParameterTexts) ? bodyParameterTexts : [];

  /** @type {Record<string, unknown>} */
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name,
      language: { code: lang }
    }
  };

  if (texts.length > 0) {
    payload.template.components = [
      {
        type: 'body',
        parameters: texts.map((t) => ({
          type: 'text',
          text: String(t ?? '').slice(0, 4096)
        }))
      }
    ];
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tok}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(graphUserMessage(json, res.status));
    err.status = res.status;
    err.meta = json;
    throw err;
  }

  const mid = json?.messages?.[0]?.id || null;
  return { messageId: mid, raw: json };
}

/**
 * Serbest metin (genelde yönetici testi veya 24 saat penceresi içi).
 */
export async function sendMetaTextMessage({ toE164, text }) {
  const pid = phoneNumberId();
  const tok = token();
  if (!pid || !tok) {
    const err = new Error('missing_meta_whatsapp_env');
    err.code = 'ENV';
    throw err;
  }
  const to = normalizePhoneDigitsForMeta(toE164);
  if (!to || to.length < 8) {
    const err = new Error('invalid_phone');
    err.code = 'PHONE';
    throw err;
  }
  const body = String(text || '').slice(0, 4096);
  const url = `https://graph.facebook.com/${GRAPH()}/${pid}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: {
      preview_url: false,
      body
    }
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tok}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(graphUserMessage(json, res.status));
    err.status = res.status;
    err.meta = json;
    throw err;
  }
  const mid = json?.messages?.[0]?.id || null;
  return { messageId: mid, raw: json };
}
