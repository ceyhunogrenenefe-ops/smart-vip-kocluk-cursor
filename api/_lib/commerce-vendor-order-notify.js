/**
 * Ödenen kitap siparişi → Yankı Kitapevi WhatsApp bildirimi.
 * Mevcut kitap_siparisi1 Meta şablonunu doldurur (24 saat penceresi gerekmez).
 */
import { supabaseAdmin } from './supabase-admin.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { sendBookOrderWhatsApp } from './book-order-meta-send.js';
import { YANKI_VENDOR_SLUG } from './commerce-lgs8-catalog.js';
import { buildVendorOrderNotifyPayload, vendorNotifyPhone } from './commerce-vendor-notify-payload.js';

export { buildVendorOrderNotifyPayload, vendorNotifyPhone };

async function loadVendorForOrder(orderId) {
  const { data: vos } = await supabaseAdmin
    .from('commerce_vendor_orders')
    .select('id, vendor_id, commerce_vendors(*)')
    .eq('order_id', orderId);
  const rows = vos || [];
  const yanki = rows.find((r) => r.commerce_vendors?.slug === YANKI_VENDOR_SLUG);
  return yanki?.commerce_vendors || rows[0]?.commerce_vendors || null;
}

/**
 * order.paid sonrası Yankı'ya (veya siparişteki satıcıya) WhatsApp atar.
 * Telefon yoksa sessizce atlar — ödeme akışını bozmaz.
 */
export async function notifyVendorWhatsAppForPaidOrder(orderId) {
  const id = String(orderId || '').trim();
  if (!id) return { ok: false, skipped: true, reason: 'missing_order_id' };

  const { data: order, error } = await supabaseAdmin
    .from('commerce_orders')
    .select(
      'id, order_number, customer_name, customer_phone, customer_email, notes, total_kurus, student_id, institution_id'
    )
    .eq('id', id)
    .maybeSingle();
  if (error || !order) return { ok: false, skipped: true, reason: 'order_not_found' };

  const [{ data: items }, { data: addresses }, vendor] = await Promise.all([
    supabaseAdmin
      .from('commerce_order_items')
      .select('title_snapshot, quantity, isbn_snapshot')
      .eq('order_id', id),
    supabaseAdmin
      .from('commerce_order_addresses')
      .select('*')
      .eq('order_id', id)
      .eq('address_type', 'shipping')
      .maybeSingle(),
    loadVendorForOrder(id),
  ]);

  let student = null;
  if (order.student_id) {
    const { data: st } = await supabaseAdmin
      .from('students')
      .select('id, name, class_level')
      .eq('id', order.student_id)
      .maybeSingle();
    student = st;
  }

  let phone = vendorNotifyPhone(vendor);
  if (!phone && vendor?.linked_kitapci_id) {
    const { data: kc } = await supabaseAdmin
      .from('kitapcilar')
      .select('phone, name')
      .eq('id', vendor.linked_kitapci_id)
      .maybeSingle();
    phone = normalizePhoneToE164(kc?.phone);
  }

  if (!phone) {
    console.warn('[commerce-vendor-notify] no WhatsApp phone for vendor', vendor?.slug || vendor?.id);
    return { ok: false, skipped: true, reason: 'no_vendor_phone', vendor_id: vendor?.id || null };
  }

  const payload = buildVendorOrderNotifyPayload({
    order,
    items: items || [],
    address: addresses,
    student,
    vendor,
  });

  try {
    const sent = await sendBookOrderWhatsApp(phone, payload);
    return {
      ok: Boolean(sent?.ok),
      skipped: false,
      phone,
      vendor_id: vendor?.id || null,
      vendor_name: vendor?.name || null,
      error: sent?.ok ? null : sent?.error || null,
      channel: sent?.channel || null,
    };
  } catch (e) {
    console.warn('[commerce-vendor-notify] send failed', e?.message || e);
    return { ok: false, skipped: false, error: e?.message || 'send_failed', phone, vendor_id: vendor?.id || null };
  }
}
