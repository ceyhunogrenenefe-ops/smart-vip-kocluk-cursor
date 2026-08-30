/**
 * Meta WABA’ya mesaj şablonu ekler ve onaya gönderir.
 * POST /{waba-id}/message_templates
 */
import { loadMetaWhatsAppSecretsFromDb } from './meta-whatsapp.js';
import {
  fetchMetaTemplatesFromPhoneWaba,
  isMetaTemplateSendableStatus,
  resolvePrimaryWabaId,
} from './meta-templates-sync.js';
import {
  buildMetaTemplateCreatePayload,
  extractNamedTemplateParams,
  normalizeMetaTemplateName,
} from './meta-template-payload.js';

export {
  buildMetaTemplateCreatePayload,
  extractNamedTemplateParams,
  normalizeMetaTemplateName,
};

const GRAPH = () => String(process.env.META_GRAPH_API_VERSION || 'v21.0').trim() || 'v21.0';

function graphErrorMessage(json) {
  const err = json?.error || {};
  const msg = String(err.message || json?.message || 'meta_template_create_failed').trim();
  const code = err.code != null ? ` (#${err.code})` : '';
  const sub = err.error_subcode != null ? `/${err.error_subcode}` : '';
  const user = String(err.error_user_msg || err.error_user_title || '').trim();
  return user ? `${msg}${code}${sub} — ${user}` : `${msg}${code}${sub}`;
}

function alreadyExists(json) {
  const err = json?.error || {};
  const msg = String(err.message || '').toLowerCase();
  const code = Number(err.code || 0);
  const sub = Number(err.error_subcode || 0);
  return (
    sub === 2388023 ||
    sub === 2388044 ||
    msg.includes('already exists') ||
    msg.includes('duplicate') ||
    (code === 100 && msg.includes('name') && msg.includes('exist'))
  );
}

/**
 * WABA’da yoksa oluşturur (onaya düşer); varsa mevcut durumu döner.
 */
export async function createOrReuseMetaMessageTemplate(payload) {
  await loadMetaWhatsAppSecretsFromDb();
  const tok = String(process.env.META_WHATSAPP_TOKEN || '').trim();
  if (!tok) {
    return { ok: false, error: 'META_WHATSAPP_TOKEN yok', errorCode: 'ENV' };
  }
  const primary = await resolvePrimaryWabaId(tok);
  const waba = primary.waba_id;
  if (!waba) {
    return {
      ok: false,
      error: 'WABA kimliği çözülemedi — META_WABA_ID / META_PHONE_NUMBER_ID kontrol edin',
      errorCode: 'WABA',
    };
  }

  const name = payload.name;
  const language = payload.language || 'tr';
  const existing = await fetchMetaTemplatesFromPhoneWaba(name, { includeComponents: true });
  const hit = (existing.matches || []).find(
    (r) => String(r.name || '').trim() === name && String(r.language || '').toLowerCase().startsWith('tr')
  ) || (existing.matches || [])[0];
  if (hit) {
    return {
      ok: true,
      created: false,
      reused: true,
      waba_id: waba,
      id: hit.id || null,
      name,
      language: hit.language || language,
      status: String(hit.status || 'UNKNOWN'),
      category: hit.category || payload.category || null,
      approved: isMetaTemplateSendableStatus(hit.status),
    };
  }

  const url = `https://graph.facebook.com/${GRAPH()}/${encodeURIComponent(waba)}/message_templates`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tok}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));

  if (res.ok && (json.id || json.status || json.name)) {
    return {
      ok: true,
      created: true,
      reused: false,
      waba_id: waba,
      id: json.id || null,
      name,
      language,
      status: String(json.status || 'PENDING'),
      category: json.category || payload.category || null,
      approved: isMetaTemplateSendableStatus(json.status),
    };
  }

  if (alreadyExists(json)) {
    const again = await fetchMetaTemplatesFromPhoneWaba(name);
    const row = (again.matches || [])[0];
    return {
      ok: true,
      created: false,
      reused: true,
      waba_id: waba,
      id: row?.id || null,
      name,
      language: row?.language || language,
      status: String(row?.status || 'PENDING'),
      category: row?.category || payload.category || null,
      approved: isMetaTemplateSendableStatus(row?.status),
      hint: 'Şablon WABA’da zaten var — durum senkronlandı.',
    };
  }

  return {
    ok: false,
    error: graphErrorMessage(json),
    errorCode: json?.error?.code || 'META',
    waba_id: waba,
    name,
    raw: json?.error || null,
  };
}
