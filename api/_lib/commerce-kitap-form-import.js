/**
 * kitap_siparisleri (Sipariş formu) → Yankı Kitapevi commerce_vendor_orders aktarımı.
 * deployMarker: kitap-form-import-books-fix-2026-09-02
 */
import { supabaseAdmin } from './supabase-admin.js';
import { ensureYankiVendor, findLinkedYankiKitapci } from './commerce-lgs8-seed.js';
import { shippingInsertRow } from './commerce-shipping-address.js';
import { snapshotPackageTitle } from './commerce-package-contents.js';

export const FORM_IMPORT_MARKER = 'kitap_form_import:';
export const FORM_IMPORT_BOOK_SLUG = 'kitap-form-siparis-kalemi';
export const DEFAULT_SINCE = '2026-08-26T00:00:00+03:00';

export function formImportNoteId(notes) {
  const m = String(notes || '').match(/kitap_form_import:([0-9a-f-]{36})/i);
  return m ? m[1] : null;
}

export function mapFormStatusToVendorStatus(formStatus) {
  const s = String(formStatus || '').trim().toLowerCase();
  if (s === 'shipped') return 'shipped';
  if (s === 'confirmed') return 'confirmed';
  if (s === 'preparing') return 'preparing';
  if (s === 'delivered') return 'delivered';
  if (s === 'cancelled') return 'cancelled';
  return 'pending';
}

export function mapFormStatusToOrderStatus(formStatus) {
  const s = String(formStatus || '').trim().toLowerCase();
  if (s === 'shipped') return 'shipped';
  if (s === 'confirmed') return 'confirmed';
  if (s === 'delivered') return 'delivered';
  if (s === 'cancelled') return 'cancelled';
  return 'confirmed';
}

export function parseKitapLineTitles(kitaplarText) {
  const raw = String(kitaplarText || '').trim();
  if (!raw) return ['Kitap seti (form)'];
  return raw
    .split(/\s*\|\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function splitKitapDetail(detail) {
  const d = String(detail || '').trim();
  if (!d) return [];
  const byComma = d.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
  if (byComma.length > 1 && byComma.every((p) => p.length <= 120)) return byComma;
  const bySemi = d.split(/\s*;\s*/).map((s) => s.trim()).filter(Boolean);
  if (bySemi.length > 1 && bySemi.every((p) => p.length <= 120)) return bySemi;
  return [d];
}

export function parseFormImportLine(line) {
  const raw = String(line || '').trim();
  if (!raw || raw === '[object Promise]') {
    return { setName: 'Kitap seti (form)', contents: [] };
  }
  const snapMatch = raw.match(/^(.+?)\s*\(\d+\s*kitap\)\s*:\s*(.+)$/i);
  if (snapMatch) {
    const setName = snapMatch[1].trim();
    const books = snapMatch[2]
      .split(/\s*;\s*/)
      .map((t) => t.replace(/\s*\[[^\]]+\]\s*(×\d+)?$/i, '').trim())
      .filter(Boolean)
      .map((title) => ({ title, quantity: 1 }));
    return { setName, contents: books };
  }
  const dashMatch = raw.match(/^(.+?)\s*[—–-]\s*(.+)$/);
  if (dashMatch) {
    const setName = dashMatch[1].trim();
    const detail = dashMatch[2].trim();
    const parts = splitKitapDetail(detail);
    const contents = parts.map((title) => ({ title, quantity: 1 }));
    return { setName, contents };
  }
  return { setName: raw, contents: [] };
}

export function attachFormImportPackageContents(items, orderNotes) {
  if (!formImportNoteId(orderNotes)) return items || [];
  return (items || []).map((it) => {
    if (it?.package_id) return it;
    if (Array.isArray(it?.package_contents) && it.package_contents.length) return it;
    const parsed = parseFormImportLine(it?.title_snapshot);
    if (!parsed.contents.length) return it;
    return {
      ...it,
      package_name: parsed.setName,
      package_contents: parsed.contents,
    };
  });
}

export function buildFormImportNotes(formRow) {
  const parts = [
    `${FORM_IMPORT_MARKER}${formRow.id}`,
    formRow.veli_ad_soyad ? `Veli: ${formRow.veli_ad_soyad}` : null,
    formRow.ucret_durumu ? `Ücret: ${formRow.ucret_durumu}` : null,
    formRow.siparis_notu ? `Not: ${formRow.siparis_notu}` : null,
    formRow.sinif ? `Sınıf: ${formRow.sinif}` : null,
  ].filter(Boolean);
  return parts.join('\n');
}

function collectSetIdsFromFormRow(row) {
  const ids = new Set();
  if (Array.isArray(row?.kitap_set_ids)) {
    for (const id of row.kitap_set_ids) ids.add(String(id));
  }
  if (row?.kitap_set_id) ids.add(String(row.kitap_set_id));
  return [...ids];
}

async function loadSetRowsById(setIds) {
  const setRowsById = new Map();
  if (!setIds.length) return setRowsById;
  const { data: sets } = await supabaseAdmin
    .from('kitap_siparis_setleri')
    .select('id, name, kitap_icerigi')
    .in('id', setIds);
  for (const s of sets || []) setRowsById.set(String(s.id), s);
  return setRowsById;
}

function resolveKitaplarForRow(row, setRowsById) {
  if (String(row.kitaplar || '').trim()) return String(row.kitaplar).trim();
  const ids = collectSetIdsFromFormRow(row);
  if (!ids.length) return null;
  const parts = ids
    .map((id) => setRowsById.get(String(id)))
    .filter(Boolean)
    .map((setRow) => {
      const detail = String(setRow.kitap_icerigi || '').trim();
      return detail ? `${setRow.name} — ${detail}` : String(setRow.name || '').trim();
    })
    .filter(Boolean);
  return parts.length ? parts.join(' | ') : null;
}

export function resolveFormImportSetLines(formRow, setRowsById) {
  const kitaplarText = resolveKitaplarForRow(formRow, setRowsById);
  return parseKitapLineTitles(kitaplarText).map((line) => parseFormImportLine(line));
}

function buildFormImportItemRows({
  setLines,
  orderId,
  vendorOrderId,
  offerId,
  bookId,
  vendorId,
  createdAt,
}) {
  return setLines.map(({ setName, contents }) => ({
    order_id: orderId,
    vendor_order_id: vendorOrderId,
    vendor_offer_id: offerId,
    book_id: bookId,
    package_id: null,
    vendor_id: vendorId,
    title_snapshot: contents.length ? snapshotPackageTitle(setName, contents) : setName,
    isbn_snapshot: null,
    quantity: 1,
    unit_price_kurus: 0,
    compare_at_price_kurus: null,
    line_total_kurus: 0,
    created_at: createdAt,
  }));
}

async function nextFormOrderNumber() {
  const p = 'VIP-FORM';
  const { data, error } = await supabaseAdmin.rpc('commerce_next_order_number', { p_prefix: p });
  if (!error && data) return String(data);
  const year = new Date().getFullYear();
  const { count } = await supabaseAdmin
    .from('commerce_orders')
    .select('id', { count: 'exact', head: true })
    .like('order_number', `${p}-${year}-%`);
  const seq = String((count || 0) + 1).padStart(6, '0');
  return `${p}-${year}-${seq}`;
}

async function loadExistingImportIds(formIds) {
  const want = new Set((formIds || []).map(String).filter(Boolean));
  const found = new Set();
  if (!want.size) return found;
  const { data, error } = await supabaseAdmin
    .from('commerce_orders')
    .select('notes')
    .ilike('notes', `%${FORM_IMPORT_MARKER}%`);
  if (error) throw error;
  for (const row of data || []) {
    const fid = formImportNoteId(row.notes);
    if (fid && want.has(fid)) found.add(fid);
  }
  return found;
}

async function ensureFormImportBook(vendorId, actorSub) {
  const { data: existing } = await supabaseAdmin
    .from('commerce_books')
    .select('id, slug')
    .eq('slug', FORM_IMPORT_BOOK_SLUG)
    .is('deleted_at', null)
    .maybeSingle();

  let bookId = existing?.id || null;
  if (!bookId) {
    const { data: created, error } = await supabaseAdmin
      .from('commerce_books')
      .insert({
        slug: FORM_IMPORT_BOOK_SLUG,
        title: 'Sipariş formu kalemi',
        author: 'Online VIP Dershane',
        publisher: 'Form aktarım',
        class_levels: ['5', '6', '7', '8', '9', '10', '11', '12', 'LGS', 'YKS'],
        exam_types: [],
        is_catalog_active: false,
        metadata: { store_kind: 'form_import', hidden: true },
        created_by: actorSub || null,
        updated_by: actorSub || null,
      })
      .select('id')
      .single();
    if (error) throw error;
    bookId = created.id;
  }

  const { data: offer } = await supabaseAdmin
    .from('commerce_vendor_offers')
    .select('id')
    .eq('vendor_id', vendorId)
    .eq('book_id', bookId)
    .is('deleted_at', null)
    .maybeSingle();

  let offerId = offer?.id || null;
  if (!offerId) {
    const { data: createdOffer, error: offerErr } = await supabaseAdmin
      .from('commerce_vendor_offers')
      .insert({
        vendor_id: vendorId,
        book_id: bookId,
        price_kurus: 0,
        stock_quantity: 9999,
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: actorSub || null,
        submitted_at: new Date().toISOString(),
        created_by: actorSub || null,
        updated_by: actorSub || null,
      })
      .select('id')
      .single();
    if (offerErr) throw offerErr;
    offerId = createdOffer.id;
  }

  return { bookId, offerId };
}

function itemRowsNeedRepair(items) {
  if (!items?.length) return true;
  return items.some((i) => {
    const t = String(i.title_snapshot || '');
    return t.includes('[object Promise]') || t === 'Kitap seti (form)';
  });
}

/**
 * Daha önce aktarılmış ama kitap kalemi eksik/bozuk siparişleri onarır.
 */
export async function repairKitapFormImports(ctx) {
  const { vendorId, bookId, offerId } = ctx;
  const { data: orders, error } = await supabaseAdmin
    .from('commerce_orders')
    .select('id, notes, created_at')
    .ilike('notes', `%${FORM_IMPORT_MARKER}%`);
  if (error) throw error;

  const results = { repaired: 0, skipped_ok: 0, failed: 0, errors: [] };

  for (const order of orders || []) {
    const formId = formImportNoteId(order.notes);
    if (!formId) continue;

    const { data: items } = await supabaseAdmin
      .from('commerce_order_items')
      .select('id, title_snapshot')
      .eq('order_id', order.id);

    if (!itemRowsNeedRepair(items)) {
      results.skipped_ok += 1;
      continue;
    }

    try {
      const { data: formRow } = await supabaseAdmin
        .from('kitap_siparisleri')
        .select('*')
        .eq('id', formId)
        .maybeSingle();
      if (!formRow) {
        results.skipped_ok += 1;
        continue;
      }

      const { data: vo } = await supabaseAdmin
        .from('commerce_vendor_orders')
        .select('id')
        .eq('order_id', order.id)
        .eq('vendor_id', vendorId)
        .maybeSingle();
      if (!vo?.id) {
        results.skipped_ok += 1;
        continue;
      }

      const setRowsById = await loadSetRowsById(collectSetIdsFromFormRow(formRow));
      const setLines = resolveFormImportSetLines(formRow, setRowsById);
      const createdAt = order.created_at || formRow.created_at || new Date().toISOString();
      const itemRows = buildFormImportItemRows({
        setLines,
        orderId: order.id,
        vendorOrderId: vo.id,
        offerId,
        bookId,
        vendorId,
        createdAt,
      });

      const { error: delErr } = await supabaseAdmin
        .from('commerce_order_items')
        .delete()
        .eq('order_id', order.id);
      if (delErr) throw delErr;

      const { error: insErr } = await supabaseAdmin.from('commerce_order_items').insert(itemRows);
      if (insErr) throw insErr;

      results.repaired += 1;
    } catch (e) {
      results.failed += 1;
      results.errors.push({
        order_id: order.id,
        form_id: formId,
        error: e?.message || String(e),
      });
    }
  }

  return results;
}

async function importOneFormOrder(formRow, ctx) {
  const {
    vendorId,
    vendor,
    bookId,
    offerId,
    kitapci,
    actorSub,
    dryRun,
    setRowsById,
  } = ctx;

  const vendorStatus = mapFormStatusToVendorStatus(formRow.status);
  const orderStatus = mapFormStatusToOrderStatus(formRow.status);
  const setLines = resolveFormImportSetLines(formRow, setRowsById);
  const lineTitles = setLines.map(({ setName, contents }) =>
    contents.length ? snapshotPackageTitle(setName, contents) : setName
  );
  const orderNumber = await nextFormOrderNumber();
  const createdAt = formRow.created_at || new Date().toISOString();
  const notes = buildFormImportNotes(formRow);

  const preview = {
    form_id: formRow.id,
    order_number: orderNumber,
    ogrenci: formRow.ogrenci_ad_soyad,
    veli: formRow.veli_ad_soyad,
    sinif: formRow.sinif,
    kitaplar: lineTitles,
    vendor_status: vendorStatus,
    form_status: formRow.status,
    created_at: createdAt,
  };

  if (dryRun) return { ok: true, dry_run: true, preview };

  const subtotal = 0;
  const { data: order, error: orderErr } = await supabaseAdmin
    .from('commerce_orders')
    .insert({
      order_number: orderNumber,
      institution_id: formRow.institution_id || vendor.institution_id || null,
      status: orderStatus,
      commerce_mode: 'reseller',
      subtotal_kurus: subtotal,
      discount_kurus: 0,
      shipping_kurus: 0,
      total_kurus: subtotal,
      payment_status: 'paid',
      paid_at: createdAt,
      customer_name: formRow.ogrenci_ad_soyad || formRow.veli_ad_soyad || null,
      customer_phone: formRow.telefon || null,
      notes,
      created_at: createdAt,
      updated_at: new Date().toISOString(),
    })
    .select('id, order_number')
    .single();
  if (orderErr) throw orderErr;

  const shipRow = shippingInsertRow(order.id, {
    full_name: formRow.ogrenci_ad_soyad || formRow.veli_ad_soyad || 'Öğrenci',
    phone: formRow.telefon || null,
    address_line1: String(formRow.adres || '').trim() || 'Adres sipariş formundan aktarıldı',
    address_line2: null,
    district: formRow.ilce || null,
    city: String(formRow.il || '').trim() || 'Belirtilmedi',
    postal_code: null,
    notes: formRow.siparis_notu || null,
  });
  await supabaseAdmin.from('commerce_order_addresses').insert(shipRow);

  const { data: vo, error: voErr } = await supabaseAdmin
    .from('commerce_vendor_orders')
    .insert({
      order_id: order.id,
      vendor_id: vendorId,
      status: vendorStatus,
      subtotal_kurus: subtotal,
      commission_kurus: 0,
      vendor_net_kurus: subtotal,
      shipping_kurus: 0,
      accepted_at: ['confirmed', 'preparing', 'shipped', 'delivered'].includes(vendorStatus)
        ? createdAt
        : null,
      shipped_at: vendorStatus === 'shipped' || vendorStatus === 'delivered' ? createdAt : null,
      delivered_at: vendorStatus === 'delivered' ? createdAt : null,
      vendor_notes: formRow.siparis_notu || null,
      created_at: createdAt,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (voErr) throw voErr;

  const itemRows = buildFormImportItemRows({
    setLines,
    orderId: order.id,
    vendorOrderId: vo.id,
    offerId,
    bookId,
    vendorId,
    createdAt,
  });
  const { error: itemsErr } = await supabaseAdmin.from('commerce_order_items').insert(itemRows);
  if (itemsErr) {
    await supabaseAdmin.from('commerce_vendor_orders').delete().eq('id', vo.id);
    await supabaseAdmin.from('commerce_order_addresses').delete().eq('order_id', order.id);
    await supabaseAdmin.from('commerce_orders').delete().eq('id', order.id);
    throw itemsErr;
  }

  const kitapciPatch = {};
  if (kitapci?.id && !formRow.kitapci_id) {
    kitapciPatch.kitapci_id = kitapci.id;
    kitapciPatch.kitapci_adi = kitapci.name;
    kitapciPatch.kitapci_phone = kitapci.phone || null;
  }
  if (Object.keys(kitapciPatch).length) {
    kitapciPatch.updated_at = new Date().toISOString();
    await supabaseAdmin.from('kitap_siparisleri').update(kitapciPatch).eq('id', formRow.id);
  }

  return {
    ok: true,
    form_id: formRow.id,
    commerce_order_id: order.id,
    vendor_order_id: vo.id,
    order_number: order.order_number,
    preview,
  };
}

/**
 * @param {{
 *   since?: string,
 *   dryRun?: boolean,
 *   limit?: number,
 *   actorSub?: string,
 *   repair?: boolean,
 *   formIds?: string[],
 *   vendorId?: string,
 * }} opts
 */
export async function importKitapFormOrdersToYanki(opts = {}) {
  const since = String(opts.since || DEFAULT_SINCE).trim();
  const dryRun = Boolean(opts.dryRun);
  const limit = Math.min(Math.max(parseInt(opts.limit ?? 500, 10) || 500, 1), 1000);
  const actorSub = opts.actorSub || null;
  const repairExisting = opts.repair !== false;
  const formIds = Array.isArray(opts.formIds)
    ? opts.formIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  const vendorIdOverride = String(opts.vendorId || opts.vendor_id || '').trim();

  let vendor;
  let kitapci;
  let bookId;
  let offerId;
  try {
    if (vendorIdOverride) {
      const { data: v, error: vErr } = await supabaseAdmin
        .from('commerce_vendors')
        .select('*')
        .eq('id', vendorIdOverride)
        .maybeSingle();
      if (vErr) throw vErr;
      if (!v) throw new Error('Satıcı bulunamadı');
      vendor = v;
    } else {
      ({ vendor } = await ensureYankiVendor({ actorSub }));
    }
    kitapci = vendor.linked_kitapci_id
      ? (
          await supabaseAdmin
            .from('kitapcilar')
            .select('id, name, phone')
            .eq('id', vendor.linked_kitapci_id)
            .maybeSingle()
        ).data
      : await findLinkedYankiKitapci(vendor.institution_id);
    ({ bookId, offerId } = await ensureFormImportBook(vendor.id, actorSub));
  } catch (e) {
    const msg = e?.message || String(e);
    throw new Error(`Import hazırlığı başarısız: ${msg}`);
  }

  const ctxBase = {
    vendorId: vendor.id,
    vendor,
    bookId,
    offerId,
    kitapci,
    actorSub,
    dryRun,
  };

  let repairResult = null;
  if (repairExisting && !dryRun && !formIds.length) {
    repairResult = await repairKitapFormImports(ctxBase);
  }

  let formRows = [];
  if (formIds.length) {
    const { data: rows, error } = await supabaseAdmin
      .from('kitap_siparisleri')
      .select('*')
      .in('id', formIds)
      .neq('status', 'cancelled');
    if (error) throw error;
    formRows = rows || [];
  } else {
    let q = supabaseAdmin
      .from('kitap_siparisleri')
      .select('*')
      .gte('created_at', since)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true })
      .limit(limit);
    const { data: rows, error } = await q;
    if (error) throw error;
    formRows = rows || [];
  }

  const setIdSet = new Set();
  for (const row of formRows) {
    for (const id of collectSetIdsFromFormRow(row)) setIdSet.add(id);
  }
  const setRowsById = await loadSetRowsById([...setIdSet]);

  const alreadyImported = await loadExistingImportIds(formRows.map((r) => r.id));
  const ctx = { ...ctxBase, setRowsById };

  const results = {
    ok: true,
    deployMarker: 'kitap-form-import-books-fix-2026-09-02',
    since,
    dry_run: dryRun,
    vendor: { id: vendor.id, name: vendor.name, slug: vendor.slug },
    repair: repairResult,
    scanned: formRows.length,
    skipped_already_imported: 0,
    imported: 0,
    failed: 0,
    items: [],
    errors: [],
  };

  for (const row of formRows) {
    if (alreadyImported.has(String(row.id))) {
      results.skipped_already_imported += 1;
      results.items.push({ form_id: row.id, skipped: true, reason: 'already_imported' });
      continue;
    }
    try {
      const out = await importOneFormOrder(row, ctx);
      results.imported += 1;
      results.items.push(out);
      alreadyImported.add(String(row.id));
    } catch (e) {
      results.failed += 1;
      results.errors.push({
        form_id: row.id,
        ogrenci: row.ogrenci_ad_soyad,
        error: e?.message || String(e),
      });
    }
  }

  return results;
}
