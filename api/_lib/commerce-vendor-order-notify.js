/**
 * Ödenen kitap siparişi → satıcı WhatsApp bildirimi.
 * kitap_siparisi1 Meta şablonunu her gönderimde aktif eder (24 saat penceresi gerekmez).
 */
import { supabaseAdmin } from './supabase-admin.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { activateBookOrderMetaTemplate, sendBookOrderWhatsApp } from './book-order-meta-send.js';
import {
  buildVendorOrderNotifyPayload,
  vendorNotifyPhone,
} from './commerce-vendor-notify-payload.js';

export { buildVendorOrderNotifyPayload, vendorNotifyPhone };

async function loadVendorsForOrder(orderId) {
  const { data: vos } = await supabaseAdmin
    .from('commerce_vendor_orders')
    .select('id, vendor_id, commerce_vendors(*)')
    .eq('order_id', orderId);
  const seen = new Set();
  const vendors = [];
  for (const r of vos || []) {
    const v = r.commerce_vendors;
    if (!v?.id || seen.has(v.id)) continue;
    seen.add(v.id);
    vendors.push(v);
  }
  return vendors;
}

async function resolveVendorPhone(vendor) {
  let phone = vendorNotifyPhone(vendor);
  if (!phone && vendor?.linked_kitapci_id) {
    const { data: kc } = await supabaseAdmin
      .from('kitapcilar')
      .select('phone, name')
      .eq('id', vendor.linked_kitapci_id)
      .maybeSingle();
    phone = normalizePhoneToE164(kc?.phone);
  }
  return phone;
}

/**
 * order.paid sonrası her satıcıya WhatsApp atar.
 * Telefon yoksa o satıcıyı atlar — ödeme akışını bozmaz.
 */
export async function notifyVendorWhatsAppForPaidOrder(orderId, opts = {}) {
  const id = String(orderId || '').trim();
  if (!id) return { ok: false, skipped: true, reason: 'missing_order_id' };

  const { data: order, error } = await supabaseAdmin
    .from('commerce_orders')
    .select(
      'id, order_number, customer_name, customer_phone, customer_email, notes, total_kurus, student_id, institution_id, payment_status'
    )
    .eq('id', id)
    .maybeSingle();
  if (error || !order) return { ok: false, skipped: true, reason: 'order_not_found' };

  const pay = String(order.payment_status || '').toLowerCase();
  if (pay !== 'paid') {
    return { ok: false, skipped: true, reason: 'not_paid', order_id: id };
  }

  if (!order.payment_method) {
    const fromOpt = String(opts.paymentMethod || opts.provider || '').trim();
    if (fromOpt) {
      order.payment_method = fromOpt.toLowerCase();
    } else {
      const { data: payRow } = await supabaseAdmin
        .from('commerce_payments')
        .select('provider, raw_response')
        .eq('order_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const raw = payRow?.raw_response && typeof payRow.raw_response === 'object' ? payRow.raw_response : {};
      order.payment_method = String(payRow?.provider || raw.method || '').trim().toLowerCase();
    }
  }

  let template = null;
  try {
    template = await activateBookOrderMetaTemplate();
  } catch (e) {
    console.warn('[commerce-vendor-notify] template activate failed', e?.message || e);
  }

  const [{ data: items }, { data: addresses }, vendors] = await Promise.all([
    supabaseAdmin
      .from('commerce_order_items')
      .select('title_snapshot, quantity, isbn_snapshot, vendor_id, vendor_order_id')
      .eq('order_id', id),
    supabaseAdmin
      .from('commerce_order_addresses')
      .select('*')
      .eq('order_id', id)
      .eq('address_type', 'shipping')
      .maybeSingle(),
    loadVendorsForOrder(id),
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

  if (!vendors.length) {
    return {
      ok: false,
      skipped: true,
      reason: 'no_vendor',
      template: templateSummary(template),
    };
  }

  const results = [];
  for (const vendor of vendors) {
    const phone = await resolveVendorPhone(vendor);
    if (!phone) {
      console.warn('[commerce-vendor-notify] no WhatsApp phone for vendor', vendor?.slug || vendor?.id);
      results.push({
        ok: false,
        skipped: true,
        reason: 'no_vendor_phone',
        vendor_id: vendor?.id || null,
        vendor_name: vendor?.name || null,
      });
      continue;
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
      results.push({
        ok: Boolean(sent?.ok),
        skipped: false,
        phone,
        vendor_id: vendor?.id || null,
        vendor_name: vendor?.name || null,
        error: sent?.ok ? null : sent?.error || null,
        channel: sent?.channel || null,
        meta_template_name: sent?.meta_template_name || null,
        meta_message_id: sent?.meta_message_id || sent?.sid || null,
      });
    } catch (e) {
      console.warn('[commerce-vendor-notify] send failed', e?.message || e);
      results.push({
        ok: false,
        skipped: false,
        error: e?.message || 'send_failed',
        phone,
        vendor_id: vendor?.id || null,
        vendor_name: vendor?.name || null,
      });
    }
  }

  const first = results.find((r) => r.ok) || results[0] || {};
  return {
    ok: results.some((r) => r.ok),
    skipped: results.every((r) => r.skipped),
    reason: results.every((r) => r.reason === 'no_vendor_phone') ? 'no_vendor_phone' : first.reason || null,
    phone: first.phone || null,
    vendor_id: first.vendor_id || null,
    vendor_name: first.vendor_name || null,
    error: first.ok ? null : first.error || null,
    channel: first.channel || null,
    results,
    template: templateSummary(template),
  };
}

function templateSummary(template) {
  if (!template) return null;
  return {
    ok: Boolean(template.ok),
    name: template.meta_template_name || null,
    language: template.meta_template_language || null,
    channel: template.channel || template.send_via || null,
    meta_configured: Boolean(template.meta_configured),
    is_active: template.template?.is_active !== false,
  };
}
