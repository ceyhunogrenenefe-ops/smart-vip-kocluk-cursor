import { supabaseAdmin } from './supabase-admin.js';
import { randomToken } from './parent-sign-defaults.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';

function normName(name) {
  return String(name || '')
    .trim()
    .toLocaleLowerCase('tr');
}

function orderBelongsToBookseller(order, bookseller) {
  const sellerId = String(bookseller.id || '').trim();
  if (sellerId && String(order.kitapci_id || '').trim() === sellerId) return true;

  const sent =
    String(order.whatsapp_status || '') === 'sent' ||
    ['notified', 'confirmed', 'shipped'].includes(String(order.status || ''));

  if (!sent) return false;

  const sellerPhone = normalizePhoneToE164(bookseller.phone);
  const orderPhone = normalizePhoneToE164(order.kitapci_phone);
  if (sellerPhone && orderPhone && sellerPhone === orderPhone) return true;

  const sellerName = normName(bookseller.name);
  const orderName = normName(order.kitapci_adi);
  if (sellerName && orderName && sellerName === orderName) return true;

  return false;
}

export function newKitapciPortalToken() {
  return randomToken(24);
}

export async function resolveBooksellerByPortalToken(token) {
  const t = String(token || '').trim();
  if (!t || t.length < 16) return null;
  const { data, error } = await supabaseAdmin
    .from('kitapcilar')
    .select('id, institution_id, name, phone, city, bolge, is_active, portal_token')
    .eq('portal_token', t)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.is_active === false) return null;
  return data;
}

export async function ensureBooksellerPortalToken(booksellerId) {
  const id = String(booksellerId || '').trim();
  if (!id) return null;
  const { data: row } = await supabaseAdmin.from('kitapcilar').select('id, portal_token').eq('id', id).maybeSingle();
  if (!row) return null;
  if (String(row.portal_token || '').trim()) return String(row.portal_token).trim();
  const token = newKitapciPortalToken();
  const { data: updated, error } = await supabaseAdmin
    .from('kitapcilar')
    .update({ portal_token: token, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('portal_token')
    .maybeSingle();
  if (error) throw error;
  return String(updated?.portal_token || token);
}

const PORTAL_ORDER_FIELDS =
  'id, ogrenci_ad_soyad, veli_ad_soyad, sinif, telefon, adres, ilce, il, ucret_durumu, siparis_notu, kitaplar, kitap_set_id, kitap_set_ids, status, whatsapp_status, whatsapp_sent_at, kitapci_id, kitapci_adi, kitapci_phone, kitapci_confirmed_at, shipped_at, kargo_takip_no, kitapci_notu, created_at, updated_at';

function normalizeIdArray(raw) {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x || '').trim()).filter(Boolean);
  }
  const one = String(raw || '').trim();
  return one ? [one] : [];
}

function orderSetIds(order) {
  const fromArray = normalizeIdArray(order?.kitap_set_ids);
  if (fromArray.length) return fromArray;
  const one = String(order?.kitap_set_id || '').trim();
  return one ? [one] : [];
}

function formatSetRowLabel(row) {
  if (!row?.name) return '';
  const detail = String(row.kitap_icerigi || '').trim();
  return detail ? `${row.name} — ${detail}` : String(row.name).trim();
}

async function loadSetLabelsById(setIds) {
  const ids = [...new Set(normalizeIdArray(setIds))];
  if (!ids.length) return new Map();
  const { data: rows, error } = await supabaseAdmin
    .from('kitap_siparis_setleri')
    .select('id,name,kitap_icerigi')
    .in('id', ids);
  if (error) throw error;
  const map = new Map();
  for (const row of rows || []) {
    const label = formatSetRowLabel(row);
    if (label) map.set(String(row.id), label);
  }
  return map;
}

function kitaplarFromSetIds(order, setLabelById) {
  const ids = orderSetIds(order);
  if (!ids.length) return null;
  const parts = ids.map((id) => setLabelById.get(String(id))).filter(Boolean);
  return parts.length ? parts.join(' | ') : null;
}

async function enrichPortalOrdersKitaplar(orders) {
  const allSetIds = [];
  for (const order of orders || []) {
    if (String(order?.kitaplar || '').trim()) continue;
    allSetIds.push(...orderSetIds(order));
  }
  const setLabelById = await loadSetLabelsById(allSetIds);
  for (const order of orders || []) {
    if (!String(order?.kitaplar || '').trim()) {
      const resolved = kitaplarFromSetIds(order, setLabelById);
      if (resolved) order.kitaplar = resolved;
    }
    const ids = orderSetIds(order);
    if (!Array.isArray(order.kitap_set_ids)) order.kitap_set_ids = ids;
    if (!String(order.kitap_set_id || '').trim() && ids.length) order.kitap_set_id = ids[0];
  }
  return orders;
}

/** Kitapçıya WhatsApp ile giden tüm siparişler (id, telefon veya isim eşleşmesi). */
export async function listOrdersForKitapciPortal(bookseller) {
  const instId = String(bookseller.institution_id || '').trim();
  if (!instId) return [];

  const { data, error } = await supabaseAdmin
    .from('kitap_siparisleri')
    .select(PORTAL_ORDER_FIELDS)
    .eq('institution_id', instId)
    .in('status', ['notified', 'confirmed', 'shipped', 'approved'])
    .order('created_at', { ascending: false })
    .limit(400);
  if (error) throw error;

  const matched = (data || []).filter((row) => orderBelongsToBookseller(row, bookseller));

  for (const row of matched) {
    if (!row.kitapci_id && bookseller.id) {
      await supabaseAdmin
        .from('kitap_siparisleri')
        .update({
          kitapci_id: bookseller.id,
          kitapci_adi: bookseller.name,
          kitapci_phone: normalizePhoneToE164(bookseller.phone) || row.kitapci_phone,
          updated_at: new Date().toISOString()
        })
        .eq('id', row.id);
      row.kitapci_id = bookseller.id;
    }
    if (String(row.status) === 'approved' && String(row.whatsapp_status) === 'sent') {
      row.status = 'notified';
    }
  }

  await enrichPortalOrdersKitaplar(matched);

  return matched;
}

async function loadOrderForBookseller(orderId, booksellerId) {
  const { data, error } = await supabaseAdmin
    .from('kitap_siparisleri')
    .select('*')
    .eq('id', orderId)
    .eq('kitapci_id', booksellerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** @returns {{ ok: boolean, error?: string, data?: object }} */
export async function confirmOrderFromKitapciPortal(booksellerId, orderId) {
  const order = await loadOrderForBookseller(orderId, booksellerId);
  if (!order) return { ok: false, error: 'order_not_found' };
  if (String(order.status) === 'shipped') {
    return { ok: false, error: 'already_shipped' };
  }
  if (String(order.status) === 'confirmed') {
    return { ok: true, data: order };
  }
  if (String(order.status) !== 'notified') {
    return { ok: false, error: 'order_not_ready', hint: 'Sipariş henüz size iletilmemiş.' };
  }
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('kitap_siparisleri')
    .update({
      status: 'confirmed',
      kitapci_confirmed_at: now,
      updated_at: now
    })
    .eq('id', order.id)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return { ok: true, data };
}

/** @returns {{ ok: boolean, error?: string, data?: object }} */
export async function shipOrderFromKitapciPortal(booksellerId, orderId, { kargoTakipNo, kitapciNotu } = {}) {
  const order = await loadOrderForBookseller(orderId, booksellerId);
  if (!order) return { ok: false, error: 'order_not_found' };
  if (String(order.status) === 'shipped') {
    return { ok: true, data: order };
  }
  if (!['notified', 'confirmed'].includes(String(order.status))) {
    return { ok: false, error: 'order_not_ready' };
  }
  const tracking = String(kargoTakipNo || '').trim();
  if (!tracking) {
    return { ok: false, error: 'kargo_takip_no_required', hint: 'Kargo takip numarası girin.' };
  }
  const now = new Date().toISOString();
  const patch = {
    status: 'shipped',
    shipped_at: now,
    kargo_takip_no: tracking.slice(0, 120),
    kitapci_notu: String(kitapciNotu || '').trim().slice(0, 500) || order.kitapci_notu || null,
    updated_at: now
  };
  if (!order.kitapci_confirmed_at) patch.kitapci_confirmed_at = now;
  const { data, error } = await supabaseAdmin
    .from('kitap_siparisleri')
    .update(patch)
    .eq('id', order.id)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return { ok: true, data };
}
