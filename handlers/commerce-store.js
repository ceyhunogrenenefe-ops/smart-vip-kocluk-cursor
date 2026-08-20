/**
 * /api/commerce-store — Öğrenci/veli kitap mağazası (public katalog + kişisel sepet/atamalar)
 *
 * Kimlik doğrulama: çoğu GET operasyonu için opsiyonel (public katalog),
 * sepet ve atamalar için requireAuth zorunlu.
 *
 * Operasyonlar:
 *  catalog.list          — onaylı teklifleri sayfa bazlı listele
 *  catalog.get           — kitap slug/id ile detay + teklifler
 *  catalog.packages      — aktif paketleri listele
 *  catalog.assigned      — öğrenciye atanmış kitaplar
 *  catalog.settings      — genel mağaza ayarları (kargo eşiği vs)
 *  cart.get              — mevcut sepeti getir
 *  cart.add              — sepete ürün ekle
 *  cart.update           — adet güncelle
 *  cart.remove           — sepetten çıkar
 *  cart.clear            — sepeti boşalt
 *  cart.apply_coupon     — kupon uygula
 *  assignment.own        — "Bu kitap bende var" (purchase yapmadan atama)
 */

import { requireAuth } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';

function err(res, status, message) {
  return res.status(status).json({ error: message });
}

function sanitizeInt(v, fallback = 0) {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseBody(req) {
  const raw = req.body;
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}

function bookMatchesSearch(book, search) {
  if (!search) return true;
  const q = String(search).trim().toLowerCase();
  if (!q) return true;
  const hay = [book.title, book.author, book.publisher].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

async function fetchBooksByIds(bookIds) {
  const ids = [...new Set((bookIds ?? []).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await supabaseAdmin
    .from('commerce_books')
    .select('id, slug, title, author, publisher, subject, class_levels, exam_types, cover_image_url, page_count, is_catalog_active')
    .in('id', ids)
    .is('deleted_at', null);
  if (error) throw error;
  return new Map((data ?? []).map((b) => [b.id, b]));
}

async function fetchVendorsByIds(vendorIds) {
  const ids = [...new Set((vendorIds ?? []).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await supabaseAdmin
    .from('commerce_vendors')
    .select('id, name')
    .in('id', ids)
    .is('deleted_at', null)
    .eq('is_active', true);
  if (error) throw error;
  return new Map((data ?? []).map((v) => [v.id, v]));
}

function mergeOfferRows(offers, bookMap, vendorMap) {
  return (offers ?? [])
    .map((offer) => {
      const commerce_books = bookMap.get(offer.book_id) ?? null;
      const commerce_vendors = vendorMap.get(offer.vendor_id) ?? null;
      if (!commerce_books || !commerce_vendors) return null;
      if (commerce_books.is_catalog_active === false) return null;
      const { book_id, vendor_id, ...rest } = offer;
      return { ...rest, commerce_books, commerce_vendors };
    })
    .filter(Boolean);
}

// ─────────────────────────────────────────────
// Katalog
// ─────────────────────────────────────────────
async function handleCatalog(op, body, actor) {
  if (op === 'catalog.settings') {
    const { data, error } = await supabaseAdmin
      .from('commerce_settings')
      .select('free_shipping_threshold_kurus, default_shipping_kurus, commerce_mode, student_store_enabled')
      .is('institution_id', null)
      .maybeSingle();
    if (error) throw error;
    return { ok: true, settings: data };
  }

  if (op === 'catalog.list') {
    const limit = Math.min(sanitizeInt(body.limit, 24), 100);
    const offset = sanitizeInt(body.offset, 0);
    const search = body.search ? String(body.search).trim() : '';

    let q = supabaseAdmin
      .from('commerce_vendor_offers')
      .select(`
        id, book_id, vendor_id, price_kurus, compare_at_price_kurus, stock_quantity, shipping_days,
        is_featured, is_bestseller, is_new_arrival, teacher_recommended, required_for_classes, created_at
      `, { count: 'exact' })
      .eq('status', 'approved')
      .is('deleted_at', null)
      .gt('stock_quantity', 0);

    if (body.teacher_recommended) q = q.eq('teacher_recommended', true);
    if (body.is_featured) q = q.eq('is_featured', true);
    if (body.is_bestseller) q = q.eq('is_bestseller', true);
    if (body.is_new_arrival) q = q.eq('is_new_arrival', true);
    if (body.price_min) q = q.gte('price_kurus', sanitizeInt(body.price_min));
    if (body.price_max) q = q.lte('price_kurus', sanitizeInt(body.price_max));

    const sort = body.sort ?? 'newest';
    if (sort === 'price_asc') q = q.order('price_kurus', { ascending: true });
    else if (sort === 'price_desc') q = q.order('price_kurus', { ascending: false });
    else q = q.order('created_at', { ascending: false });

    // Filtreler kitap tablosunda — önce geniş çek, sonra uygulama katmanında süz
    const fetchLimit = search || body.subject || body.publisher || body.class_level ? 500 : limit;
    const fetchOffset = search || body.subject || body.publisher || body.class_level ? 0 : offset;
    q = q.range(fetchOffset, fetchOffset + fetchLimit - 1);

    const { data: rawOffers, error, count } = await q;
    if (error) throw error;

    const bookMap = await fetchBooksByIds((rawOffers ?? []).map((o) => o.book_id));
    const vendorMap = await fetchVendorsByIds((rawOffers ?? []).map((o) => o.vendor_id));

    let offers = mergeOfferRows(rawOffers, bookMap, vendorMap);

    if (body.subject) {
      offers = offers.filter((o) => o.commerce_books.subject === body.subject);
    }
    if (body.publisher) {
      offers = offers.filter((o) => o.commerce_books.publisher === body.publisher);
    }
    if (body.class_level) {
      offers = offers.filter((o) => {
        const levels = o.commerce_books.class_levels ?? [];
        return Array.isArray(levels) && levels.includes(String(body.class_level));
      });
    }
    if (search) {
      offers = offers.filter((o) => bookMatchesSearch(o.commerce_books, search));
    }

    const total = search || body.subject || body.publisher || body.class_level
      ? offers.length
      : (count ?? offers.length);

    if (search || body.subject || body.publisher || body.class_level) {
      offers = offers.slice(offset, offset + limit);
    }

    return { ok: true, offers, total };
  }

  if (op === 'catalog.get') {
    const { id, slug } = body;
    if (!id && !slug) throw new Error('id veya slug gerekli');

    let bookQuery = supabaseAdmin
      .from('commerce_books')
      .select('*')
      .is('deleted_at', null)
      .eq('is_catalog_active', true);
    if (slug) bookQuery = bookQuery.eq('slug', slug);
    else bookQuery = bookQuery.eq('id', id);

    const { data: book, error: bookErr } = await bookQuery.single();
    if (bookErr) throw bookErr;

    const { data: rawOffers, error: offerErr } = await supabaseAdmin
      .from('commerce_vendor_offers')
      .select(`
        id, price_kurus, compare_at_price_kurus, stock_quantity, shipping_days,
        is_featured, teacher_recommended, status, vendor_id
      `)
      .eq('book_id', book.id)
      .eq('status', 'approved')
      .is('deleted_at', null)
      .gt('stock_quantity', 0);
    if (offerErr) throw offerErr;

    const vendorMap = await fetchVendorsByIds((rawOffers ?? []).map((o) => o.vendor_id));
    const commerce_vendor_offers = (rawOffers ?? [])
      .map((o) => {
        const commerce_vendors = vendorMap.get(o.vendor_id);
        if (!commerce_vendors) return null;
        const { vendor_id, ...rest } = o;
        return { ...rest, commerce_vendors };
      })
      .filter(Boolean);

    return { ok: true, book: { ...book, commerce_vendor_offers } };
  }

  if (op === 'catalog.packages') {
    const { data: packages, error } = await supabaseAdmin
      .from('commerce_book_packages')
      .select(`
        id, name, slug, description, class_level, program,
        price_kurus, compare_at_price_kurus, cover_image_url, sort_order
      `)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true });
    if (error) throw error;

    const pkgList = packages ?? [];
    if (!pkgList.length) return { ok: true, packages: [] };

    const pkgIds = pkgList.map((p) => p.id);
    const { data: items, error: itemsErr } = await supabaseAdmin
      .from('commerce_book_package_items')
      .select('id, package_id, quantity, is_required, sort_order, book_id, vendor_offer_id')
      .in('package_id', pkgIds)
      .order('sort_order', { ascending: true });
    if (itemsErr) throw itemsErr;

    const bookMap = await fetchBooksByIds((items ?? []).map((i) => i.book_id));
    const offerIds = (items ?? []).map((i) => i.vendor_offer_id).filter(Boolean);
    let offerMap = new Map();
    if (offerIds.length) {
      const { data: offerRows, error: offerErr } = await supabaseAdmin
        .from('commerce_vendor_offers')
        .select('id, price_kurus, stock_quantity, status')
        .in('id', offerIds);
      if (offerErr) throw offerErr;
      offerMap = new Map((offerRows ?? []).map((o) => [o.id, o]));
    }

    const itemsByPackage = new Map();
    for (const item of items ?? []) {
      const list = itemsByPackage.get(item.package_id) ?? [];
      list.push({
        ...item,
        commerce_books: bookMap.get(item.book_id) ?? null,
        commerce_vendor_offers: item.vendor_offer_id ? (offerMap.get(item.vendor_offer_id) ?? null) : null,
      });
      itemsByPackage.set(item.package_id, list);
    }

    let result = pkgList.map((pkg) => ({
      ...pkg,
      commerce_book_package_items: itemsByPackage.get(pkg.id) ?? [],
    }));

    if (body.class_level) {
      result = result.filter((p) => !p.class_level || p.class_level === body.class_level);
    }

    return { ok: true, packages: result };
  }

  if (op === 'catalog.assigned') {
    if (!actor?.sub || actor.sub === 'anonymous') throw new Error('Giriş gerekli');
    const studentId = actor.student_id ?? body.student_id;
    if (!studentId) throw new Error('student_id gerekli');

    const { data: rows, error } = await supabaseAdmin
      .from('commerce_student_book_assignments')
      .select('id, assignment_type, source, status, due_date, notes, book_id, vendor_offer_id, created_at')
      .eq('student_id', studentId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const bookMap = await fetchBooksByIds((rows ?? []).map((r) => r.book_id));
    const offerIds = (rows ?? []).map((r) => r.vendor_offer_id).filter(Boolean);
    let offerMap = new Map();
    if (offerIds.length) {
      const { data: offerRows, error: offerErr } = await supabaseAdmin
        .from('commerce_vendor_offers')
        .select('id, price_kurus, stock_quantity, status')
        .in('id', offerIds);
      if (offerErr) throw offerErr;
      offerMap = new Map((offerRows ?? []).map((o) => [o.id, o]));
    }

    const assignments = (rows ?? []).map((row) => {
      const { book_id, vendor_offer_id, ...rest } = row;
      return {
        ...rest,
        commerce_books: bookMap.get(book_id) ?? null,
        commerce_vendor_offers: vendor_offer_id ? (offerMap.get(vendor_offer_id) ?? null) : null,
      };
    });

    return { ok: true, assignments };
  }

  throw new Error(`Bilinmeyen operasyon: ${op}`);
}

// ─────────────────────────────────────────────
// Sepet
// ─────────────────────────────────────────────
async function getOrCreateCart(userId) {
  const { data: existing } = await supabaseAdmin
    .from('commerce_carts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await supabaseAdmin
    .from('commerce_carts')
    .insert({ user_id: userId })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function enrichCart(cartId) {
  const { data: rows, error } = await supabaseAdmin
    .from('commerce_cart_items')
    .select('id, quantity, price_kurus_snapshot, title_snapshot, vendor_offer_id, package_id')
    .eq('cart_id', cartId);
  if (error) throw error;
  if (!rows?.length) return [];

  const offerIds = rows.map((r) => r.vendor_offer_id).filter(Boolean);
  const packageIds = rows.map((r) => r.package_id).filter(Boolean);

  let offerMap = new Map();
  if (offerIds.length) {
    const { data: offers, error: offerErr } = await supabaseAdmin
      .from('commerce_vendor_offers')
      .select('id, price_kurus, stock_quantity, status, book_id, vendor_id')
      .in('id', offerIds);
    if (offerErr) throw offerErr;

    const bookMap = await fetchBooksByIds((offers ?? []).map((o) => o.book_id));
    const vendorMap = await fetchVendorsByIds((offers ?? []).map((o) => o.vendor_id));

    for (const offer of offers ?? []) {
      const commerce_books = bookMap.get(offer.book_id) ?? null;
      const commerce_vendors = vendorMap.get(offer.vendor_id) ?? null;
      if (!commerce_books || !commerce_vendors) continue;
      const { book_id, vendor_id, ...rest } = offer;
      offerMap.set(offer.id, { ...rest, commerce_books, commerce_vendors });
    }
  }

  let packageMap = new Map();
  if (packageIds.length) {
    const { data: pkgs, error: pkgErr } = await supabaseAdmin
      .from('commerce_book_packages')
      .select('id, name, slug, price_kurus, cover_image_url')
      .in('id', packageIds);
    if (pkgErr) throw pkgErr;
    packageMap = new Map((pkgs ?? []).map((p) => [p.id, p]));
  }

  return rows.map((row) => ({
    ...row,
    commerce_vendor_offers: row.vendor_offer_id ? (offerMap.get(row.vendor_offer_id) ?? null) : null,
    commerce_book_packages: row.package_id ? (packageMap.get(row.package_id) ?? null) : null,
  }));
}

async function handleCart(op, body, actor) {
  if (!actor?.sub || actor.sub === 'anonymous') throw new Error('Sepet için giriş gerekli');
  const userId = actor.sub;

  if (op === 'cart.get') {
    const cartId = await getOrCreateCart(userId);
    const items = await enrichCart(cartId);
    const enriched = items.map((item) => {
      const offer = item.commerce_vendor_offers;
      const priceChanged = offer && offer.price_kurus !== item.price_kurus_snapshot;
      const outOfStock = offer && (offer.status !== 'approved' || offer.stock_quantity < item.quantity);
      return { ...item, price_changed: priceChanged, out_of_stock: outOfStock };
    });
    const subtotal = enriched.reduce(
      (s, i) => s + (i.commerce_vendor_offers?.price_kurus ?? i.price_kurus_snapshot) * i.quantity,
      0
    );
    return { ok: true, cart_id: cartId, items: enriched, subtotal_kurus: subtotal };
  }

  if (op === 'cart.add') {
    const { vendor_offer_id, package_id, quantity = 1 } = body;
    if (!vendor_offer_id && !package_id) throw new Error('vendor_offer_id veya package_id gerekli');
    const qty = Math.max(1, sanitizeInt(quantity, 1));
    const cartId = await getOrCreateCart(userId);

    if (vendor_offer_id) {
      const { data: offer, error: offerErr } = await supabaseAdmin
        .from('commerce_vendor_offers')
        .select('price_kurus, status, stock_quantity, book_id')
        .eq('id', vendor_offer_id)
        .single();
      if (offerErr) throw offerErr;
      if (!offer || offer.status !== 'approved') throw new Error('Bu teklif artık mevcut değil');
      if (offer.stock_quantity < qty) throw new Error('Yeterli stok yok');

      const { data: book, error: bookErr } = await supabaseAdmin
        .from('commerce_books')
        .select('title, is_catalog_active')
        .eq('id', offer.book_id)
        .is('deleted_at', null)
        .maybeSingle();
      if (bookErr) throw bookErr;
      if (!book?.is_catalog_active) throw new Error('Bu kitap şu anda satışta değil');

      const priceSnapshot = offer.price_kurus;
      const titleSnapshot = book?.title ?? '';

      const { error } = await supabaseAdmin
        .from('commerce_cart_items')
        .upsert(
          {
            cart_id: cartId,
            vendor_offer_id,
            quantity: qty,
            price_kurus_snapshot: priceSnapshot,
            title_snapshot: titleSnapshot,
          },
          { onConflict: 'cart_id,vendor_offer_id' }
        );
      if (error) throw error;
    }

    if (package_id) {
      const { data: pkg, error: pkgErr } = await supabaseAdmin
        .from('commerce_book_packages')
        .select('price_kurus, name, is_active')
        .eq('id', package_id)
        .single();
      if (pkgErr) throw pkgErr;
      if (!pkg || !pkg.is_active) throw new Error('Bu paket artık mevcut değil');

      const { error } = await supabaseAdmin
        .from('commerce_cart_items')
        .upsert(
          {
            cart_id: cartId,
            package_id,
            quantity: 1,
            price_kurus_snapshot: pkg.price_kurus,
            title_snapshot: pkg.name,
          },
          { onConflict: 'cart_id,package_id' }
        );
      if (error) throw error;
    }

    await supabaseAdmin.from('commerce_carts').update({ updated_at: new Date().toISOString() }).eq('id', cartId);
    const items = await enrichCart(cartId);
    return { ok: true, items };
  }

  if (op === 'cart.update') {
    const { item_id, quantity } = body;
    if (!item_id) throw new Error('item_id gerekli');
    const qty = Math.max(1, sanitizeInt(quantity, 1));
    const cartId = await getOrCreateCart(userId);
    const { error } = await supabaseAdmin
      .from('commerce_cart_items')
      .update({ quantity: qty, updated_at: new Date().toISOString() })
      .eq('id', item_id)
      .eq('cart_id', cartId);
    if (error) throw error;
    const items = await enrichCart(cartId);
    return { ok: true, items };
  }

  if (op === 'cart.remove') {
    const { item_id } = body;
    if (!item_id) throw new Error('item_id gerekli');
    const cartId = await getOrCreateCart(userId);
    const { error } = await supabaseAdmin
      .from('commerce_cart_items')
      .delete()
      .eq('id', item_id)
      .eq('cart_id', cartId);
    if (error) throw error;
    const items = await enrichCart(cartId);
    return { ok: true, items };
  }

  if (op === 'cart.clear') {
    const cartId = await getOrCreateCart(userId);
    await supabaseAdmin.from('commerce_cart_items').delete().eq('cart_id', cartId);
    return { ok: true, items: [] };
  }

  if (op === 'cart.apply_coupon') {
    const { code } = body;
    if (!code) throw new Error('Kupon kodu gerekli');
    const now = new Date().toISOString();
    const { data: coupon } = await supabaseAdmin
      .from('commerce_coupons')
      .select('*')
      .eq('code', String(code).toUpperCase().trim())
      .eq('is_active', true)
      .is('deleted_at', null)
      .maybeSingle();
    if (!coupon) return { ok: false, error: 'Kupon bulunamadı veya geçersiz' };
    if (coupon.ends_at && coupon.ends_at < now) return { ok: false, error: 'Kuponun süresi dolmuş' };
    if (coupon.starts_at && coupon.starts_at > now) return { ok: false, error: 'Kupon henüz aktif değil' };
    if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) return { ok: false, error: 'Kupon kullanım limiti dolmuş' };
    return {
      ok: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
        max_discount_kurus: coupon.max_discount_kurus,
        min_order_kurus: coupon.min_order_kurus,
      },
    };
  }

  throw new Error(`Bilinmeyen operasyon: ${op}`);
}

// ─────────────────────────────────────────────
// "Bu kitap bende var" — satın almadan atama
// ─────────────────────────────────────────────
async function handleAssignment(op, body, actor) {
  if (op === 'assignment.own') {
    if (!actor?.sub || actor.sub === 'anonymous') throw new Error('Giriş gerekli');
    const { book_id, vendor_offer_id } = body;
    if (!book_id) throw new Error('book_id gerekli');
    const studentId = actor.student_id ?? body.student_id;
    if (!studentId) throw new Error('student_id gerekli');

    const { data: existing } = await supabaseAdmin
      .from('commerce_student_book_assignments')
      .select('id, status')
      .eq('student_id', studentId)
      .eq('book_id', book_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (existing) {
      if (existing.status !== 'purchased') {
        await supabaseAdmin
          .from('commerce_student_book_assignments')
          .update({ status: 'owned', updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      }
      return { ok: true, assignment_id: existing.id, already_existed: true };
    }

    const { data: student } = await supabaseAdmin
      .from('students')
      .select('institution_id')
      .eq('id', studentId)
      .maybeSingle();
    const { data, error } = await supabaseAdmin
      .from('commerce_student_book_assignments')
      .insert({
        institution_id: student?.institution_id ?? '',
        student_id: studentId,
        book_id,
        vendor_offer_id: vendor_offer_id ?? null,
        assignment_type: 'optional',
        source: 'parent',
        status: 'owned',
        assigned_by: actor.sub,
      })
      .select('id')
      .single();
    if (error) throw error;
    return { ok: true, assignment_id: data.id };
  }
  throw new Error(`Bilinmeyen operasyon: ${op}`);
}

// ─────────────────────────────────────────────
// Ana handler
// ─────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 405, 'Method Not Allowed');
  try {
    const body = parseBody(req);
    const op = String(body.op ?? '').trim();
    if (!op) return err(res, 400, 'op gerekli');

    let actor = null;
    try {
      actor = requireAuth(req);
    } catch {
      /* public catalog */
    }

    const prefix = op.split('.')[0];
    let result;
    if (prefix === 'catalog') {
      result = await handleCatalog(op, body, actor);
    } else if (prefix === 'cart') {
      result = await handleCart(op, body, actor);
    } else if (prefix === 'assignment') {
      result = await handleAssignment(op, body, actor);
    } else {
      return err(res, 400, `Bilinmeyen operasyon: ${op}`);
    }

    return res.status(200).json(result);
  } catch (e) {
    console.error('[commerce-store]', e?.message || e, e?.details || '');
    const msg = e?.message || 'sunucu_hatası';
    const status = msg.includes('giriş') || msg.includes('Giriş') ? 401 : 500;
    return err(res, status, msg);
  }
}
