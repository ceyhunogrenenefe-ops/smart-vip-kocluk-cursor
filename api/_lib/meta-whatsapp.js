import { normalizePhoneDigitsForMeta } from './phone-whatsapp.js';
import { uploadParentPdfForMeta } from './meta-document-storage.js';

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

/** Meta webhook doğrulama token’ı — teslimat (delivered/failed) güncellemesi için zorunlu. */
export function getMetaWebhookEnvStatus() {
  const verifyToken = String(
    process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN || ''
  ).trim();
  return {
    configured: Boolean(verifyToken),
    webhook_url: 'https://www.dersonlinevipkocluk.com/api/meta/webhook',
    hint: verifyToken
      ? 'Meta BM → Webhook URL bu adres + aynı Verify Token; messages alanına abone olun.'
      : 'Vercel Production’da META_WEBHOOK_VERIFY_TOKEN eksik — Meta kabul (wamid) görünür ama teslim/failed panelde güncellenmez.'
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
  if (msg.includes('unexpected error') || msg.includes('retry your request')) {
    return 'Meta geçici hata — birkaç saniye sonra tekrar deneyin.';
  }
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
  if (c === 3 || msg.includes('granular permission')) {
    return 'Meta uygulama izni eksik (whatsapp_business_messaging). System User token + WABA/numara bağlantısını kontrol edin.';
  }
  if (c === 132018 || msg.includes('132018')) {
    return 'Meta #132018: şablon parametre sayısı veya adlandırma uyuşmuyor (pozisyonel {{1}} vs named parameter_name).';
  }
  if (c === 100 || msg.includes('invalid parameter') || msg.includes('(#100)')) {
    return 'Şablon dil kodu (tr vs tr_TR), gövde parametre sayısı veya Meta adlandırılmış değişken (parameter_name) uyumsuzluğu olabilir.';
  }
  if (msg.includes('meta_accepted_without_message_id') || msg.includes('meta_no_wamid')) {
    return 'Meta isteği kabul etti ama wamid dönmedi — gerçek gönderim olmayabilir.';
  }
  if (msg.includes('recipient_not_on_whatsapp') || c === 131026) {
    return 'Alıcı numarası WhatsApp\'ta kayıtlı değil veya geçersiz — kitapçı telefonunu kontrol edin.';
  }
  if (msg.includes('re-engagement') || msg.includes('24 hour') || msg.includes('24-hour') || sc === 131047) {
    return 'Veli son 24 saatte yazmadığı için Meta serbest belge gönderemez. Veliden kurumsal hatta kısa bir mesaj isteyin veya onaylı şablon kullanın.';
  }
  if (msg.includes('media url') || msg.includes('downloading the media') || msg.includes('media file')) {
    return 'Meta PDF dosyasını indiremedi — dosya bağlantısı veya format hatası.';
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
  languageCandidates = null,
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
  const candidateLangs = (Array.isArray(languageCandidates) && languageCandidates.length
    ? languageCandidates
    : [lang]
  )
    .map((c) => normalizeMetaLanguageCode(c))
    .filter(Boolean);
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

  function isTranslationError(json) {
    const graphCode = Number(json?.error?.code);
    const msg = String(json?.error?.message || '').toLowerCase();
    return (
      graphCode === 100 ||
      graphCode === 131026 ||
      graphCode === 132001 ||
      msg.includes('template') ||
      msg.includes('translation') ||
      msg.includes('language') ||
      msg.includes('does not exist')
    );
  }

  const seenLang = new Set();
  for (const baseLang of candidateLangs) {
    const rawLang = String(baseLang || '').trim();
    if (!rawLang || seenLang.has(rawLang.toLowerCase())) continue;
    seenLang.add(rawLang.toLowerCase());

    lang = normalizeMetaLanguageCode(rawLang);
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
        if (!mid) {
          const err = new Error('meta_accepted_without_message_id');
          err.status = res.status;
          err.meta = json;
          throw err;
        }
        const messageStatus = String(json?.messages?.[0]?.message_status || '').trim() || null;
        const contact = Array.isArray(json?.contacts) ? json.contacts[0] : null;
        const contactWaId = contact?.wa_id ? String(contact.wa_id) : null;
        const contactInput = contact?.input ? String(contact.input) : null;
        return {
          messageId: mid,
          messageStatus,
          contactWaId,
          contactInput,
          raw: json,
          languageUsed: lang
        };
      }
      const err = /** @type {Error & { status?: number; meta?: unknown }} */ (
        new Error(graphUserMessage(json, res.status))
      );
      err.status = res.status;
      err.meta = json;
      lastErr = err;

      const langLower = lang.toLowerCase();
      const retryTrToTrTr = attempt === 0 && langLower === 'tr' && isTranslationError(json);
      if (retryTrToTrTr) {
        lang = 'tr_TR';
        continue;
      }
      const retryTrTrToTr = attempt === 0 && langLower === 'tr_tr' && isTranslationError(json);
      if (retryTrTrToTr) {
        lang = 'tr';
        continue;
      }
      if (!isTranslationError(json)) throw err;
      break;
    }
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

/**
 * PDF / belge — önce Meta media upload, sonra document mesajı.
 * @param {object} opts
 * @param {string} opts.toE164
 * @param {string} opts.documentBase64
 * @param {string} [opts.filename]
 * @param {string} [opts.caption]
 * @param {string} [opts.mimeType]
 */
export async function sendMetaDocumentMessage({
  toE164,
  documentBase64,
  filename = 'document.pdf',
  caption = '',
  mimeType = 'application/pdf'
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

  const b64 = String(documentBase64 || '').trim();
  if (!b64) {
    const err = new Error('document_base64_required');
    err.code = 'DOCUMENT';
    throw err;
  }

  const buf = Buffer.from(b64, 'base64');
  if (!buf.length) {
    const err = new Error('invalid_document_base64');
    err.code = 'DOCUMENT';
    throw err;
  }
  if (buf.length > 16 * 1024 * 1024) {
    const err = new Error('document_too_large');
    err.code = 'DOCUMENT';
    throw err;
  }
  const pdfMagic = buf.subarray(0, 4).toString('ascii');
  if (pdfMagic !== '%PDF') {
    const err = new Error('invalid_pdf_content');
    err.code = 'DOCUMENT';
    throw err;
  }

  const safeName =
    String(filename || 'document.pdf')
      .trim()
      .replace(/[^\w.\-() ]+/g, '_')
      .slice(0, 120) || 'document.pdf';
  const mime = String(mimeType || 'application/pdf').trim() || 'application/pdf';
  const cap = String(caption || '').trim().slice(0, 1024);

  const hosted = await uploadParentPdfForMeta({
    buffer: buf,
    filename: safeName,
    mimeType: mime
  });

  /** @type {Record<string, unknown>} */
  const document = {
    link: hosted.signedUrl,
    filename: hosted.filename || safeName
  };
  if (cap) document.caption = cap;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'document',
    document
  };

  const sendUrl = `https://graph.facebook.com/${GRAPH()}/${pid}/messages`;
  const sendRes = await fetch(sendUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tok}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const sendJson = await sendRes.json().catch(() => ({}));
  if (!sendRes.ok) {
    const err = new Error(graphUserMessage(sendJson, sendRes.status));
    err.status = sendRes.status;
    err.meta = sendJson;
    throw err;
  }

  const mid = sendJson?.messages?.[0]?.id || null;
  if (!mid) {
    const err = new Error('meta_accepted_without_message_id');
    err.status = sendRes.status;
    err.meta = sendJson;
    throw err;
  }

  const contact = Array.isArray(sendJson?.contacts) ? sendJson.contacts[0] : null;
  const contactWaId = contact?.wa_id ? String(contact.wa_id) : null;
  if (!contactWaId) {
    const err = new Error('recipient_not_on_whatsapp');
    err.status = sendRes.status;
    err.meta = sendJson;
    throw err;
  }

  return {
    messageId: mid,
    contactWaId,
    storagePath: hosted.path,
    raw: sendJson
  };
}
