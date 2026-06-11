import { supabaseAdmin } from './supabase-admin.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { sendAutomatedWhatsApp } from './whatsapp-outbound.js';
import { getIstanbulDateString } from './istanbul-time.js';

export const BOOK_ORDER_TEMPLATE_TYPE = 'kitap_siparis_bildirim';

export function shortOrderNo(orderId) {
  const s = String(orderId || '').replace(/-/g, '');
  return s.slice(0, 8).toUpperCase();
}

export function buildBookOrderTemplateVars(order, booksellerName) {
  const ogrenci = String(order.ogrenci_ad_soyad || order.ogrenci_adi || '').trim();
  const veli = String(order.veli_ad_soyad || order.veli_adi || '').trim() || '—';
  const sinif = String(order.sinif || '').trim() || '—';
  const ucret = String(order.ucret_durumu || '').trim() || '—';
  const telefon = String(order.telefon || '').trim();
  const adres = String(order.adres || '').trim() || '—';
  const ilce = String(order.ilce || '').trim() || '—';
  const il = String(order.il || '').trim() || '—';
  const not = String(order.siparis_notu || order.notlar || '').trim() || '—';
  return {
    kitapci_adi: String(booksellerName || order.kitapci_adi || 'Kitapçı').trim(),
    siparis_no: shortOrderNo(order.id),
    veli_ad_soyad: veli,
    ogrenci_ad_soyad: ogrenci,
    sinif,
    ucret_durumu: ucret,
    telefon,
    adres,
    ilce,
    il,
    siparis_notu: not
  };
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

  const vars = buildBookOrderTemplateVars(order, resolved.bookseller.name);
  const sent = await sendAutomatedWhatsApp({
    phone,
    templateType: BOOK_ORDER_TEMPLATE_TYPE,
    vars
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
