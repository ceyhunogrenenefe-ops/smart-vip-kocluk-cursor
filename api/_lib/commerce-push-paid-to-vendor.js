/**
 * Ödenmiş / IBAN dekontlu kitap siparişlerini Yankı satıcı paneline görünür hale getirir.
 * deployMarker: kitap-iban-yanki-push-2026-09-03
 */
import { supabaseAdmin } from './supabase-admin.js';
import { ensureYankiVendor } from './commerce-lgs8-seed.js';
import { isPaidParentOrder } from './commerce-vendor-orders.js';
import { decorateOrderWithIbanReceipt } from './commerce-iban.js';
import {
  FORM_IMPORT_MARKER,
  formImportNoteId,
  importKitapFormOrdersToYanki,
  DEFAULT_SINCE,
} from './commerce-kitap-form-import.js';

export function normalizePersonQuery(q) {
  return String(q || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/\s+/g, ' ');
}

export function personNameMatches(haystack, query) {
  const q = normalizePersonQuery(query);
  if (!q) return false;
  const h = normalizePersonQuery(haystack);
  if (!h) return false;
  if (h.includes(q)) return true;
  const parts = q.split(' ').filter((p) => p.length >= 3);
  if (parts.length < 2) return h.includes(q);
  return parts.every((p) => h.includes(p));
}

export function orderLooksIbanPaid(order, paymentRow) {
  if (isPaidParentOrder(order)) return true;
  const notes = String(order?.notes || '');
  if (/iban|havale|dekont/i.test(notes)) return true;
  const decorated = decorateOrderWithIbanReceipt({
    ...(order || {}),
    commerce_payments: paymentRow ? [paymentRow] : order?.commerce_payments || [],
  });
  if (decorated?.receipt_url || decorated?.payment_method === 'iban') return true;
  const provider = String(paymentRow?.provider || '').toLowerCase();
  if (provider === 'iban') return true;
  const raw = paymentRow?.raw_response && typeof paymentRow.raw_response === 'object'
    ? paymentRow.raw_response
    : {};
  if (raw.receipt_url || String(raw.method || '').toLowerCase() === 'iban') return true;
  return false;
}

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

/**
 * Sipariş kalemlerinden Yankı (veya mevcut vendor) için vendor_order oluştur/bağla.
 * VO status: pending — satıcı «Yeni» listesinde görsün.
 */
export async function ensureVendorOrderForPaidOrder(orderId, { vendorId, preferPending = true } = {}) {
  const { data: items, error: itemsErr } = await supabaseAdmin
    .from('commerce_order_items')
    .select('id, vendor_id, vendor_order_id, line_total_kurus, quantity')
    .eq('order_id', orderId);
  if (itemsErr) throw itemsErr;

  let targetVendorId = vendorId || null;
  if (!targetVendorId) {
    const fromItems = (items || []).map((i) => i.vendor_id).find(Boolean);
    if (fromItems) targetVendorId = fromItems;
  }
  if (!targetVendorId) {
    const { vendor } = await ensureYankiVendor({});
    targetVendorId = vendor.id;
  }

  const { data: existingVo } = await supabaseAdmin
    .from('commerce_vendor_orders')
    .select('id, status, vendor_id')
    .eq('order_id', orderId)
    .eq('vendor_id', targetVendorId)
    .maybeSingle();

  const subtotal = (items || []).reduce((s, i) => s + (Number(i.line_total_kurus) || 0), 0);
  const now = new Date().toISOString();
  let voId = existingVo?.id || null;

  if (!voId) {
    const { data: vo, error: voErr } = await supabaseAdmin
      .from('commerce_vendor_orders')
      .insert({
        order_id: orderId,
        vendor_id: targetVendorId,
        status: preferPending ? 'pending' : 'confirmed',
        subtotal_kurus: subtotal,
        commission_kurus: 0,
        vendor_net_kurus: subtotal,
        shipping_kurus: 0,
        updated_at: now,
      })
      .select('id')
      .single();
    if (voErr) throw voErr;
    voId = vo.id;
  } else if (preferPending && existingVo.status === 'confirmed') {
    // IBAN sonrası otomatik confirmed kalanları yeniden «Yeni»ye al — yalnızca henüz kargoya çıkmamışsa
    await supabaseAdmin
      .from('commerce_vendor_orders')
      .update({ status: 'pending', updated_at: now, accepted_at: null })
      .eq('id', voId)
      .in('status', ['confirmed']);
  }

  const orphanItems = (items || []).filter(
    (i) => !i.vendor_order_id || i.vendor_id !== targetVendorId
  );
  if (orphanItems.length) {
    await supabaseAdmin
      .from('commerce_order_items')
      .update({ vendor_order_id: voId, vendor_id: targetVendorId })
      .in(
        'id',
        orphanItems.map((i) => i.id)
      );
  }

  // Kalem yoksa form import benzeri boş satır olmasın; caller kitapları eklemeli
  return { vendor_order_id: voId, vendor_id: targetVendorId, item_count: (items || []).length };
}

function escapeIlike(raw) {
  return String(raw || '')
    .trim()
    .replace(/[%_,]/g, '')
    .slice(0, 80);
}

async function findCommerceOrdersByName(query, limit = 50) {
  const q = String(query || '').trim();
  const safe = escapeIlike(q);
  if (!safe) return [];
  const map = new Map();

  const { data: byCustomer } = await supabaseAdmin
    .from('commerce_orders')
    .select('id, order_number, customer_name, customer_phone, notes, payment_status, status, student_id, created_at, paid_at')
    .or(`customer_name.ilike.%${safe}%,notes.ilike.%${safe}%`)
    .order('created_at', { ascending: false })
    .limit(limit);
  for (const row of byCustomer || []) {
    if (personNameMatches(row.customer_name, q) || personNameMatches(row.notes, q)) {
      map.set(row.id, row);
    }
  }

  const { data: students } = await supabaseAdmin
    .from('students')
    .select('id, name')
    .ilike('name', `%${safe}%`)
    .limit(30);
  const matchedStudents = (students || []).filter((s) => personNameMatches(s.name, q));
  const studentIds = matchedStudents.map((s) => s.id).filter(Boolean);
  if (studentIds.length) {
    const { data } = await supabaseAdmin
      .from('commerce_orders')
      .select('id, order_number, customer_name, customer_phone, notes, payment_status, status, student_id, created_at, paid_at')
      .in('student_id', studentIds)
      .order('created_at', { ascending: false })
      .limit(limit);
    for (const row of data || []) map.set(row.id, row);
  }

  const { data: addrs } = await supabaseAdmin
    .from('commerce_order_addresses')
    .select('order_id, full_name')
    .ilike('full_name', `%${safe}%`)
    .limit(limit);
  const addrIds = [...new Set(
    (addrs || [])
      .filter((a) => personNameMatches(a.full_name, q))
      .map((a) => a.order_id)
      .filter(Boolean)
  )];
  if (addrIds.length) {
    const { data } = await supabaseAdmin
      .from('commerce_orders')
      .select('id, order_number, customer_name, customer_phone, notes, payment_status, status, student_id, created_at, paid_at')
      .in('id', addrIds);
    for (const row of data || []) map.set(row.id, row);
  }

  return [...map.values()];
}

async function findFormOrdersByName(query, since = DEFAULT_SINCE) {
  const q = String(query || '').trim();
  const safe = escapeIlike(q);
  if (!safe) return [];
  const { data } = await supabaseAdmin
    .from('kitap_siparisleri')
    .select('*')
    .gte('created_at', since)
    .neq('status', 'cancelled')
    .or(`ogrenci_ad_soyad.ilike.%${safe}%,veli_ad_soyad.ilike.%${safe}%`)
    .order('created_at', { ascending: false })
    .limit(50);
  return (data || []).filter(
    (r) =>
      personNameMatches(r.ogrenci_ad_soyad, q) || personNameMatches(r.veli_ad_soyad, q)
  );
}

async function pushOneCommerceOrder(order, { yankiVendorId, forcePending }) {
  const payment = await loadLatestPayment(order.id);
  const looksPaid = orderLooksIbanPaid(order, payment) || isPaidParentOrder(order);
  const actions = [];

  let current = order;
  if (!isPaidParentOrder(current)) {
    if (!looksPaid) {
      return {
        ok: false,
        order_id: order.id,
        order_number: order.order_number,
        reason: 'not_paid_and_no_iban_receipt',
        actions,
      };
    }
    current = await markOrderPaid(order.id);
    actions.push('marked_paid');
  } else if (String(current.payment_status || '').toLowerCase() !== 'paid') {
    current = await markOrderPaid(order.id);
    actions.push('synced_payment_status');
  }

  const ensured = await ensureVendorOrderForPaidOrder(order.id, {
    vendorId: yankiVendorId,
    preferPending: forcePending !== false,
  });
  actions.push(ensured.item_count ? 'vendor_order_ensured' : 'vendor_order_ensured_no_items');

  if (!ensured.item_count) {
    return {
      ok: false,
      order_id: order.id,
      order_number: current.order_number,
      customer_name: current.customer_name,
      reason: 'no_order_items',
      vendor_order_id: ensured.vendor_order_id,
      actions,
    };
  }

  return {
    ok: true,
    order_id: order.id,
    order_number: current.order_number,
    customer_name: current.customer_name,
    vendor_order_id: ensured.vendor_order_id,
    vendor_id: ensured.vendor_id,
    item_count: ensured.item_count,
    actions,
  };
}

/**
 * @param {{ query?: string, orderId?: string, since?: string, actorSub?: string, dryRun?: boolean, forcePending?: boolean }} opts
 */
export async function pushPaidOrdersToYanki(opts = {}) {
  const query = String(opts.query || '').trim();
  const orderId = String(opts.orderId || opts.order_id || '').trim();
  const since = String(opts.since || DEFAULT_SINCE).trim();
  const dryRun = Boolean(opts.dryRun);
  const forcePending = opts.forcePending !== false;

  const { vendor } = await ensureYankiVendor({ actorSub: opts.actorSub || null });

  const results = {
    ok: true,
    deployMarker: 'kitap-iban-yanki-push-2026-09-03',
    query: query || null,
    order_id: orderId || null,
    dry_run: dryRun,
    vendor: { id: vendor.id, name: vendor.name, slug: vendor.slug },
    commerce: { scanned: 0, pushed: 0, failed: 0, items: [] },
    form: null,
  };

  let commerceRows = [];
  if (orderId) {
    const { data } = await supabaseAdmin
      .from('commerce_orders')
      .select('id, order_number, customer_name, customer_phone, notes, payment_status, status, student_id, created_at, paid_at')
      .eq('id', orderId)
      .maybeSingle();
    if (data) commerceRows = [data];
  } else if (query) {
    commerceRows = await findCommerceOrdersByName(query);
  }

  results.commerce.scanned = commerceRows.length;

  if (dryRun) {
    results.commerce.items = commerceRows.map((o) => ({
      order_id: o.id,
      order_number: o.order_number,
      customer_name: o.customer_name,
      payment_status: o.payment_status,
      status: o.status,
      dry_run: true,
    }));
  } else {
    for (const order of commerceRows) {
      try {
        const out = await pushOneCommerceOrder(order, {
          yankiVendorId: vendor.id,
          forcePending,
        });
        if (out.ok) results.commerce.pushed += 1;
        else results.commerce.failed += 1;
        results.commerce.items.push(out);
      } catch (e) {
        results.commerce.failed += 1;
        results.commerce.items.push({
          ok: false,
          order_id: order.id,
          order_number: order.order_number,
          error: e?.message || String(e),
        });
      }
    }
  }

  // Form siparişleri: isimle eşleşenleri import et (zaten import edilmişler onarılır)
  if (query && !orderId) {
    const formRows = await findFormOrdersByName(query, since);
    if (formRows.length) {
      if (dryRun) {
        results.form = {
          scanned: formRows.length,
          dry_run: true,
          items: formRows.map((r) => ({
            form_id: r.id,
            ogrenci: r.ogrenci_ad_soyad,
            veli: r.veli_ad_soyad,
            status: r.status,
            ucret_durumu: r.ucret_durumu,
          })),
        };
      } else {
        // Tam import + repair; isim eşleşmeyenler zaten skip/already
        const importOut = await importKitapFormOrdersToYanki({
          since,
          dryRun: false,
          limit: 500,
          actorSub: opts.actorSub || null,
          repair: true,
        });
        const matchedIds = new Set(formRows.map((r) => String(r.id)));
        const matchedItems = (importOut.items || []).filter(
          (it) => matchedIds.has(String(it.form_id || it.preview?.form_id || ''))
        );
        results.form = {
          scanned: formRows.length,
          imported: importOut.imported,
          repaired: importOut.repair?.repaired || 0,
          skipped_already_imported: importOut.skipped_already_imported,
          matched_items: matchedItems,
          errors: (importOut.errors || []).filter((e) => matchedIds.has(String(e.form_id))),
        };
      }
    } else {
      results.form = { scanned: 0, message: 'Eşleşen form siparişi yok' };
    }
  }

  results.ok = results.commerce.failed === 0;
  return results;
}

export { FORM_IMPORT_MARKER, formImportNoteId };
