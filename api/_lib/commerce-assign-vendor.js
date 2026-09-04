/**
 * Mağaza / form siparişini seçilen satıcı paneline aktarır + WhatsApp bildirir.
 * deployMarker: vendor-assign-transfer-2026-09-04
 */
import { supabaseAdmin } from './supabase-admin.js';
import { ensureYankiVendor, findLinkedYankiKitapci } from './commerce-lgs8-seed.js';
import {
  ensureVendorOrderForPaidOrder,
  orderLooksIbanPaid,
} from './commerce-push-paid-to-vendor.js';
import { isPaidParentOrder } from './commerce-vendor-orders.js';
import {
  FORM_IMPORT_MARKER,
  formImportNoteId,
  importKitapFormOrdersToYanki,
  DEFAULT_SINCE,
} from './commerce-kitap-form-import.js';
import { notifyVendorWhatsAppForPaidOrder } from './commerce-vendor-order-notify.js';

async function loadLatestPayment(orderId) {
  const { data } = await supabaseAdmin
    .from('commerce_payments')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

async function markOrderPaid(orderId, now = new Date().toISOString()) {
  const { data, error } = await supabaseAdmin
    .from('commerce_orders')
    .update({
      payment_status: 'paid',
      status: 'paid',
      paid_at: now,
      updated_at: now,
    })
    .eq('id', orderId)
    .select('id, order_number, customer_name, payment_status, status, notes, student_id')
    .single();
  if (error) throw error;
  await supabaseAdmin
    .from('commerce_payments')
    .update({ status: 'paid', paid_at: now, updated_at: now })
    .eq('order_id', orderId)
    .neq('status', 'paid');
  return data;
}

async function resolveVendor(vendorId, actorSub) {
  const id = String(vendorId || '').trim();
  if (id) {
    const { data, error } = await supabaseAdmin
      .from('commerce_vendors')
      .select('id, name, slug, contact_phone, linked_kitapci_id, institution_id, is_active')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Satıcı bulunamadı');
    if (data.is_active === false) throw new Error('Satıcı pasif');
    return data;
  }
  const { vendor } = await ensureYankiVendor({ actorSub: actorSub || null });
  return vendor;
}

async function resolveVendorFromKitapci(kitapciId, actorSub) {
  const kid = String(kitapciId || '').trim();
  if (!kid) return resolveVendor(null, actorSub);
  const { data: linked } = await supabaseAdmin
    .from('commerce_vendors')
    .select('id, name, slug, contact_phone, linked_kitapci_id, institution_id, is_active')
    .eq('linked_kitapci_id', kid)
    .eq('is_active', true)
    .maybeSingle();
  if (linked) return linked;

  const { data: kc } = await supabaseAdmin
    .from('kitapcilar')
    .select('id, name, phone')
    .eq('id', kid)
    .maybeSingle();
  if (kc && /yank/i.test(String(kc.name || ''))) {
    return resolveVendor(null, actorSub);
  }
  // Bağlı satıcı yoksa Yankı paneline aktar (kurum formu → mağaza köprüsü)
  return resolveVendor(null, actorSub);
}

async function findCommerceOrderForForm(formId) {
  const marker = `${FORM_IMPORT_MARKER}${formId}`;
  const { data } = await supabaseAdmin
    .from('commerce_orders')
    .select('id, order_number, customer_name, payment_status, status, notes')
    .ilike('notes', `%${marker}%`)
    .order('created_at', { ascending: false })
    .limit(5);
  const hit = (data || []).find((o) => formImportNoteId(o.notes) === String(formId));
  return hit || null;
}

/**
 * @param {{
 *   orderId?: string,
 *   formOrderId?: string,
 *   vendorId?: string,
 *   kitapciId?: string,
 *   notifyWa?: boolean,
 *   forcePending?: boolean,
 *   actorSub?: string,
 * }} opts
 */
export async function assignOrderToVendor(opts = {}) {
  const orderId = String(opts.orderId || opts.order_id || '').trim();
  const formOrderId = String(opts.formOrderId || opts.form_order_id || opts.form_id || '').trim();
  const notifyWa = opts.notifyWa !== false;
  const forcePending = opts.forcePending !== false;
  const actorSub = opts.actorSub || null;

  if (!orderId && !formOrderId) {
    throw new Error('order_id veya form_order_id gerekli');
  }

  const vendor = opts.kitapciId || opts.kitapci_id
    ? await resolveVendorFromKitapci(opts.kitapciId || opts.kitapci_id, actorSub)
    : await resolveVendor(opts.vendorId || opts.vendor_id, actorSub);

  const actions = [];
  let commerceOrderId = orderId || null;
  let formImport = null;

  if (formOrderId) {
    const existing = await findCommerceOrderForForm(formOrderId);
    if (existing) {
      commerceOrderId = existing.id;
      actions.push('form_already_imported');
    } else {
      // Tek form satırını Yankı/hedef satıcıya aktarmak için since+limit ile import,
      // ardından yalnızca bu form_id'yi işle — importKitapFormOrdersToYanki tümünü tarar;
      // bu yüzden doğrudan tek satır import yolu kullanıyoruz.
      const { data: formRow, error: formErr } = await supabaseAdmin
        .from('kitap_siparisleri')
        .select('*')
        .eq('id', formOrderId)
        .maybeSingle();
      if (formErr) throw formErr;
      if (!formRow) throw new Error('Form siparişi bulunamadı');
      if (String(formRow.status || '') === 'cancelled') {
        throw new Error('İptal edilmiş sipariş aktarılamaz');
      }

      // Mevcut toplu import Yankı sabit; vendor override için mini import:
      const importOut = await importKitapFormOrdersToYanki({
        since: formRow.created_at || DEFAULT_SINCE,
        dryRun: false,
        limit: 50,
        actorSub,
        repair: true,
        formIds: [formOrderId],
        vendorId: vendor.id,
      });
      formImport = importOut;
      const created = (importOut.items || []).find(
        (it) => String(it.form_id || it.preview?.form_id || '') === formOrderId && it.commerce_order_id
      );
      if (created?.commerce_order_id) {
        commerceOrderId = created.commerce_order_id;
        actions.push('form_imported');
      } else if ((importOut.items || []).some((it) => it.skipped && it.reason === 'already_imported')) {
        const again = await findCommerceOrderForForm(formOrderId);
        if (again) {
          commerceOrderId = again.id;
          actions.push('form_already_imported');
        }
      }
      if (!commerceOrderId) {
        const err = (importOut.errors || [])[0];
        throw new Error(err?.error || 'Form siparişi satıcı paneline aktarılamadı');
      }
    }
  }

  const { data: order, error: orderErr } = await supabaseAdmin
    .from('commerce_orders')
    .select('id, order_number, customer_name, payment_status, status, notes, student_id')
    .eq('id', commerceOrderId)
    .maybeSingle();
  if (orderErr) throw orderErr;
  if (!order) throw new Error('Mağaza siparişi bulunamadı');

  const payment = await loadLatestPayment(order.id);
  let current = order;
  if (!isPaidParentOrder(current)) {
    if (orderLooksIbanPaid(current, payment) || formOrderId) {
      // Form aktarımı zaten paid yazılır; commerce tarafında eksikse düzelt
      current = await markOrderPaid(order.id);
      actions.push('marked_paid');
    } else {
      throw new Error('Sipariş ödenmemiş — önce ödeme/onay gerekir');
    }
  }

  const ensured = await ensureVendorOrderForPaidOrder(current.id, {
    vendorId: vendor.id,
    preferPending: forcePending,
  });
  actions.push(ensured.item_count ? 'vendor_order_ensured' : 'vendor_order_ensured_no_items');

  let whatsapp = null;
  if (notifyWa) {
    try {
      whatsapp = await notifyVendorWhatsAppForPaidOrder(current.id, {});
      actions.push(whatsapp?.ok ? 'whatsapp_sent' : `whatsapp_${whatsapp?.reason || 'skipped'}`);
    } catch (e) {
      whatsapp = { ok: false, error: e?.message || String(e) };
      actions.push('whatsapp_error');
    }
  }

  return {
    ok: true,
    deployMarker: 'vendor-assign-transfer-2026-09-04',
    order_id: current.id,
    order_number: current.order_number,
    customer_name: current.customer_name,
    vendor: { id: vendor.id, name: vendor.name, slug: vendor.slug },
    vendor_order_id: ensured.vendor_order_id,
    item_count: ensured.item_count,
    form_import: formImport
      ? {
          imported: formImport.imported,
          repaired: formImport.repair?.repaired || 0,
          skipped_already_imported: formImport.skipped_already_imported,
        }
      : null,
    whatsapp,
    actions,
  };
}
