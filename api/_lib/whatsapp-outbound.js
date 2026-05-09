import { renderMessageTemplate } from './template-engine.js';
import {
  normalizePhoneToE164,
  sendMetaTemplateMessage,
  parseMetaSendError
} from './meta-whatsapp.js';
import { supabaseAdmin } from './supabase-admin.js';

function normalizeBindingList(templateRow) {
  const raw = templateRow?.twilio_variable_bindings;
  if (Array.isArray(raw) && raw.length) {
    return raw.map((x) => String(x || '').trim()).filter(Boolean);
  }
  const vars = templateRow?.variables;
  if (Array.isArray(vars)) return vars.map((x) => String(x || '').trim()).filter(Boolean);
  return [];
}

/** Meta şablon gövdesi {{1}}… sırası — message_templates.twilio_variable_bindings veya variables */
export function getTemplateBindingKeys(templateRow) {
  return normalizeBindingList(templateRow);
}

/**
 * Üretim şablon gönderiminde tüm bağlayıcı anahtarları için değer zorunlu (boş string kabul edilmez).
 * @returns {{ ok: boolean, missing: string[], empty: string[] }}
 */
export function validateProductionTemplateVariables(bindings, vars) {
  const safe = vars && typeof vars === 'object' && !Array.isArray(vars) ? vars : {};
  const missing = [];
  const empty = [];
  for (const key of bindings || []) {
    const k = String(key || '').trim();
    if (!k) continue;
    if (!Object.prototype.hasOwnProperty.call(safe, k)) {
      missing.push(k);
      continue;
    }
    const val = safe[k];
    if (val === undefined || val === null) {
      missing.push(k);
    } else if (String(val).trim() === '') {
      empty.push(k);
    }
  }
  return {
    ok: missing.length === 0 && empty.length === 0,
    missing,
    empty
  };
}

/**
 * Bağlama anahtar sırasına göre Meta gövde parametre dizisi.
 * @param {string[]} bindingKeys
 * @param {Record<string, string>} vars
 * @returns {string[]}
 */
export function buildTemplateBodyParameters(bindingKeys, vars) {
  const safe = vars || {};
  return (bindingKeys || []).map((key) => {
    const k = String(key || '').trim();
    const v = k ? safe[k] ?? safe[k.replace(/\s/g, '_')] ?? '' : '';
    return String(v == null ? '' : v).slice(0, 4096);
  });
}

/** Geriye dönük: Twilio JSON yerine aynı sıradaki metinleri JSON dizi stringi olarak önizleme */
export function buildContentVariablePayload(bindingKeys, vars) {
  const arr = buildTemplateBodyParameters(bindingKeys, vars);
  return JSON.stringify(arr);
}

/**
 * Önizleme / doğrulama (gönderim yapmaz).
 * @param {Record<string, unknown>} templateRow message_templates satırı
 * @param {Record<string, string>} vars
 */
export function buildTemplatePreview(templateRow, vars) {
  const metaName = String(templateRow?.meta_template_name || '').trim();
  const lang = String(templateRow?.meta_template_language || 'tr').trim() || 'tr';
  const bindings = getTemplateBindingKeys(templateRow);
  const validation = validateProductionTemplateVariables(bindings, vars);
  const renderedBody = renderMessageTemplate(String(templateRow?.content || ''), vars);
  let bodyParametersPreview = null;
  if (metaName && bindings.length && validation.ok) {
    bodyParametersPreview = buildTemplateBodyParameters(bindings, vars);
  }
  return {
    provider: 'meta_cloud_api',
    use_template_send: Boolean(metaName && bindings.length),
    meta_template_name: metaName || null,
    meta_template_language: lang,
    bindings,
    validation,
    rendered_body_fallback: renderedBody,
    body_parameters_preview: bodyParametersPreview,
    content_variables_json:
      bodyParametersPreview != null ? JSON.stringify(bodyParametersPreview) : null,
    meta_approval_status: templateRow?.whatsapp_template_status || null,
    ready_for_production_send: Boolean(metaName && bindings.length > 0 && validation.ok),
    /** @deprecated önizleme alanları için */
    whatsapp_mode: 'production',
    twilio_content_sid: null
  };
}

/**
 * `message_templates` satırını kullanarak Meta şablon gönderir.
 */
export async function sendWhatsAppUsingTemplateRow({ phone, templateRow, vars, templateType }) {
  const e164 = normalizePhoneToE164(phone);
  if (!e164) {
    return {
      ok: false,
      channel: 'template',
      error: 'invalid_phone',
      meta_template_name: null,
      twilio_content_sid: null
    };
  }

  const metaName = String(templateRow?.meta_template_name || '').trim();
  const lang = String(templateRow?.meta_template_language || 'tr').trim() || 'tr';

  if (!metaName) {
    return {
      ok: false,
      channel: 'template',
      error: 'meta_template_name_required',
      errorCode: 'META_TEMPLATE',
      meta_template_name: null,
      twilio_content_sid: null
    };
  }

  const bindings = getTemplateBindingKeys(templateRow);
  if (!bindings.length) {
    return {
      ok: false,
      channel: 'template',
      error: 'template_variable_bindings_missing',
      errorCode: 'BINDINGS',
      meta_template_name: metaName,
      twilio_content_sid: null
    };
  }

  const valRes = validateProductionTemplateVariables(bindings, vars);
  if (!valRes.ok) {
    const detail = [...valRes.missing.map((k) => `eksik:${k}`), ...valRes.empty.map((k) => `bos:${k}`)].join(', ');
    return {
      ok: false,
      channel: 'template',
      error: `template_variables_invalid (${detail})`,
      errorCode: 'TEMPLATE_VARS',
      meta_template_name: metaName,
      validation: valRes,
      twilio_content_sid: null
    };
  }

  const bodyParameterTexts = buildTemplateBodyParameters(bindings, vars);

  try {
    const r = await sendMetaTemplateMessage({
      toE164: e164,
      templateName: metaName,
      languageCode: lang,
      bodyParameterTexts
    });
    const mid = r.messageId || null;
    return {
      ok: true,
      sid: mid,
      channel: 'template',
      bodyPreview: `[template:${metaName}]`,
      templateType: templateType || null,
      meta_template_name: metaName,
      meta_message_id: mid,
      twilio_content_sid: null,
      content_variables_json: JSON.stringify(bodyParameterTexts)
    };
  } catch (e) {
    const parsed = parseMetaSendError(e);
    return {
      ok: false,
      channel: 'template',
      error: parsed.message || String(e),
      errorCode: parsed.code,
      bodyPreview: null,
      meta_template_name: metaName,
      twilio_content_sid: null
    };
  }
}

/**
 * Supabase `message_templates.type` ile gönderim.
 */
export async function sendAutomatedWhatsApp({ phone, templateType, vars }) {
  const { data: templateRow, error: tErr } = await supabaseAdmin
    .from('message_templates')
    .select('*')
    .eq('type', templateType)
    .maybeSingle();
  if (tErr || !templateRow?.content) {
    return {
      ok: false,
      channel: 'template',
      error: tErr?.message || 'template_not_found',
      meta_template_name: null,
      twilio_content_sid: null
    };
  }
  return sendWhatsAppUsingTemplateRow({
    phone,
    templateRow,
    vars,
    templateType
  });
}
