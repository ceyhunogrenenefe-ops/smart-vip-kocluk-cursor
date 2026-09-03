/**
 * /api/commerce-vendor — Satıcı (vendor_admin) paneli
 *
 * Satıcı yalnızca kendi commerce_vendor_users kaydı üzerinden erişebilir.
 * Super admin de bu endpointi satıcı adına kullanabilir.
 *
 * Operasyonlar:
 *  my_vendor.get
 *  books.list | books.create | books.update
 *  offers.list | offers.get | offers.create | offers.update | offers.submit
 *  orders.list | orders.get | orders.accept | orders.preparing | orders.ship
 *  orders.update | orders.delete
 *  shipments.create | shipments.update
 *  payouts.list
 *  stats.overview
 *  deployMarker: kitap-iban-yanki-push-2026-09-03
 */

import { requireAuth } from '../api/_lib/auth.js';
import { actorRoleSet, roleSetHasSuperAdmin } from '../api/_lib/actor-roles.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { withInferredSeriesMetadata } from '../api/_lib/commerce-store-browse.js';
import {
  buildVendorOwnedOrderPatch,
  isPaidParentOrder,
  vendorStatusTimestamps,
} from '../api/_lib/commerce-vendor-orders.js';
import { attachPackageContents, loadPackageContentsByIds } from '../api/_lib/commerce-package-contents.js';
import { attachFormImportPackageContents } from '../api/_lib/commerce-kitap-form-import.js';

function formatSinifLabel(level) {
  const raw = String(level || '').trim();
  if (!raw) return '';
  if (/^\d+$/.test(raw)) return `${raw}. Sınıf`;
  return raw;
}

function inferSinifFromText(...parts) {
  const hay = parts.map((p) => String(p || '')).join(' ');
  const m = hay.match(/\b([5-8]|9|1[0-2])\s*\.?\s*s[iı]n[iı]f\b/i)
    || hay.match(/\b(LGS|TYT|AYT|YKS|YÖS|YOS)\b/i)
    || hay.match(/\b([5-8]|9|1[0-2])\b/);
  if (!m) return '';
  return formatSinifLabel(m[1]);
}

async function decorateVendorOrdersWithPackageContents(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const pkgIds = [];
  const studentIds = [];
  for (const vo of list) {
    const sid = vo.commerce_orders?.student_id;
    if (sid) studentIds.push(String(sid));
    for (const it of vo.commerce_order_items || []) {
      if (it.package_id) pkgIds.push(it.package_id);
    }
  }
  const [{ contentsByPackageId, namesByPackageId, classLevelByPackageId }, studentsRes] = await Promise.all([
    loadPackageContentsByIds(supabaseAdmin, pkgIds),
    studentIds.length
      ? supabaseAdmin.from('students').select('id, class_level, name').in('id', [...new Set(studentIds)])
      : Promise.resolve({ data: [] }),
  ]);
  const classByStudent = new Map(
    (studentsRes.data || [])
      .map((s) => [String(s.id), formatSinifLabel(s.class_level)])
      .filter(([, level]) => Boolean(level))
  );
  const nameByStudent = new Map(
    (studentsRes.data || [])
      .map((s) => [String(s.id), String(s.name || '').trim()])
      .filter(([, name]) => Boolean(name))
  );

  for (const vo of list) {
    vo.commerce_order_items = attachFormImportPackageContents(
      attachPackageContents(
        vo.commerce_order_items || [],
        contentsByPackageId,
        namesByPackageId
      ),
      vo.commerce_orders?.notes
    );
    const parent = vo.commerce_orders || {};
    const sid = parent.student_id ? String(parent.student_id) : '';
    let sinif = (sid && classByStudent.get(sid)) || '';
    if (!sinif) {
      for (const it of vo.commerce_order_items || []) {
        const pid = it.package_id;
        const level = pid
          ? (classLevelByPackageId?.get(pid) || classLevelByPackageId?.get(String(pid)) || '')
          : '';
        if (level) {
          sinif = formatSinifLabel(level);
          break;
        }
      }
    }
    if (!sinif) {
      const titles = (vo.commerce_order_items || [])
        .map((it) => [it.package_name, it.title_snapshot].filter(Boolean).join(' '))
        .join(' ');
      sinif = inferSinifFromText(parent.notes, titles);
    }
    vo.sinif = sinif || '';
    if (sid && nameByStudent.get(sid)) {
      parent.student_name = nameByStudent.get(sid);
    }
  }
  return list;
}

function err(res, status, message) {
  return res.status(status).json({ error: message });
}

function sanitizeText(v) {
  return typeof v === 'string' ? v.trim() : null;
}

function sanitizeInt(v) {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const VENDOR_ORDERS_PAID_ONLY = true;
const VENDOR_PAID_MARKER = 'kitap-iban-yanki-push-2026-09-03';

async function paidOrderIdSetForVendor(vendorId) {
  const { data: vos, error } = await supabaseAdmin
    .from('commerce_vendor_orders')
    .select('order_id')
    .eq('vendor_id', vendorId);
  if (error) throw error;
  const ids = [...new Set((vos || []).map((r) => r.order_id).filter(Boolean))];
  if (!ids.length) return new Set();
  const { data: parents, error: pErr } = await supabaseAdmin
    .from('commerce_orders')
    .select('id, payment_status, status')
    .in('id', ids);
  if (pErr) throw pErr;
  return new Set(
    (parents || [])
      .filter((o) => isPaidParentOrder(o))
      .map((r) => r.id)
  );
}

async function loadOwnedPaidVendorOrder(id, vendorId, selectCols) {
  const { data: vo } = await supabaseAdmin
    .from('commerce_vendor_orders')
    .select(selectCols)
    .eq('id', id)
    .eq('vendor_id', vendorId)
    .maybeSingle();
  if (!vo) return { error: 'Sipariş bulunamadı', status: 400 };
  const parentId = vo.order_id || vo.commerce_orders?.id;
  if (vo.commerce_orders && isPaidParentOrder(vo)) return { vo };
  const { data: parent } = await supabaseAdmin
    .from('commerce_orders')
    .select('id, payment_status, status')
    .eq('id', parentId)
    .maybeSingle();
  if (!isPaidParentOrder(parent)) {
    return { error: 'Ödenmemiş sipariş satıcı panelinde görünmez', status: 404 };
  }
  return { vo, parent };
}

/** Satıcının bu isteği yapma yetkisi var mı? vendor_id'yi döner veya hata fırlatır */
async function resolveVendorAccess(actor, roleSet, requestedVendorId) {
  if (roleSetHasSuperAdmin(roleSet)) {
    if (!requestedVendorId) throw new Error('vendor_id gerekli (super_admin)');
    return requestedVendorId;
  }
  // vendor_admin: DB'de commerce_vendor_users kontrolü
  const { data } = await supabaseAdmin
    .from('commerce_vendor_users')
    .select('vendor_id')
    .eq('user_id', actor.sub)
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (!data) throw new Error('Bu kullanıcıya bağlı satıcı bulunamadı');
  if (requestedVendorId && data.vendor_id !== requestedVendorId) {
    throw new Error('Başka satıcının verisine erişim yok');
  }
  return data.vendor_id;
}

// ─────────────────────────────────────────────
// Ana handler
// ─────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 405, 'Method Not Allowed');
  try {
    const actor = requireAuth(req);
    const roleSet = await actorRoleSet(actor);
    const isSuperAdmin = roleSetHasSuperAdmin(roleSet);
    const isVendorAdmin = roleSet.has('vendor_admin');

    if (!isSuperAdmin && !isVendorAdmin) {
      return err(res, 403, 'Yetki yok — vendor_admin veya super_admin gerekli');
    }

    const body = req.body ?? {};
    const op = String(body.op ?? '').trim();
    if (!op) return err(res, 400, 'op gerekli');

    // vendor_id sadece my_vendor.get için opsiyonel; diğerlerinde zorunlu
    let vendorId;
    try {
      vendorId = await resolveVendorAccess(actor, roleSet, body.vendor_id ?? null);
    } catch (e) {
      return err(res, 403, e.message);
    }

    // ── My vendor ────────────────────────────
    if (op === 'my_vendor.get') {
      const { data, error } = await supabaseAdmin
        .from('commerce_vendors')
        .select('*')
        .eq('id', vendorId)
        .single();
      if (error) throw error;
      return res.status(200).json({ ok: true, vendor: data });
    }

    // ── Kitaplar ─────────────────────────────
    if (op === 'books.list') {
      // Satıcının teklif verdiği veya verebileceği kitaplar
      let q = supabaseAdmin
        .from('commerce_books')
        .select(`
          *,
          commerce_vendor_offers!left(
            id, price_kurus, stock_quantity, status, vendor_id
          )
        `)
        .is('deleted_at', null)
        .eq('is_catalog_active', true)
        .order('title', { ascending: true });
      if (body.search) q = q.ilike('title', `%${body.search}%`);
      if (body.limit) q = q.limit(parseInt(body.limit, 10));
      const { data, error } = await q;
      if (error) throw error;
      // Yalnızca bu satıcının teklifini ekle
      const books = (data ?? []).map((b) => ({
        ...b,
        my_offer: (b.commerce_vendor_offers ?? []).find((o) => o.vendor_id === vendorId) ?? null,
        commerce_vendor_offers: undefined,
      }));
      return res.status(200).json({ ok: true, books });
    }

    if (op === 'books.create') {
      if (!body.title) return err(res, 400, 'title gerekli');
      const slug =
        sanitizeText(body.slug) ||
        sanitizeText(body.title)
          ?.toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '') + '-' + Date.now();
      const { data, error } = await supabaseAdmin
        .from('commerce_books')
        .insert({
          isbn: sanitizeText(body.isbn),
          slug,
          title: sanitizeText(body.title),
          subtitle: sanitizeText(body.subtitle),
          author: sanitizeText(body.author),
          publisher: sanitizeText(body.publisher),
          subject: sanitizeText(body.subject),
          class_levels: body.class_levels ?? [],
          exam_types: body.exam_types ?? [],
          description: sanitizeText(body.description),
          page_count: sanitizeInt(body.page_count),
          cover_image_url: sanitizeText(body.cover_image_url),
          is_catalog_active: false, // Süper Admin onaylayana kadar kapalı
          metadata: withInferredSeriesMetadata({
            title: sanitizeText(body.title),
            isbn: sanitizeText(body.isbn),
            slug,
            class_levels: body.class_levels,
            metadata: body.metadata,
          }),
          created_by: actor.sub,
          updated_by: actor.sub,
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ ok: true, book: data });
    }

    if (op === 'books.update') {
      const { book_id, ...fields } = body;
      if (!book_id) return err(res, 400, 'book_id gerekli');
      // Satıcı yalnızca kendisinin oluşturduğu veya teklif verdiği kitabı güncelleyebilir
      const { data: checkOffer } = await supabaseAdmin
        .from('commerce_vendor_offers')
        .select('id')
        .eq('vendor_id', vendorId)
        .eq('book_id', book_id)
        .maybeSingle();
      const { data: checkBook } = await supabaseAdmin
        .from('commerce_books')
        .select('created_by')
        .eq('id', book_id)
        .maybeSingle();
      if (!isSuperAdmin && !checkOffer && checkBook?.created_by !== actor.sub) {
        return err(res, 403, 'Bu kitabı düzenleme yetkiniz yok');
      }
      const patch = {};
      ['subtitle', 'description', 'cover_image_url'].forEach((f) => {
        if (fields[f] !== undefined) patch[f] = sanitizeText(fields[f]);
      });
      patch.updated_by = actor.sub;
      patch.updated_at = new Date().toISOString();
      const { data, error } = await supabaseAdmin.from('commerce_books').update(patch).eq('id', book_id).select().single();
      if (error) throw error;
      return res.status(200).json({ ok: true, book: data });
    }

    // ── Teklifler ─────────────────────────────
    if (op === 'offers.list') {
      const { data, error } = await supabaseAdmin
        .from('commerce_vendor_offers')
        .select('*, commerce_books(id, title, isbn, cover_image_url, description)')
        .eq('vendor_id', vendorId)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ ok: true, offers: data });
    }

    if (op === 'offers.get') {
      const { id } = body;
      if (!id) return err(res, 400, 'id gerekli');
      const { data, error } = await supabaseAdmin
        .from('commerce_vendor_offers')
        .select('*, commerce_books(*)')
        .eq('id', id)
        .eq('vendor_id', vendorId)
        .single();
      if (error) throw error;
      return res.status(200).json({ ok: true, offer: data });
    }

    if (op === 'offers.create') {
      const { book_id } = body;
      if (!book_id || body.price_kurus === undefined) return err(res, 400, 'book_id ve price_kurus gerekli');
      const { data, error } = await supabaseAdmin
        .from('commerce_vendor_offers')
        .insert({
          vendor_id: vendorId,
          book_id,
          price_kurus: parseInt(body.price_kurus, 10),
          compare_at_price_kurus: sanitizeInt(body.compare_at_price_kurus),
          stock_quantity: sanitizeInt(body.stock_quantity) ?? 0,
          low_stock_threshold: sanitizeInt(body.low_stock_threshold) ?? 5,
          shipping_days: sanitizeInt(body.shipping_days) ?? 3,
          status: 'draft',
          created_by: actor.sub,
          updated_by: actor.sub,
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ ok: true, offer: data });
    }

    if (op === 'offers.update') {
      const { id, ...fields } = body;
      if (!id) return err(res, 400, 'id gerekli');
      // Yalnızca draft/correction_requested/rejected durumunda güncellenebilir
      const { data: current } = await supabaseAdmin
        .from('commerce_vendor_offers')
        .select('status, vendor_id')
        .eq('id', id)
        .single();
      if (!current || current.vendor_id !== vendorId) return err(res, 403, 'Bu teklif size ait değil');
      const EDITABLE = ['draft', 'correction_requested', 'rejected'];
      if (!EDITABLE.includes(current.status) && !isSuperAdmin) {
        return err(res, 400, `Onaylanmış/incelemeye alınmış teklif düzenlenemez (${current.status})`);
      }
      const patch = {};
      if (fields.price_kurus !== undefined) patch.price_kurus = parseInt(fields.price_kurus, 10);
      if (fields.compare_at_price_kurus !== undefined) patch.compare_at_price_kurus = sanitizeInt(fields.compare_at_price_kurus);
      if (fields.stock_quantity !== undefined) patch.stock_quantity = sanitizeInt(fields.stock_quantity);
      if (fields.low_stock_threshold !== undefined) patch.low_stock_threshold = sanitizeInt(fields.low_stock_threshold);
      if (fields.shipping_days !== undefined) patch.shipping_days = sanitizeInt(fields.shipping_days);
      // Satıcı onaylı teklifte fiyat değiştirirse yeniden onaya düşer; süper admin doğrudan yazar
      if (current.status === 'approved' && fields.price_kurus !== undefined && !isSuperAdmin) {
        patch.pending_snapshot = { price_kurus: patch.price_kurus, updated_at: new Date().toISOString() };
        patch.status = 'pending_approval';
      }
      patch.updated_by = actor.sub;
      patch.updated_at = new Date().toISOString();
      const { data, error } = await supabaseAdmin.from('commerce_vendor_offers').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json({ ok: true, offer: data });
    }

    if (op === 'offers.submit') {
      // Taslağı onaya gönder
      const { id } = body;
      if (!id) return err(res, 400, 'id gerekli');
      const { data: current } = await supabaseAdmin
        .from('commerce_vendor_offers')
        .select('status, vendor_id, price_kurus, stock_quantity')
        .eq('id', id)
        .single();
      if (!current || current.vendor_id !== vendorId) return err(res, 403, 'Bu teklif size ait değil');
      if (!['draft', 'correction_requested', 'rejected'].includes(current.status)) {
        return err(res, 400, 'Yalnızca taslak/reddedilmiş teklifler gönderilebilir');
      }
      if (current.price_kurus <= 0) return err(res, 400, 'Fiyat 0 olamaz');
      const { data, error } = await supabaseAdmin
        .from('commerce_vendor_offers')
        .update({ status: 'pending_approval', submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ ok: true, offer: data });
    }

    // ── Siparişler (yalnızca ödemesi alınan) ──
    if (op === 'orders.list') {
      const paidIds = await paidOrderIdSetForVendor(vendorId);
      if (!paidIds.size) {
        return res.status(200).json({
          ok: true,
          vendor_orders: [],
          paid_only: VENDOR_ORDERS_PAID_ONLY,
          deployMarker: VENDOR_PAID_MARKER,
        });
      }
      let q = supabaseAdmin
        .from('commerce_vendor_orders')
        .select(`
          *,
          commerce_orders(
            id, order_number, student_id, customer_name, customer_email, customer_phone, notes, created_at, status, payment_status,
            commerce_order_addresses(*)
          ),
          commerce_order_items(id, title_snapshot, isbn_snapshot, quantity, unit_price_kurus, package_id, book_id),
          commerce_shipments(*)
        `)
        .eq('vendor_id', vendorId)
        .in('order_id', [...paidIds])
        .order('created_at', { ascending: false });
      if (body.status === 'yeni') q = q.in('status', ['pending', 'confirmed']);
      else if (body.status === 'eski') q = q.in('status', ['preparing', 'shipped', 'delivered']);
      else if (body.status) q = q.eq('status', body.status);
      const limit = Math.min(parseInt(body.limit ?? 200, 10), 200);
      q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      const vendor_orders = await decorateVendorOrdersWithPackageContents(data || []);
      return res.status(200).json({
        ok: true,
        vendor_orders,
        paid_only: VENDOR_ORDERS_PAID_ONLY,
        deployMarker: VENDOR_PAID_MARKER,
      });
    }

    if (op === 'orders.get') {
      const { id } = body;
      if (!id) return err(res, 400, 'id gerekli');
      const loaded = await loadOwnedPaidVendorOrder(
        id,
        vendorId,
        `
          *,
          commerce_orders(*, commerce_order_addresses(*)),
          commerce_order_items(*),
          commerce_shipments(*)
        `
      );
      if (loaded.error) return err(res, loaded.status, loaded.error);
      const [decorated] = await decorateVendorOrdersWithPackageContents([loaded.vo]);
      return res.status(200).json({ ok: true, vendor_order: decorated, paid_only: VENDOR_ORDERS_PAID_ONLY });
    }

    if (op === 'orders.accept') {
      const { id } = body;
      if (!id) return err(res, 400, 'id gerekli');
      const loaded = await loadOwnedPaidVendorOrder(id, vendorId, 'id, order_id, vendor_id, status');
      if (loaded.error) return err(res, loaded.status, loaded.error);
      const { data, error } = await supabaseAdmin
        .from('commerce_vendor_orders')
        .update({ status: 'confirmed', accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('vendor_id', vendorId)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ ok: true, vendor_order: data });
    }

    if (op === 'orders.preparing') {
      const { id } = body;
      if (!id) return err(res, 400, 'id gerekli');
      const loaded = await loadOwnedPaidVendorOrder(id, vendorId, 'id, order_id, vendor_id, status');
      if (loaded.error) return err(res, loaded.status, loaded.error);
      const { data, error } = await supabaseAdmin
        .from('commerce_vendor_orders')
        .update({ status: 'preparing', prepared_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('vendor_id', vendorId)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ ok: true, vendor_order: data });
    }

    if (op === 'orders.ship') {
      const { id, carrier, tracking_number, tracking_url, invoice_number } = body;
      if (!id) return err(res, 400, 'id gerekli');
      const loaded = await loadOwnedPaidVendorOrder(id, vendorId, 'id, order_id, vendor_id');
      if (loaded.error) return err(res, loaded.status, loaded.error);
      const now = new Date().toISOString();
      const [shipResult] = await Promise.all([
        supabaseAdmin.from('commerce_shipments').insert({
          vendor_order_id: id,
          carrier: sanitizeText(carrier),
          tracking_number: sanitizeText(tracking_number),
          tracking_url: sanitizeText(tracking_url),
          invoice_number: sanitizeText(invoice_number),
          status: 'shipped',
          shipped_at: now,
        }).select().single(),
        supabaseAdmin.from('commerce_vendor_orders').update({ status: 'shipped', shipped_at: now, updated_at: now }).eq('id', id),
      ]);
      if (shipResult.error) throw shipResult.error;
      return res.status(200).json({ ok: true, shipment: shipResult.data });
    }

    if (op === 'orders.update') {
      const { id } = body;
      if (!id) return err(res, 400, 'id gerekli');
      const loaded = await loadOwnedPaidVendorOrder(id, vendorId, 'id, order_id, vendor_id, status');
      if (loaded.error) return err(res, loaded.status, loaded.error);
      const vo = loaded.vo;
      let parent;
      let vendor;
      try {
        ({ parent, vendor } = buildVendorOwnedOrderPatch(body));
      } catch (e) {
        return err(res, 400, e.message);
      }
      const now = new Date().toISOString();
      if (Object.keys(parent).length) {
        const { error: pErr } = await supabaseAdmin
          .from('commerce_orders')
          .update({ ...parent, updated_at: now })
          .eq('id', vo.order_id);
        if (pErr) throw pErr;
      }
      if (Object.keys(vendor).length) {
        const voPatch = {
          ...vendor,
          ...(vendor.status ? vendorStatusTimestamps(vendor.status, now) : {}),
          updated_at: now,
        };
        const { error: vErr } = await supabaseAdmin
          .from('commerce_vendor_orders')
          .update(voPatch)
          .eq('id', id)
          .eq('vendor_id', vendorId);
        if (vErr) throw vErr;
      }
      const { data: refreshed, error: gErr } = await supabaseAdmin
        .from('commerce_vendor_orders')
        .select(`
          *,
          commerce_orders(id, order_number, customer_name, customer_email, customer_phone, notes, created_at, status, payment_status),
          commerce_order_items(id, title_snapshot, quantity, unit_price_kurus)
        `)
        .eq('id', id)
        .single();
      if (gErr) throw gErr;
      return res.status(200).json({ ok: true, vendor_order: refreshed });
    }

    if (op === 'orders.delete') {
      const { id } = body;
      if (!id) return err(res, 400, 'id gerekli');
      const loaded = await loadOwnedPaidVendorOrder(id, vendorId, 'id, order_id, vendor_id');
      if (loaded.error) return err(res, loaded.status, loaded.error);
      const vo = loaded.vo;
      const orderId = vo.order_id;
      const { count } = await supabaseAdmin
        .from('commerce_vendor_orders')
        .select('id', { count: 'exact', head: true })
        .eq('order_id', orderId);
      await supabaseAdmin.from('commerce_shipments').delete().eq('vendor_order_id', vo.id);
      await supabaseAdmin.from('commerce_order_items').delete().eq('vendor_order_id', vo.id);
      await supabaseAdmin.from('commerce_vendor_orders').delete().eq('id', vo.id).eq('vendor_id', vendorId);
      if ((count || 0) <= 1) {
        await supabaseAdmin.from('commerce_order_items').delete().eq('order_id', orderId);
        await supabaseAdmin.from('commerce_order_addresses').delete().eq('order_id', orderId);
        await supabaseAdmin.from('commerce_payments').delete().eq('order_id', orderId);
        const { error: delErr } = await supabaseAdmin.from('commerce_orders').delete().eq('id', orderId);
        if (delErr) throw delErr;
      }
      return res.status(200).json({ ok: true, deleted: true, order_id: orderId });
    }

    // ── Hakedişler (salt okuma) ───────────────
    if (op === 'payouts.list') {
      const { data, error } = await supabaseAdmin
        .from('commerce_vendor_payouts')
        .select('*')
        .eq('vendor_id', vendorId)
        .order('period_end', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ ok: true, payouts: data });
    }

    // ── Genel bakış istatistikleri ────────────
    if (op === 'stats.overview') {
      const [ordersRes, offersRes, pendingPayoutRes] = await Promise.all([
        (async () => {
          const paidIds = await paidOrderIdSetForVendor(vendorId);
          if (!paidIds.size) return { data: [], error: null };
          return supabaseAdmin
            .from('commerce_vendor_orders')
            .select('status, vendor_net_kurus')
            .eq('vendor_id', vendorId)
            .in('order_id', [...paidIds]);
        })(),
        supabaseAdmin
          .from('commerce_vendor_offers')
          .select('status, stock_quantity, low_stock_threshold')
          .eq('vendor_id', vendorId)
          .is('deleted_at', null),
        supabaseAdmin
          .from('commerce_vendor_payouts')
          .select('net_payout_kurus, status')
          .eq('vendor_id', vendorId)
          .eq('status', 'pending'),
      ]);
      const orders = ordersRes.data ?? [];
      const offers = offersRes.data ?? [];
      const pendingPayouts = pendingPayoutRes.data ?? [];
      return res.status(200).json({
        ok: true,
        paid_only: VENDOR_ORDERS_PAID_ONLY,
        deployMarker: VENDOR_PAID_MARKER,
        stats: {
          total_orders: orders.length,
          pending_orders: orders.filter((o) => o.status === 'pending').length,
          active_offers: offers.filter((o) => o.status === 'approved').length,
          pending_approval: offers.filter((o) => o.status === 'pending_approval').length,
          low_stock: offers.filter((o) => o.stock_quantity <= o.low_stock_threshold).length,
          total_net_kurus: orders.filter((o) => o.status === 'delivered').reduce((s, o) => s + o.vendor_net_kurus, 0),
          pending_payout_kurus: pendingPayouts.reduce((s, p) => s + p.net_payout_kurus, 0),
        },
      });
    }

    return err(res, 400, `Bilinmeyen operasyon: ${op}`);
  } catch (e) {
    console.error('[commerce-vendor]', e?.message || e);
    return err(res, 500, e?.message || 'sunucu_hatası');
  }
}
