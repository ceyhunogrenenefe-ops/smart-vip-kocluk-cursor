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
 *  catalog.collections   — 8. sınıf VIP / Paraf / Deneme grupları
 *  catalog.assigned      — öğrenciye atanmış kitaplar
 *  catalog.settings      — genel mağaza ayarları (kargo eşiği vs)
 *  cart.get              — mevcut sepeti getir
 *  cart.add              — sepete ürün ekle
 *  cart.update           — adet güncelle
 *  cart.remove           — sepetten çıkar
 *  cart.clear            — sepeti boşalt
 *  cart.apply_coupon     — kupon uygula
 *  cart.checkout_prepare — pending sipariş + handoff token
 *  checkout.resolve      — token ile sipariş özeti (site)
 *  checkout.update_customer — veli/adres (site, token)
 *  checkout.pay          — PayTR/Garanti başlat (odeme/kitap)
 *  order.paid            — ödeme callback webhook (site)
 *  assignment.own        — "Bu kitap bende var" (purchase yapmadan atama)
 */

import { requireAuth } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import {
  assertWebhookSecret,
  isCommercePaymentRef,
  orderIdFromPaymentRef,
  paymentRefFromOrderId,
  signCheckoutToken,
  verifyCheckoutToken,
} from '../api/_lib/commerce-checkout-token.js';
import {
  customerFieldsFromCheckoutBody,
  normalizeCommerceCheckoutOp,
  wantsCheckoutPayment,
} from '../api/_lib/commerce-checkout-op.js';
import { startCommerceProviderPayment } from '../api/_lib/commerce-checkout-pay.js';
import { COMMERCE_DEFAULT_SETTINGS } from '../api/_lib/commerce-constants.js';
import { listLgs8Collections } from '../api/_lib/commerce-lgs8-seed.js';
import { notifyVendorWhatsAppForPaidOrder } from '../api/_lib/commerce-vendor-order-notify.js';

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
        commerce_books!inner(id, slug, title, author, publisher, subject, class_levels, exam_types, cover_image_url, page_count, metadata),
        commerce_vendors!inner(id, name)
      `)
      .eq('status', 'approved')
      .is('deleted_at', null)
      .gt('stock_quantity', 0);

    // Filtreler
    if (body.subject) q = q.eq('commerce_books.subject', body.subject);
    if (body.publisher) q = q.eq('commerce_books.publisher', body.publisher);
    if (body.series) q = q.contains('commerce_books.metadata', { series: String(body.series) });
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

  if (op === 'catalog.collections') {
    const collections = await listLgs8Collections();
    return { ok: true, collections };
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

      // Partial unique index → PostgREST upsert/ON CONFLICT çalışmaz; select+update/insert
      const { data: existing } = await supabaseAdmin
        .from('commerce_cart_items')
        .select('id, quantity')
        .eq('cart_id', cartId)
        .eq('vendor_offer_id', vendor_offer_id)
        .maybeSingle();
      const nextQty = existing ? existing.quantity + qty : qty;
      if (offer.stock_quantity < nextQty) throw new Error('Yeterli stok yok');
      if (existing) {
        const { error } = await supabaseAdmin
          .from('commerce_cart_items')
          .update({
            quantity: nextQty,
            price_kurus_snapshot: priceSnapshot,
            title_snapshot: titleSnapshot,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabaseAdmin.from('commerce_cart_items').insert({
          cart_id: cartId,
          vendor_offer_id,
          quantity: nextQty,
          price_kurus_snapshot: priceSnapshot,
          title_snapshot: titleSnapshot,
        });
        if (error) throw error;
      }
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
      const { data: existing } = await supabaseAdmin
        .from('commerce_cart_items')
        .select('id, quantity')
        .eq('cart_id', cartId)
        .eq('package_id', package_id)
        .maybeSingle();
      if (existing) {
        const { error } = await supabaseAdmin
          .from('commerce_cart_items')
          .update({
            quantity: 1,
            price_kurus_snapshot: priceSnapshot,
            title_snapshot: titleSnapshot,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabaseAdmin.from('commerce_cart_items').insert({
          cart_id: cartId,
          package_id,
          quantity: 1,
          price_kurus_snapshot: priceSnapshot,
          title_snapshot: titleSnapshot,
        });
        if (error) throw error;
      }
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

  if (op === 'cart.checkout_prepare') {
    return prepareCheckout(body, actor);
  }

  throw new Error(`Bilinmeyen operasyon: ${op}`);
}

async function loadCommerceSettings() {
  const { data } = await supabaseAdmin
    .from('commerce_settings')
    .select('*')
    .is('institution_id', null)
    .maybeSingle();
  return { ...COMMERCE_DEFAULT_SETTINGS, ...(data || {}) };
}

async function nextOrderNumber(prefix) {
  const p = String(prefix || 'VIP-KTP').toUpperCase();
  const { data, error } = await supabaseAdmin.rpc('commerce_next_order_number', { p_prefix: p });
  if (!error && data) return String(data);
  // Fallback: sayaç RPC yoksa
  const year = new Date().getFullYear();
  const { count } = await supabaseAdmin
    .from('commerce_orders')
    .select('id', { count: 'exact', head: true })
    .like('order_number', `${p}-${year}-%`);
  const seq = String((count || 0) + 1).padStart(6, '0');
  return `${p}-${year}-${seq}`;
}

async function prepareCheckout(body, actor) {
  if (!actor?.sub || actor.sub === 'anonymous') throw new Error('Ödeme için giriş gerekli');
  const userId = actor.sub;
  const cartId = await getOrCreateCart(userId);
  const items = await enrichCart(cartId);
  if (!items.length) throw new Error('Sepet boş');

  const settings = await loadCommerceSettings();
  if (settings.student_store_enabled === false) throw new Error('Kitap mağazası şu an kapalı');

  const lines = [];
  for (const item of items) {
    if (item.vendor_offer_id) {
      const { data: offer, error } = await supabaseAdmin
        .from('commerce_vendor_offers')
        .select(`
          id, vendor_id, book_id, price_kurus, compare_at_price_kurus, stock_quantity, status,
          commerce_books(id, title, isbn),
          commerce_vendors(id, name, commission_rate)
        `)
        .eq('id', item.vendor_offer_id)
        .single();
      if (error || !offer || offer.status !== 'approved') {
        throw new Error(`"${item.title_snapshot || 'Ürün'}" artık satışta değil`);
      }
      if (offer.stock_quantity < item.quantity) {
        throw new Error(`"${offer.commerce_books?.title || item.title_snapshot}" için yeterli stok yok`);
      }
      lines.push({
        vendor_offer_id: offer.id,
        book_id: offer.book_id,
        package_id: null,
        vendor_id: offer.vendor_id,
        title_snapshot: offer.commerce_books?.title || item.title_snapshot || 'Kitap',
        isbn_snapshot: offer.commerce_books?.isbn || null,
        quantity: item.quantity,
        unit_price_kurus: offer.price_kurus,
        compare_at_price_kurus: offer.compare_at_price_kurus,
        line_total_kurus: offer.price_kurus * item.quantity,
        commission_rate: Number(offer.commerce_vendors?.commission_rate ?? settings.default_commission_rate),
      });
      continue;
    }

    if (item.package_id) {
      const { data: pkg, error } = await supabaseAdmin
        .from('commerce_book_packages')
        .select(`
          id, name, price_kurus, is_active,
          commerce_book_package_items(
            quantity, commerce_books(id, title, isbn),
            commerce_vendor_offers(id, vendor_id, price_kurus, stock_quantity, status, commerce_vendors(commission_rate))
          )
        `)
        .eq('id', item.package_id)
        .single();
      if (error || !pkg || !pkg.is_active) throw new Error(`"${item.title_snapshot || 'Paket'}" artık mevcut değil`);
      const pkgItems = pkg.commerce_book_package_items || [];
      const first = pkgItems.find((pi) => pi.commerce_vendor_offers?.status === 'approved') || pkgItems[0];
      if (!first?.commerce_books?.id) throw new Error('Paket içeriği eksik');
      const offer = first.commerce_vendor_offers;
      if (offer && (offer.status !== 'approved' || offer.stock_quantity < 1)) {
        throw new Error(`"${pkg.name}" paketi için stok yetersiz`);
      }
      lines.push({
        vendor_offer_id: offer?.id || null,
        book_id: first.commerce_books.id,
        package_id: pkg.id,
        vendor_id: offer?.vendor_id,
        title_snapshot: pkg.name,
        isbn_snapshot: first.commerce_books.isbn || null,
        quantity: 1,
        unit_price_kurus: pkg.price_kurus,
        compare_at_price_kurus: null,
        line_total_kurus: pkg.price_kurus,
        commission_rate: Number(offer?.commerce_vendors?.commission_rate ?? settings.default_commission_rate),
      });
      if (!lines[lines.length - 1].vendor_id) throw new Error('Paket satıcı bilgisi eksik');
    }
  }

  if (!lines.length) throw new Error('Sepette ödenebilir ürün yok');

  const subtotal = lines.reduce((s, l) => s + l.line_total_kurus, 0);
  let couponId = null;
  let couponCode = null;
  let discount = 0;
  const code = String(body.coupon_code || '').trim().toUpperCase();
  if (code) {
    const couponRes = await handleCart('cart.apply_coupon', { code }, actor);
    if (!couponRes.ok || !couponRes.coupon) throw new Error(couponRes.error || 'Geçersiz kupon');
    const c = couponRes.coupon;
    if (subtotal < c.min_order_kurus) {
      throw new Error(`Bu kupon için minimum sipariş tutarı yetersiz`);
    }
    discount =
      c.discount_type === 'percent'
        ? Math.round((subtotal * c.discount_value) / 100)
        : c.discount_value;
    if (c.max_discount_kurus) discount = Math.min(discount, c.max_discount_kurus);
    couponId = c.id;
    couponCode = c.code;
  }

  let shipping = settings.default_shipping_kurus || 0;
  if (settings.free_shipping_threshold_kurus > 0 && subtotal >= settings.free_shipping_threshold_kurus) {
    shipping = 0;
  }
  const total = Math.max(0, subtotal + shipping - discount);
  if (total < 100) throw new Error('Ödeme tutarı geçersiz');

  const orderNumber = await nextOrderNumber(settings.order_number_prefix);
  const studentId = actor.student_id || body.student_id || null;
  let institutionId = actor.institution_id || null;
  if (!institutionId && studentId) {
    const { data: st } = await supabaseAdmin.from('students').select('institution_id').eq('id', studentId).maybeSingle();
    institutionId = st?.institution_id || null;
  }

  const { data: order, error: orderErr } = await supabaseAdmin
    .from('commerce_orders')
    .insert({
      order_number: orderNumber,
      institution_id: institutionId,
      user_id: userId,
      student_id: studentId,
      status: 'pending_payment',
      commerce_mode: settings.commerce_mode || 'reseller',
      subtotal_kurus: subtotal,
      discount_kurus: discount,
      shipping_kurus: shipping,
      total_kurus: total,
      currency: 'TRY',
      coupon_id: couponId,
      coupon_code: couponCode,
      payment_status: 'pending',
    })
    .select('id, order_number, total_kurus, subtotal_kurus, shipping_kurus, discount_kurus')
    .single();
  if (orderErr) throw orderErr;

  const byVendor = new Map();
  for (const line of lines) {
    if (!byVendor.has(line.vendor_id)) byVendor.set(line.vendor_id, []);
    byVendor.get(line.vendor_id).push(line);
  }

  const vendorOrderIds = new Map();
  for (const [vendorId, vLines] of byVendor.entries()) {
    const vSub = vLines.reduce((s, l) => s + l.line_total_kurus, 0);
    const rate = vLines[0].commission_rate || settings.default_commission_rate || 15;
    const commission = Math.round((vSub * rate) / 100);
    const { data: vo, error: voErr } = await supabaseAdmin
      .from('commerce_vendor_orders')
      .insert({
        order_id: order.id,
        vendor_id: vendorId,
        status: 'pending',
        subtotal_kurus: vSub,
        commission_kurus: commission,
        vendor_net_kurus: Math.max(0, vSub - commission),
        shipping_kurus: 0,
      })
      .select('id')
      .single();
    if (voErr) throw voErr;
    vendorOrderIds.set(vendorId, vo.id);
  }

  const itemRows = lines.map((l) => ({
    order_id: order.id,
    vendor_order_id: vendorOrderIds.get(l.vendor_id) || null,
    vendor_offer_id: l.vendor_offer_id,
    book_id: l.book_id,
    package_id: l.package_id,
    vendor_id: l.vendor_id,
    title_snapshot: l.title_snapshot,
    isbn_snapshot: l.isbn_snapshot,
    quantity: l.quantity,
    unit_price_kurus: l.unit_price_kurus,
    compare_at_price_kurus: l.compare_at_price_kurus,
    line_total_kurus: l.line_total_kurus,
  }));
  const { error: itemsErr } = await supabaseAdmin.from('commerce_order_items').insert(itemRows);
  if (itemsErr) throw itemsErr;

  const paymentRef = paymentRefFromOrderId(order.id);
  await supabaseAdmin.from('commerce_payments').insert({
    order_id: order.id,
    provider: 'paytr',
    provider_order_id: paymentRef,
    amount_kurus: total,
    status: 'pending',
    idempotency_key: `prep-${order.id}`,
  });

  const token = signCheckoutToken({
    orderId: order.id,
    orderNumber: order.order_number,
    totalKurus: order.total_kurus,
    userId,
  });

  const checkoutBase =
    String(process.env.COMMERCE_CHECKOUT_URL || process.env.SITE_CHECKOUT_URL || '').trim() ||
    'https://onlinevipdershane.com/odeme/kitap';

  return {
    ok: true,
    token,
    payment_ref: paymentRef,
    order_id: order.id,
    order_number: order.order_number,
    total_kurus: order.total_kurus,
    subtotal_kurus: order.subtotal_kurus,
    shipping_kurus: order.shipping_kurus,
    discount_kurus: order.discount_kurus,
    checkout_url: `${checkoutBase.replace(/\/$/, '')}?token=${encodeURIComponent(token)}`,
  };
}

async function loadOrderSummary(orderId) {
  const { data: order, error } = await supabaseAdmin
    .from('commerce_orders')
    .select(
      `
      id, order_number, status, payment_status, total_kurus, subtotal_kurus, shipping_kurus, discount_kurus,
      coupon_code, customer_name, customer_email, customer_phone,
      commerce_order_items(id, title_snapshot, quantity, unit_price_kurus, line_total_kurus)
    `
    )
    .eq('id', orderId)
    .single();
  if (error || !order) throw new Error('Sipariş bulunamadı');
  return order;
}

function orderPublic(order, extra = {}) {
  return {
    id: order.id,
    order_number: order.order_number,
    payment_ref: paymentRefFromOrderId(order.id),
    status: order.status,
    payment_status: order.payment_status,
    total_kurus: order.total_kurus,
    subtotal_kurus: order.subtotal_kurus,
    shipping_kurus: order.shipping_kurus,
    discount_kurus: order.discount_kurus,
    coupon_code: order.coupon_code,
    customer_name: order.customer_name,
    customer_email: order.customer_email,
    customer_phone: order.customer_phone,
    items: order.commerce_order_items || [],
    ...extra,
  };
}

async function applyCheckoutCustomer(body, orderId) {
  const fields = customerFieldsFromCheckoutBody(body);
  const c = body.customer && typeof body.customer === 'object' ? body.customer : {};
  const name = fields.name || String(c.parentName || '').trim();
  const email = fields.email;
  const phone = fields.phone;
  if (!name || name.length < 3) throw new Error('Veli adı soyadı en az 3 karakter olmalıdır.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Geçerli e-posta girin');
  if (phone.replace(/\D/g, '').length < 10) throw new Error('Geçerli telefon girin');

  const { error } = await supabaseAdmin
    .from('commerce_orders')
    .update({
      customer_name: name,
      customer_email: email,
      customer_phone: phone,
      notes: fields.notes || null,
      payment_status: 'processing',
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('status', 'pending_payment');
  if (error) throw error;

  const addr = body.address || {};
  const line1 = String(addr.address_line1 || addr.line1 || '').trim();
  const city = String(addr.city || '').trim();
  if (line1 && city) {
    await supabaseAdmin.from('commerce_order_addresses').delete().eq('order_id', orderId).eq('address_type', 'shipping');
    await supabaseAdmin.from('commerce_order_addresses').insert({
      order_id: orderId,
      address_type: 'shipping',
      full_name: name,
      phone,
      address_line1: line1,
      address_line2: String(addr.address_line2 || addr.line2 || '').trim() || null,
      district: String(addr.district || '').trim() || null,
      city,
      postal_code: String(addr.postal_code || '').trim() || null,
      country: 'TR',
    });
  }

  return { name, email, phone, notes: fields.notes };
}

async function handleCheckout(op, body, req) {
  if (op === 'checkout.resolve') {
    const payload = verifyCheckoutToken(body.token);
    const order = await loadOrderSummary(payload.oid);
    if (order.status !== 'pending_payment' && order.payment_status !== 'pending' && order.payment_status !== 'processing') {
      if (order.payment_status === 'paid') throw new Error('Bu sipariş zaten ödendi');
    }
    if (order.status === 'cancelled' || order.status === 'payment_failed') {
      throw new Error('Sipariş ödeme için uygun değil');
    }
    return {
      ok: true,
      order: orderPublic(order),
    };
  }

  if (op === 'checkout.update_customer' || op === 'checkout.pay') {
    const payload = verifyCheckoutToken(body.token);
    const saved = await applyCheckoutCustomer(body, payload.oid);
    const order = await loadOrderSummary(payload.oid);
    const base = {
      ok: true,
      payment_ref: paymentRefFromOrderId(order.id),
      order: orderPublic(order, {
        customer_name: saved.name,
        customer_email: saved.email,
        customer_phone: saved.phone,
      }),
    };
    if (!wantsCheckoutPayment(op, body) && op !== 'checkout.pay') return base;
    const pay = await startCommerceProviderPayment(
      req,
      order,
      { name: saved.name, email: saved.email, phone: saved.phone, notes: saved.notes },
      body.provider
    );
    return { ...base, ...pay };
  }

  if (op === 'order.paid') {
    assertWebhookSecret(req);
    const ref = String(body.merchant_oid || body.payment_ref || '').trim();
    let orderId = body.order_id || null;
    if (!orderId && isCommercePaymentRef(ref)) orderId = orderIdFromPaymentRef(ref);
    if (!orderId) throw new Error('Sipariş referansı bulunamadı');

    const { data: order, error } = await supabaseAdmin
      .from('commerce_orders')
      .select('id, user_id, status, payment_status, total_kurus, order_number')
      .eq('id', orderId)
      .single();
    if (error || !order) throw new Error('Sipariş bulunamadı');

    if (order.payment_status === 'paid') {
      return { ok: true, already_paid: true, order_id: order.id, order_number: order.order_number };
    }

    const amount = Number(body.amount_kurus);
    if (Number.isFinite(amount) && amount > 0 && amount !== order.total_kurus) {
      console.warn('[commerce-store] order.paid amount mismatch', amount, order.total_kurus);
    }

    const provider = String(body.provider || 'paytr').toLowerCase();
    const now = new Date().toISOString();
    const patch = {
      status: 'paid',
      payment_status: 'paid',
      paid_at: now,
      updated_at: now,
    };
    if (provider === 'garanti') patch.garanti_order_id = ref;

    const { error: upErr } = await supabaseAdmin.from('commerce_orders').update(patch).eq('id', order.id);
    if (upErr) throw upErr;

    await supabaseAdmin
      .from('commerce_payments')
      .update({
        status: 'paid',
        provider,
        provider_order_id: ref || null,
        paid_at: now,
        updated_at: now,
        raw_response: body.raw || null,
      })
      .eq('order_id', order.id);

    // Stok düş
    const { data: orderItems } = await supabaseAdmin
      .from('commerce_order_items')
      .select('vendor_offer_id, quantity')
      .eq('order_id', order.id);
    for (const it of orderItems || []) {
      if (!it.vendor_offer_id) continue;
      const { data: offer } = await supabaseAdmin
        .from('commerce_vendor_offers')
        .select('stock_quantity')
        .eq('id', it.vendor_offer_id)
        .maybeSingle();
      if (!offer) continue;
      const next = Math.max(0, (offer.stock_quantity || 0) - it.quantity);
      await supabaseAdmin
        .from('commerce_vendor_offers')
        .update({ stock_quantity: next, updated_at: now })
        .eq('id', it.vendor_offer_id);
    }

    // Sepeti temizle
    if (order.user_id) {
      const { data: cart } = await supabaseAdmin
        .from('commerce_carts')
        .select('id')
        .eq('user_id', order.user_id)
        .maybeSingle();
      if (cart?.id) await supabaseAdmin.from('commerce_cart_items').delete().eq('cart_id', cart.id);
    }

    await supabaseAdmin
      .from('commerce_vendor_orders')
      .update({ status: 'confirmed', updated_at: now })
      .eq('order_id', order.id)
      .eq('status', 'pending');

    let vendor_whatsapp = null;
    try {
      vendor_whatsapp = await notifyVendorWhatsAppForPaidOrder(order.id);
    } catch (e) {
      console.warn('[commerce-store] vendor whatsapp failed', e?.message || e);
      vendor_whatsapp = { ok: false, error: e?.message || 'whatsapp_failed' };
    }

    return { ok: true, order_id: order.id, order_number: order.order_number, vendor_whatsapp };
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
    let op = String(body.op ?? '').trim();
    if (!op) return err(res, 400, 'op gerekli');
    // Site /odeme/kitap: resolve | pay | update_customer
    if (op === 'resolve' || op === 'pay' || op === 'update_customer') {
      op = normalizeCommerceCheckoutOp(op);
    }

    // Catalog GET operasyonları public (actor olmayabilir)
    let actor = null;
    try { actor = requireAuth(req); } catch { /* public catalog */ }

    const prefix = op.split('.')[0];
    let result;
    if (prefix === 'catalog') {
      result = await handleCatalog(op, body, actor);
    } else if (prefix === 'cart') {
      result = await handleCart(op, body, actor);
    } else if (prefix === 'checkout' || prefix === 'order') {
      result = await handleCheckout(op, body, req);
    } else if (prefix === 'assignment') {
      result = await handleAssignment(op, body, actor);
    } else {
      return err(res, 400, `Bilinmeyen operasyon: ${op}`);
    }

    return res.status(200).json(result);
  } catch (e) {
    console.error('[commerce-store]', e?.message || e);
    const msg = e?.message || 'sunucu_hatası';
    if (/Yetkisiz|giriş gerekli|Geçersiz|süresi dolmuş|bulunamadı|yeterli stok|Sepet boş|yapılandırılmamış|Veli|e-posta|telefon|karakter|PayTR|Garanti|token|ödeme|Sipariş/i.test(msg)) {
      const status = /Yetkisiz/i.test(msg) ? 401 : 400;
      return err(res, status, msg);
    }
    return err(res, 500, msg);
  }
}
