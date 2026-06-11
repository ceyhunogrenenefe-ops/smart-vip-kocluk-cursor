import { supabaseAdmin } from './supabase-admin.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { sendWhatsAppUsingTemplateRow } from './whatsapp-outbound.js';
import { getIstanbulDateString } from './istanbul-time.js';
import {
  fetchMetaTemplatesForName,
  findMetaTemplatesByNameLoose
} from './meta-templates-sync.js';
import {
  extractBodyFromComponents,
  fetchMetaTemplateWithComponents,
  parseBodyVariablesFromText
} from './meta-template-import.js';

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
      meta_template_name: sent.meta_template_name || BOOK_ORDER_TEMPLATE_TYPE
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

const BOOK_ORDER_META_LANG_TRY = ['tr', 'tr_TR', 'Turkish'];

function bookOrderMetaFallback() {
  return {
    meta_template_name: BOOK_ORDER_META_NAME,
    meta_template_language: 'tr',
    whatsapp_template_status: 'APPROVED',
    fallback: true
  };
}

async function resolveBookOrderMetaFromApi() {
  const list = await fetchMetaTemplatesForName(BOOK_ORDER_META_NAME);
  let matches = (list.matches || []).filter((r) => isExactBookOrderMetaName(r.name));
  if (!matches.length && list.templates?.length) {
    matches = (list.templates || []).filter((r) => isExactBookOrderMetaName(r.name));
  }
  if (!matches.length && list.templates?.length) {
    matches = findMetaTemplatesByNameLoose(list.templates, BOOK_ORDER_META_NAME).filter((r) =>
      isExactBookOrderMetaName(r.name)
    );
  }

  const hit = pickBookOrderMetaRow(matches);
  if (hit?.name && hit?.language) {
    return {
      meta_template_name: String(hit.name).trim(),
      meta_template_language: String(hit.language).trim(),
      whatsapp_template_status: String(hit.status || 'APPROVED')
    };
  }

  for (const lang of BOOK_ORDER_META_LANG_TRY) {
    const detail = await fetchMetaTemplateWithComponents(BOOK_ORDER_META_NAME, lang);
    if (detail.ok && detail.template?.name && detail.template?.language) {
      return {
        meta_template_name: String(detail.template.name).trim(),
        meta_template_language: String(detail.template.language).trim(),
        whatsapp_template_status: String(detail.template.status || 'APPROVED')
      };
    }
  }

  return bookOrderMetaFallback();
}

function bindingsFromMetaBody(bodyText) {
  const parsed = parseBodyVariablesFromText(bodyText);
  if (!parsed.length) return { bindings: BOOK_ORDER_META_BINDINGS, named: true };
  const named = parsed.some((v) => !/^param_\d+$/.test(v));
  return { bindings: parsed, named };
}

async function loadBookOrderTemplateRow() {
  const { data: templateRow, error } = await supabaseAdmin
    .from('message_templates')
    .select('*')
    .eq('type', BOOK_ORDER_TEMPLATE_TYPE)
    .maybeSingle();
  if (error || !templateRow?.content) {
    return { error: error?.message || 'template_not_found' };
  }

  const metaResolved = await resolveBookOrderMetaFromApi();
  const metaName = metaResolved.meta_template_name;
  const metaLang = metaResolved.meta_template_language;

  let detail = await fetchMetaTemplateWithComponents(metaName, metaLang);
  if (!detail.ok) {
    for (const lang of BOOK_ORDER_META_LANG_TRY) {
      if (lang === metaLang) continue;
      detail = await fetchMetaTemplateWithComponents(metaName, lang);
      if (detail.ok) break;
    }
  }
  const bodyText = detail.ok ? extractBodyFromComponents(detail.template?.components) : '';
  const { bindings, named } = bindingsFromMetaBody(bodyText);

  const now = new Date().toISOString();
  const patch = {
    variables: bindings,
    twilio_variable_bindings: bindings,
    meta_template_name: metaName,
    meta_template_language: metaLang,
    meta_named_body_parameters: named,
    whatsapp_template_status: metaResolved.whatsapp_template_status || 'APPROVED',
    updated_at: now
  };
  await supabaseAdmin.from('message_templates').update(patch).eq('type', BOOK_ORDER_TEMPLATE_TYPE);

  return {
    templateRow: {
      ...templateRow,
      ...patch,
      content: bodyText || templateRow.content
    },
    meta_template_name: metaName,
    meta_template_language: metaLang
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
  if (!loaded.templateRow) {
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

  const bindings =
    loaded.templateRow.twilio_variable_bindings ||
    loaded.templateRow.variables ||
    BOOK_ORDER_META_BINDINGS;
  const vars = pickVarsForBindings(order, bindings);
  const sent = await sendWhatsAppUsingTemplateRow({
    phone,
    templateRow: loaded.templateRow,
    vars,
    templateType: BOOK_ORDER_TEMPLATE_TYPE
  });

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
