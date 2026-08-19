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

// ─────────────────────────────────────────────
// Katalog
// ─────────────────────────────────────────────
async function handleCatalog(op, body, actor) {
  if (op === 'catalog.settings') {
    const { data } = await supabaseAdmin
      .from('commerce_settings')
      .select('free_shipping_threshold_kurus, default_shipping_kurus, commerce_mode, student_store_enabled')
      .is('institution_id', null)
      .maybeSingle();
    return { ok: true, settings: data };
  }

  if (op === 'catalog.list') {
    const limit = Math.min(sanitizeInt(body.limit, 24), 100);
    const offset = sanitizeInt(body.offset, 0);

    let q = supabaseAdmin
      .from('commerce_vendor_offers')
      .select(`
        id, price_kurus, compare_at_price_kurus, stock_quantity, shipping_days,
        is_featured, is_bestseller, is_new_arrival, teacher_recommended, required_for_classes,
        commerce_books!inner(id, slug, title, author, publisher, subject, class_levels, exam_types, cover_image_url, page_count),
        commerce_vendors!inner(id, name)
      `)
      .eq('status', 'approved')
      .is('deleted_at', null)
      .gt('stock_quantity', 0);

    // Filtreler
    if (body.subject) q = q.eq('commerce_books.subject', body.subject);
    if (body.publisher) q = q.eq('commerce_books.publisher', body.publisher);
    if (body.teacher_recommended) q = q.eq('teacher_recommended', true);
    if (body.is_featured) q = q.eq('is_featured', true);
    if (body.is_bestseller) q = q.eq('is_bestseller', true);
    if (body.is_new_arrival) q = q.eq('is_new_arrival', true);
    if (body.price_min) q = q.gte('price_kurus', sanitizeInt(body.price_min));
    if (body.price_max) q = q.lte('price_kurus', sanitizeInt(body.price_max));
    if (body.class_level) {
      q = q.contains('commerce_books.class_levels', JSON.stringify([body.class_level]));
    }
    if (body.search) {
      q = q.or(`commerce_books.title.ilike.%${body.search}%,commerce_books.author.ilike.%${body.search}%`);
    }

    // Sıralama
    const sort = body.sort ?? 'newest';
    if (sort === 'price_asc') q = q.order('price_kurus', { ascending: true });
    else if (sort === 'price_desc') q = q.order('price_kurus', { ascending: false });
    else q = q.order('created_at', { ascending: false });

    q = q.range(offset, offset + limit - 1);
    const { data, error, count } = await q;
    if (error) throw error;
    return { ok: true, offers: data, total: count };
  }

  if (op === 'catalog.get') {
    const { id, slug } = body;
    if (!id && !slug) throw new Error('id veya slug gerekli');
    let q = supabaseAdmin
      .from('commerce_books')
      .select(`
        *,
        commerce_vendor_offers(
          id, price_kurus, compare_at_price_kurus, stock_quantity, shipping_days,
          is_featured, teacher_recommended, status,
          commerce_vendors(id, name)
        )
      `)
      .is('deleted_at', null)
      .eq('is_catalog_active', true);
    if (slug) q = q.eq('slug', slug); else q = q.eq('id', id);
    const { data, error } = await q.single();
    if (error) throw error;
    // Yalnızca onaylı teklifleri filtrele
    const filteredOffers = (data.commerce_vendor_offers ?? []).filter(
      (o) => o.status === 'approved' && o.stock_quantity > 0
    );
    return { ok: true, book: { ...data, commerce_vendor_offers: filteredOffers } };
  }

  if (op === 'catalog.packages') {
    const { data, error } = await supabaseAdmin
      .from('commerce_book_packages')
      .select(`
        id, name, slug, description, class_level, program,
        price_kurus, compare_at_price_kurus, cover_image_url, sort_order,
        commerce_book_package_items(
          id, quantity, is_required, sort_order,
          commerce_books(id, title, cover_image_url, author),
          commerce_vendor_offers(id, price_kurus, stock_quantity, status)
        )
      `)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    if (body.class_level) {
      const filtered = (data ?? []).filter((p) => !p.class_level || p.class_level === body.class_level);
      return { ok: true, packages: filtered };
    }
    return { ok: true, packages: data };
  }

  if (op === 'catalog.assigned') {
    if (!actor?.sub || actor.sub === 'anonymous') throw new Error('Giriş gerekli');
    const studentId = actor.student_id ?? body.student_id;
    if (!studentId) throw new Error('student_id gerekli');
    const { data, error } = await supabaseAdmin
      .from('commerce_student_book_assignments')
      .select(`
        id, assignment_type, source, status, due_date, notes,
        commerce_books(id, slug, title, author, cover_image_url, publisher),
        commerce_vendor_offers(id, price_kurus, stock_quantity, status)
      `)
      .eq('student_id', studentId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return { ok: true, assignments: data };
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
  const { data, error } = await supabaseAdmin
    .from('commerce_cart_items')
    .select(`
      id, quantity, price_kurus_snapshot, title_snapshot,
      vendor_offer_id, package_id,
      commerce_vendor_offers(
        id, price_kurus, stock_quantity, status,
        commerce_books(id, slug, title, cover_image_url, author),
        commerce_vendors(id, name)
      ),
      commerce_book_packages(id, name, slug, price_kurus, cover_image_url)
    `)
    .eq('cart_id', cartId);
  if (error) throw error;
  return data ?? [];
}

async function handleCart(op, body, actor) {
  if (!actor?.sub || actor.sub === 'anonymous') throw new Error('Sepet için giriş gerekli');
  const userId = actor.sub;

  if (op === 'cart.get') {
    const cartId = await getOrCreateCart(userId);
    const items = await enrichCart(cartId);
    // Stok/fiyat güncelliğini kontrol et
    const enriched = items.map((item) => {
      const offer = item.commerce_vendor_offers;
      const priceChanged = offer && offer.price_kurus !== item.price_kurus_snapshot;
      const outOfStock = offer && (offer.status !== 'approved' || offer.stock_quantity < item.quantity);
      return { ...item, price_changed: priceChanged, out_of_stock: outOfStock };
    });
    const subtotal = enriched.reduce((s, i) => s + (i.commerce_vendor_offers?.price_kurus ?? i.price_kurus_snapshot) * i.quantity, 0);
    return { ok: true, cart_id: cartId, items: enriched, subtotal_kurus: subtotal };
  }

  if (op === 'cart.add') {
    const { vendor_offer_id, package_id, quantity = 1 } = body;
    if (!vendor_offer_id && !package_id) throw new Error('vendor_offer_id veya package_id gerekli');
    const qty = Math.max(1, sanitizeInt(quantity, 1));
    const cartId = await getOrCreateCart(userId);

    let priceSnapshot = 0;
    let titleSnapshot = '';

    if (vendor_offer_id) {
      const { data: offer } = await supabaseAdmin
        .from('commerce_vendor_offers')
        .select('price_kurus, status, stock_quantity, commerce_books(title)')
        .eq('id', vendor_offer_id)
        .single();
      if (!offer || offer.status !== 'approved') throw new Error('Bu teklif artık mevcut değil');
      if (offer.stock_quantity < qty) throw new Error('Yeterli stok yok');
      priceSnapshot = offer.price_kurus;
      titleSnapshot = offer.commerce_books?.title ?? '';

      const { error } = await supabaseAdmin
        .from('commerce_cart_items')
        .upsert(
          { cart_id: cartId, vendor_offer_id, quantity: qty, price_kurus_snapshot: priceSnapshot, title_snapshot: titleSnapshot },
          { onConflict: 'cart_id,vendor_offer_id' }
        );
      if (error) throw error;
    }

    if (package_id) {
      const { data: pkg } = await supabaseAdmin
        .from('commerce_book_packages')
        .select('price_kurus, name, is_active')
        .eq('id', package_id)
        .single();
      if (!pkg || !pkg.is_active) throw new Error('Bu paket artık mevcut değil');
      priceSnapshot = pkg.price_kurus;
      titleSnapshot = pkg.name;
      const { error } = await supabaseAdmin
        .from('commerce_cart_items')
        .upsert(
          { cart_id: cartId, package_id, quantity: 1, price_kurus_snapshot: priceSnapshot, title_snapshot: titleSnapshot },
          { onConflict: 'cart_id,package_id' }
        );
      if (error) throw error;
    }

    // Sepet updated_at güncelle
    await supabaseAdmin.from('commerce_carts').update({ updated_at: new Date().toISOString() }).eq('id', cartId);
    const items = await enrichCart(cartId);
    return { ok: true, items };
  }

  if (op === 'cart.update') {
    const { item_id, quantity } = body;
    if (!item_id) throw new Error('item_id gerekli');
    const qty = Math.max(1, sanitizeInt(quantity, 1));
    // Sadece kendi sepet item'ı
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
    return { ok: true, coupon: { id: coupon.id, code: coupon.code, discount_type: coupon.discount_type, discount_value: coupon.discount_value, max_discount_kurus: coupon.max_discount_kurus, min_order_kurus: coupon.min_order_kurus } };
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
    // İdempotent upsert
    const { data: existing } = await supabaseAdmin
      .from('commerce_student_book_assignments')
      .select('id, status')
      .eq('student_id', studentId)
      .eq('book_id', book_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (existing) {
      // Zaten var — durumu owned'a güncelle
      if (existing.status !== 'purchased') {
        await supabaseAdmin
          .from('commerce_student_book_assignments')
          .update({ status: 'owned', updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      }
      return { ok: true, assignment_id: existing.id, already_existed: true };
    }
    // Kurumu bul
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
    const body = req.body ?? {};
    const op = String(body.op ?? '').trim();
    if (!op) return err(res, 400, 'op gerekli');

    // Catalog GET operasyonları public (actor olmayabilir)
    let actor = null;
    try { actor = requireAuth(req); } catch { /* public catalog */ }

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
    console.error('[commerce-store]', e?.message || e);
    return err(res, 500, e?.message || 'sunucu_hatası');
  }
}
