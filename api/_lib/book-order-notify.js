import { supabaseAdmin } from './supabase-admin.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { buildTemplateBodyParameters } from './whatsapp-outbound.js';
import { sendMetaTemplateMessage, parseMetaSendError } from './meta-whatsapp.js';
import { getIstanbulDateString } from './istanbul-time.js';
import { fetchMetaTemplatesFromPhoneWaba } from './meta-templates-sync.js';
import { extractBodyFromComponents, parseBodyVariablesFromText } from './meta-template-import.js';

const BOOK_ORDER_LANG_FALLBACK = ['tr', 'tr_TR'];

/** Supabase message_templates.type — Meta BM adı: kitap_siparisi */
export const BOOK_ORDER_TEMPLATE_TYPE = 'kitap_siparis_bildirim';
export const BOOK_ORDER_META_NAME = 'kitap_siparisi';
export const BOOK_ORDER_META_BINDINGS = [
  'veli_ad_soyad',
  'ogrenci_ad_soyad',
  'sinif',
  'telefon',
  'adres',
  'ilce',
  'il'
];

/** Meta kitap_siparisi şablonu — 7 adlandırılmış gövde parametresi */
export function buildBookOrderTemplateVars(order) {
  const ogrenci = String(order.ogrenci_ad_soyad || order.ogrenci_adi || '').trim();
  const veli = String(order.veli_ad_soyad || order.veli_adi || '').trim() || '—';
  const sinif = String(order.sinif || '').trim() || '—';
  const telefon = String(order.telefon || '').trim() || '—';
  const adres = String(order.adres || '').trim() || '—';
  const ilce = String(order.ilce || '').trim() || '—';
  const il = String(order.il || '').trim() || '—';
  return {
    veli_ad_soyad: veli,
    ogrenci_ad_soyad: ogrenci,
    sinif,
    telefon,
    adres,
    ilce,
    il
  };
}

function pickVarsForBindings(order, bindings) {
  const all = buildBookOrderTemplateVars(order);
  const keys = Array.isArray(bindings) ? bindings.map((x) => String(x || '').trim()).filter(Boolean) : [];
  const out = {};
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const canonical = BOOK_ORDER_META_BINDINGS[i] || key;
    out[key] = all[canonical] ?? all[key] ?? '—';
  }
  return out;
}

async function logBookOrderMessage(order, phone, sent, preview) {
  try {
    await supabaseAdmin.from('message_logs').insert({
      student_id: null,
      kind: 'book_order_notify',
      related_id: order.id,
      message: preview || `[${BOOK_ORDER_TEMPLATE_TYPE}] ${order.ogrenci_ad_soyad || order.ogrenci_adi}`,
      status: sent.ok ? 'sent' : 'failed',
      log_date: getIstanbulDateString(),
      error: sent.ok ? null : sent.error || null,
      phone,
      meta_message_id: sent.sid || sent.meta_message_id || null,
      meta_template_name: sent.meta_template_name || BOOK_ORDER_META_NAME
    });
  } catch (e) {
    console.warn('[book-order-notify] message_log', e?.message || e);
  }
}

export async function resolveBooksellerForOrder(order) {
  const instId = String(order.institution_id || '').trim();
  if (!instId) return { error: 'institution_required' };

  if (order.kitapci_id) {
    const { data: row } = await supabaseAdmin
      .from('kitapcilar')
      .select('*')
      .eq('id', order.kitapci_id)
      .eq('institution_id', instId)
      .maybeSingle();
    if (row?.phone && row.is_active !== false) return { bookseller: row };
    return { error: 'bookseller_not_found' };
  }

  const directPhone = normalizePhoneToE164(order.kitapci_phone);
  if (directPhone) {
    return {
      bookseller: {
        id: null,
        name: String(order.kitapci_adi || 'Kitapçı').trim(),
        phone: directPhone
      }
    };
  }

  const { data: rows } = await supabaseAdmin
    .from('kitapcilar')
    .select('*')
    .eq('institution_id', instId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1);
  if (rows?.[0]?.phone) return { bookseller: rows[0] };
  return { error: 'no_active_bookseller' };
}

function isTurkishMetaLang(lang) {
  const k = String(lang || '')
    .trim()
    .replace(/-/g, '_')
    .toLowerCase();
  return k === 'tr' || k === 'tr_tr' || k === 'turkish' || k.startsWith('tr_');
}

function isExactBookOrderMetaName(name) {
  return String(name || '').trim() === BOOK_ORDER_META_NAME;
}

function pickBookOrderMetaRow(matches) {
  const list = matches || [];
  const exact = list.filter((r) => isExactBookOrderMetaName(r.name));
  const pool = exact.length ? exact : list;
  const approvedTr = pool.filter(
    (r) => String(r.status || '').toUpperCase() === 'APPROVED' && isTurkishMetaLang(r.language)
  );
  if (approvedTr.length) return approvedTr[0];
  const approved = pool.filter((r) => String(r.status || '').toUpperCase() === 'APPROVED');
  if (approved.length) return approved[0];
  return pool[0] || null;
}

async function resolveBookOrderMetaFromApi() {
  const phone = await fetchMetaTemplatesFromPhoneWaba(BOOK_ORDER_META_NAME, { includeComponents: true });
  if (!phone.ok) {
    return {
      error: 'phone_waba_unresolved',
      hint:
        'META_PHONE_NUMBER_ID ve META_WHATSAPP_TOKEN ile gönderim numarasının WABA kimliği alınamadı. Vercel env kontrol edin.'
    };
  }

  const hit = pickBookOrderMetaRow(phone.matches || []);
  if (hit?.name && hit?.language) {
    return {
      meta_template_name: String(hit.name).trim(),
      meta_template_language: String(hit.language).trim(),
      whatsapp_template_status: String(hit.status || 'APPROVED'),
      meta_template_row: hit,
      waba_id: phone.waba_id,
      language_variants: collectBookOrderLanguages(phone.matches, hit.language)
    };
  }

  return {
    meta_template_name: BOOK_ORDER_META_NAME,
    meta_template_language: 'tr',
    whatsapp_template_status: 'APPROVED',
    meta_template_row: null,
    waba_id: phone.waba_id,
    language_variants: BOOK_ORDER_LANG_FALLBACK,
    fallback: true
  };
}

function collectBookOrderLanguages(matches, preferred) {
  const out = [];
  const seen = new Set();
  const add = (code) => {
    const raw = String(code || '').trim();
    if (!raw) return;
    const key = raw.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(raw);
  };
  add(preferred);
  for (const row of matches || []) add(row.language);
  for (const code of BOOK_ORDER_LANG_FALLBACK) add(code);
  return out;
}

function bindingsFromMetaBody(bodyText) {
  const parsed = parseBodyVariablesFromText(bodyText);
  if (!parsed.length) return { bindings: BOOK_ORDER_META_BINDINGS, named: true };
  const named = parsed.some((v) => !/^param_\d+$/.test(v));
  return { bindings: parsed, named };
}

async function loadBookOrderTemplateRow() {
  const metaResolved = await resolveBookOrderMetaFromApi();
  if (metaResolved.error) {
    return { error: metaResolved.hint || metaResolved.error };
  }

  const metaName = metaResolved.meta_template_name;
  const metaLang = metaResolved.meta_template_language;
  const bodyText = extractBodyFromComponents(metaResolved.meta_template_row?.components);
  const { bindings, named } = bindingsFromMetaBody(bodyText);

  const now = new Date().toISOString();
  const patch = {
    name: 'Kitap siparişi — kitapçı bildirimi',
    content: bodyText || `[Meta: ${metaName}]`,
    variables: bindings,
    twilio_variable_bindings: bindings,
    meta_template_name: metaName,
    meta_template_language: metaLang,
    meta_named_body_parameters: named,
    channel: 'whatsapp',
    is_active: true,
    whatsapp_template_status: metaResolved.whatsapp_template_status || 'APPROVED',
    updated_at: now
  };

  await supabaseAdmin.from('message_templates').upsert(
    { type: BOOK_ORDER_TEMPLATE_TYPE, ...patch },
    { onConflict: 'type' }
  );

  return {
    metaResolved,
    bindings,
    named,
    meta_template_name: metaName,
    meta_template_language: metaLang
  };
}

async function sendBookOrderWhatsApp(phoneE164, loaded, vars) {
  const { metaResolved, bindings, named } = loaded;
  const metaName = metaResolved.meta_template_name;
  const langs = metaResolved.language_variants || [metaResolved.meta_template_language];
  const bodyParameterTexts = buildTemplateBodyParameters(bindings, vars);
  const modes = named ? [false, true] : [false];

  let lastErr = null;
  for (const lang of langs) {
    const langCode = String(lang || '').trim();
    if (!langCode) continue;
    for (const useNamed of modes) {
      try {
        const r = await sendMetaTemplateMessage({
          toE164: phoneE164,
          templateName: metaName,
          languageCode: langCode,
          languageCandidates: [langCode],
          bodyParameterTexts,
          bodyParameterNames: useNamed ? bindings : null
        });
        return {
          ok: true,
          sid: r.messageId,
          meta_message_id: r.messageId,
          meta_template_name: metaName,
          bodyPreview: `[template:${metaName};lang:${r.languageUsed};named:${useNamed}]`
        };
      } catch (e) {
        lastErr = e;
      }
    }
  }

  const parsed = parseMetaSendError(lastErr);
  return {
    ok: false,
    error: parsed.message || String(lastErr?.message || 'send_failed'),
    meta_template_name: metaName,
    bodyPreview: null
  };
}

/** @returns {{ ok: boolean, skipped?: boolean, error?: string, meta_message_id?: string|null }} */
export async function notifyBooksellerForOrder(order) {
  const resolved = await resolveBooksellerForOrder(order);
  if (!resolved.bookseller) {
    await supabaseAdmin
      .from('kitap_siparisleri')
      .update({
        whatsapp_status: 'skipped',
        whatsapp_error: resolved.error || 'no_bookseller',
        updated_at: new Date().toISOString()
      })
      .eq('id', order.id);
    return { ok: false, skipped: true, error: resolved.error || 'no_bookseller' };
  }

  const phone = normalizePhoneToE164(resolved.bookseller.phone);
  if (!phone) {
    await supabaseAdmin
      .from('kitap_siparisleri')
      .update({
        whatsapp_status: 'failed',
        whatsapp_error: 'invalid_bookseller_phone',
        updated_at: new Date().toISOString()
      })
      .eq('id', order.id);
    return { ok: false, error: 'invalid_bookseller_phone' };
  }

  const loaded = await loadBookOrderTemplateRow();
  if (loaded.error) {
    await supabaseAdmin
      .from('kitap_siparisleri')
      .update({
        whatsapp_status: 'failed',
        whatsapp_error: String(loaded.error || 'template_not_found').slice(0, 500),
        updated_at: new Date().toISOString()
      })
      .eq('id', order.id);
    return { ok: false, error: loaded.error || 'template_not_found' };
  }

  const bindings = loaded.bindings || BOOK_ORDER_META_BINDINGS;
  const vars = pickVarsForBindings(order, bindings);
  const sent = await sendBookOrderWhatsApp(phone, loaded, vars);

  const now = new Date().toISOString();
  const patch = {
    kitapci_id: resolved.bookseller.id || order.kitapci_id || null,
    kitapci_adi: resolved.bookseller.name || order.kitapci_adi,
    kitapci_phone: phone,
    whatsapp_status: sent.ok ? 'sent' : 'failed',
    whatsapp_sent_at: sent.ok ? now : order.whatsapp_sent_at || null,
    whatsapp_error: sent.ok ? null : String(sent.error || 'send_failed').slice(0, 500),
    meta_message_id: sent.ok ? sent.sid || sent.meta_message_id || null : order.meta_message_id,
    status: sent.ok ? 'notified' : order.status || 'pending',
    updated_at: now
  };
  await supabaseAdmin.from('kitap_siparisleri').update(patch).eq('id', order.id);
  await logBookOrderMessage(order, phone, sent, sent.bodyPreview);

  return {
    ok: sent.ok,
    error: sent.ok ? null : sent.error,
    meta_message_id: sent.sid || sent.meta_message_id || null
  };
}

export async function processPendingBookOrderNotifications({ limit = 50 } = {}) {
  const { data: rows, error } = await supabaseAdmin
    .from('kitap_siparisleri')
    .select('*')
    .eq('status', 'approved')
    .eq('whatsapp_status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;

  const results = [];
  for (const row of rows || []) {
    const out = await notifyBooksellerForOrder(row);
    results.push({ order_id: row.id, ...out });
  }
  return { processed: results.length, results };
}
