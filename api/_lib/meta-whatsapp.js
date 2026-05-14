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
 * Graph `template.language.code` — Meta BM’de Türkçe şablon bazen `tr`, bazen `tr_TR`.
 * Panelde yanlışlıkla "Turkish" yazılmış olabilir.
 */
export function normalizeMetaLanguageCode(raw) {
  let s = String(raw ?? '')
    .trim()
    .replace(/-/g, '_');
  if (!s) return 'tr';
  const lower = s.toLowerCase();
  if (lower === 'turkish') return 'tr';
  return s.slice(0, 32);
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
  if (c === 132001 || (msg.includes('translation') && msg.includes('template'))) {
    return 'Meta şablon adı + dil kodu eşleşmiyor: BM’deki ad (büyük/küçük harf) ve dil (tr vs tr_TR) message_templates ile aynı olmalı; Twilio kullanılmıyor.';
  }
  if (msg.includes('template') && msg.includes('not')) {
    return 'Şablon adı/dili Meta’da yok veya henüz onaylanmadı.';
  }
  if (c === 190 || msg.includes('oauth')) {
    return 'META_WHATSAPP_TOKEN süresi dolmuş veya geçersiz olabilir.';
  }
  if (c === 100 || msg.includes('invalid parameter') || msg.includes('(#100)')) {
    return 'Şablon dil kodu (tr vs tr_TR), gövde parametre sayısı veya Meta adlandırılmış değişken (parameter_name) uyumsuzluğu olabilir.';
  }
  return '';
}

/**
 * Meta şablon gövdesi metin parametreleri.
 * - `bodyParameterNames` verilmezse: sıra ile ({{1}}, {{2}}…) eşleşir.
 * - Yeni Meta “adlandırılmış” gövde değişkenleri için: her öğe `parameter_name` + `text` gönderilir.
 * @param {string[]} bodyParameterTexts
 * @param {string[] | null | undefined} bodyParameterNames Meta’daki değişken adları (sıra `bodyParameterTexts` ile aynı)
 */
export async function sendMetaTemplateMessage({
  toE164,
  templateName,
  languageCode = 'tr',
  bodyParameterTexts,
  bodyParameterNames = null
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

  let lang = normalizeMetaLanguageCode(languageCode);
  const texts = Array.isArray(bodyParameterTexts) ? bodyParameterTexts : [];
  const names = Array.isArray(bodyParameterNames) ? bodyParameterNames : null;
  const useNamed =
    names != null &&
    names.length === texts.length &&
    names.every((n) => String(n || '').trim().length > 0);

  function buildPayload(code) {
    /** @type {Record<string, unknown>} */
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name,
        language: { code }
      }
    };
    if (texts.length > 0) {
      payload.template.components = [
        {
          type: 'body',
          parameters: texts.map((t, i) => {
            const text = String(t ?? '').slice(0, 4096);
            if (!useNamed) {
              return { type: 'text', text };
            }
            const parameter_name = String(names[i] || '')
              .trim()
              .replace(/^\{\{|\}\}$/g, '')
              .slice(0, 256);
            return { type: 'text', parameter_name, text };
          })
        }
      ];
    }
    return payload;
  }

  /** @type {(Error & { status?: number; meta?: unknown }) | null} */
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tok}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildPayload(lang))
    });

    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      const mid = json?.messages?.[0]?.id || null;
      return { messageId: mid, raw: json };
    }
    const err = /** @type {Error & { status?: number; meta?: unknown }} */ (new Error(graphUserMessage(json, res.status)));
    err.status = res.status;
    err.meta = json;
    lastErr = err;

    const graphCode = Number(json?.error?.code);
    const msg = String(json?.error?.message || '').toLowerCase();
    const retryTrToTrTr =
      attempt === 0 &&
      lang.toLowerCase() === 'tr' &&
      (graphCode === 100 ||
        graphCode === 131026 ||
        graphCode === 132001 ||
        msg.includes('template') ||
        msg.includes('translation') ||
        msg.includes('language') ||
        msg.includes('does not exist'));
    if (!retryTrToTrTr) throw err;
    lang = 'tr_TR';
  }

  throw lastErr;
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
