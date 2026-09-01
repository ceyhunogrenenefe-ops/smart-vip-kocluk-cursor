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
 *  catalog.collections   — 8. sınıf VIP / Paraf / Deneme grupları (geriye dönük)
 *  catalog.browse        — sınıf → kategori → kitap (süper admin store_browse)
 *  catalog.assigned      — öğrenciye atanmış kitaplar
 *  catalog.settings      — genel mağaza ayarları (kargo eşiği vs)
 *  staff.roster          — sınıf/öğrenci listesi (öğretmen/koç/admin)
 *  staff.assign          — sınıfa veya kişiye kitap öner/ata
 *  staff.package_create  — sınıf paketi oluştur
 *  staff.package_update  — paket adı / kademe / fiyat
 *  staff.package_delete  — paketi sil (soft)
 *  staff.package_items_set — paket kitaplarını değiştir
 *  deployMarker: kitap-kargo-adres-satici-2026-09-01
 *  cart.get              — mevcut sepeti getir
 *  cart.add              — sepete ürün ekle
 *  cart.update           — adet güncelle
 *  cart.remove           — sepetten çıkar
 *  cart.clear            — sepeti boşalt
 *  cart.apply_coupon     — kupon uygula
 *  cart.checkout_prepare — pending sipariş + handoff token
 *  cart.checkout_iban    — IBAN havale + dekont; ödemeyi tamamla
 *  checkout.resolve      — token ile sipariş özeti (site)
 *  checkout.update_customer — veli/adres (site, token)
 *  checkout.apply_coupon — ödeme sayfasında kupon (token, giriş yok)
 *  checkout.pay          — PayTR/Garanti başlat (odeme/kitap)
 *  order.paid            — ödeme callback webhook (site)
 *  assignment.own        — "Bu kitap bende var" (purchase yapmadan atama)
 *
 */

import { requireAuth } from '../api/_lib/auth.js';
import { actorRoleSet } from '../api/_lib/actor-roles.js';
import { buildCatalogListRows, filterCatalogListRows } from '../api/_lib/commerce-store-catalog.js';
import {
  assignmentSourceFromRoles,
  buildAssignmentInserts,
  buildPackageUpdatePatch,
  normalizeAssignmentType,
  resolvePackagePriceKurus,
  sumUniqueBookOfferPrices,
  slugifyPackageName,
  staffCanManageStore,
  uniqueIds
} from '../api/_lib/commerce-store-staff.js';
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
  decorateOrderNumberForCouponWidget,
  normalizeCommerceCheckoutOp,
  wantsCheckoutPayment,
} from '../api/_lib/commerce-checkout-op.js';
import { startCommerceProviderPayment } from '../api/_lib/commerce-checkout-pay.js';
import { COMMERCE_DEFAULT_SETTINGS } from '../api/_lib/commerce-constants.js';
import {
  formatIbanDisplay,
  parseIbanReceipt,
  resolveIbanAccount,
} from '../api/_lib/commerce-iban.js';
import { listLgs8Collections } from '../api/_lib/commerce-lgs8-seed.js';
import { assignedCatalogIfNoStudent, commerceStoreHttpStatus } from '../api/_lib/commerce-store-http.js';
import {
  assertShippingComplete,
  parseShippingFromBody,
  shippingInsertRow,
  shippingIsComplete
} from '../api/_lib/commerce-shipping-address.js';
import { classKeyMatchesLevels, listStoreBrowse, publicStoreBrowseNav } from '../api/_lib/commerce-store-browse.js';
import { notifyVendorWhatsAppForPaidOrder } from '../api/_lib/commerce-vendor-order-notify.js';
import { computeCouponDiscount } from '../api/_lib/commerce-coupon-discount.js';
import { applyCors, handleCorsPreflight } from '../api/_lib/cors-mobile.js';

function err(res, status, message) {
  return res.status(status).json({ error: message });
}

function sanitizeInt(v, fallback = 0) {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

async function fetchVendorsByIds(vendorIds) {
  const ids = [...new Set((vendorIds ?? []).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await supabaseAdmin
    .from('commerce_vendors')
    .select('id, name')
    .in('id', ids);
  if (error) throw error;
  return new Map((data ?? []).map((v) => [v.id, v]));
}

// ─────────────────────────────────────────────
// Katalog
// ─────────────────────────────────────────────
async function handleCatalog(op, body, actor) {
  if (op === 'catalog.settings') {
    const { data } = await supabaseAdmin
      .from('commerce_settings')
      .select('free_shipping_threshold_kurus, default_shipping_kurus, commerce_mode, student_store_enabled, meta')
      .is('institution_id', null)
      .maybeSingle();
    const store_browse = publicStoreBrowseNav(data?.meta?.store_browse);
    const iban_payment = resolveIbanAccount(data);
    const settings = {
      free_shipping_threshold_kurus: data?.free_shipping_threshold_kurus ?? COMMERCE_DEFAULT_SETTINGS.free_shipping_threshold_kurus,
      default_shipping_kurus: data?.default_shipping_kurus ?? COMMERCE_DEFAULT_SETTINGS.default_shipping_kurus,
      commerce_mode: data?.commerce_mode ?? COMMERCE_DEFAULT_SETTINGS.commerce_mode,
      student_store_enabled: data?.student_store_enabled ?? COMMERCE_DEFAULT_SETTINGS.student_store_enabled,
      iban_payment,
    };
    return {
      ok: true,
      settings,
      store_browse,
      deployMarker: 'kitap-kargo-adres-satici-2026-09-01',
    };
  }

  if (op === 'catalog.list') {
    const limit = Math.min(sanitizeInt(body.limit, 48), 200);
    const offset = sanitizeInt(body.offset, 0);
    const { data: books, error } = await supabaseAdmin
      .from('commerce_books')
      .select(`
        id, slug, title, author, publisher, subject, class_levels, exam_types,
        cover_image_url, page_count, metadata, is_catalog_active, created_at, deleted_at
      `)
      .eq('is_catalog_active', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(0, 499);
    if (error) throw error;
    const bookIds = (books ?? []).map((b) => b.id);
    let rawOffers = [];
    if (bookIds.length) {
      const { data: offerRows, error: offerErr } = await supabaseAdmin
        .from('commerce_vendor_offers')
        .select(`
          id, book_id, vendor_id, price_kurus, compare_at_price_kurus, stock_quantity, shipping_days,
          is_featured, is_bestseller, is_new_arrival, teacher_recommended, required_for_classes,
          status, deleted_at
        `)
        .in('book_id', bookIds)
        .is('deleted_at', null);
      if (offerErr) throw offerErr;
      rawOffers = offerRows ?? [];
    }
    const vendorMap = await fetchVendorsByIds(rawOffers.map((o) => o.vendor_id));
    const offersByBook = new Map();
    for (const offer of rawOffers) {
      const list = offersByBook.get(offer.book_id) || [];
      list.push({
        ...offer,
        commerce_vendors: vendorMap.get(offer.vendor_id) || { id: offer.vendor_id, name: 'Satıcı' }
      });
      offersByBook.set(offer.book_id, list);
    }
    const decorated = (books ?? []).map((b) => ({
      ...b,
      commerce_vendor_offers: offersByBook.get(b.id) || []
    }));
    const filtered = filterCatalogListRows(buildCatalogListRows(decorated), {
      search: body.search,
      subject: body.subject,
      publisher: body.publisher,
      class_level: body.class_level,
      series: body.series,
      teacher_recommended: body.teacher_recommended,
      is_featured: body.is_featured,
      is_bestseller: body.is_bestseller,
      is_new_arrival: body.is_new_arrival,
      price_min: body.price_min,
      price_max: body.price_max,
      sort: body.sort
    });
    return {
      ok: true,
      offers: filtered.slice(offset, offset + limit),
      total: filtered.length,
      deployMarker: 'kitap-package-autosum-2026-08-29'
    };
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
          id, book_id, quantity, is_required, sort_order,
          commerce_books(id, title, cover_image_url, author),
          commerce_vendor_offers(id, price_kurus, stock_quantity, status)
        )
      `)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    let packages = data ?? [];
    if (body.class_level) {
      packages = packages.filter((p) => !p.class_level || classKeyMatchesLevels(body.class_level, [p.class_level]));
    }
    return { ok: true, packages };
  }

  if (op === 'catalog.collections') {
    const collections = await listLgs8Collections();
    return { ok: true, collections };
  }

  if (op === 'catalog.browse') {
    const browse = await listStoreBrowse();
    return { ok: true, ...browse, deployMarker: 'kitap-kargo-adres-satici-2026-09-01' };
  }

  if (op === 'catalog.assigned') {
    if (!actor?.sub || actor.sub === 'anonymous') throw new Error('Giriş gerekli');
    const studentId = actor.student_id ?? body.student_id;
    const empty = assignedCatalogIfNoStudent(studentId);
    if (empty) return empty;
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

async function lookupActiveCoupon(code) {
  const now = new Date().toISOString();
  const { data: coupon } = await supabaseAdmin
    .from('commerce_coupons')
    .select('*')
    .eq('code', String(code || '').toUpperCase().trim())
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
    return lookupActiveCoupon(code);
  }

  if (op === 'cart.checkout_prepare') {
    return prepareCheckout(body, actor);
  }

  if (op === 'cart.checkout_iban') {
    return checkoutIban(body, actor);
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

async function upsertShippingAddress(orderId, ship) {
  await supabaseAdmin.from('commerce_order_addresses').delete().eq('order_id', orderId).eq('address_type', 'shipping');
  const { error } = await supabaseAdmin.from('commerce_order_addresses').insert(shippingInsertRow(orderId, ship));
  if (error) throw error;
}

async function loadShippingAddress(orderId) {
  const { data } = await supabaseAdmin
    .from('commerce_order_addresses')
    .select('*')
    .eq('order_id', orderId)
    .eq('address_type', 'shipping')
    .maybeSingle();
  return data || null;
}

async function prepareCheckout(body, actor, opts = {}) {
  if (!actor?.sub || actor.sub === 'anonymous') throw new Error('Ödeme için giriş gerekli');
  const userId = actor.sub;
  const cartId = await getOrCreateCart(userId);
  const items = await enrichCart(cartId);
  if (!items.length) throw new Error('Sepet boş');

  const settings = await loadCommerceSettings();
  if (settings.student_store_enabled === false) throw new Error('Kitap mağazası şu an kapalı');
  const ship = assertShippingComplete(parseShippingFromBody(body), { requireEmail: true });

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
    const couponRes = await lookupActiveCoupon(code);
    if (!couponRes.ok || !couponRes.coupon) throw new Error(couponRes.error || 'Geçersiz kupon');
    const c = couponRes.coupon;
    if (subtotal < c.min_order_kurus) {
      throw new Error(`Bu kupon için minimum sipariş tutarı yetersiz`);
    }
    discount = computeCouponDiscount(c, subtotal);
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
      ...(opts.orderPatch || {}),
      customer_name: ship.full_name,
      customer_email: ship.email,
      customer_phone: ship.phone,
      notes: (opts.orderPatch && opts.orderPatch.notes) || ship.notes || null,
    })
    .select('id, order_number, total_kurus, subtotal_kurus, shipping_kurus, discount_kurus')
    .single();
  if (orderErr) throw orderErr;
  await upsertShippingAddress(order.id, ship);

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
  const provider = String(opts.provider || 'paytr').toLowerCase();
  await supabaseAdmin.from('commerce_payments').insert({
    order_id: order.id,
    provider,
    provider_order_id: paymentRef,
    amount_kurus: total,
    status: 'pending',
    idempotency_key: `prep-${order.id}`,
  });

  if (opts.skipRedirect) {
    return {
      ok: true,
      payment_ref: paymentRef,
      order_id: order.id,
      order_number: order.order_number,
      total_kurus: order.total_kurus,
      subtotal_kurus: order.subtotal_kurus,
      shipping_kurus: order.shipping_kurus,
      discount_kurus: order.discount_kurus,
      user_id: userId,
    };
  }

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

async function uploadIbanReceipt(orderId, receipt) {
  const path = `receipts/${orderId}/dekont-${Date.now()}.${receipt.ext}`;
  const { error: upErr } = await supabaseAdmin.storage
    .from('commerce-vendor-assets')
    .upload(path, receipt.buffer, { contentType: receipt.mime, upsert: true, cacheControl: '31536000' });
  if (upErr) throw new Error(`Dekont yüklenemedi: ${upErr.message}`);
  const { data: pub } = supabaseAdmin.storage.from('commerce-vendor-assets').getPublicUrl(path);
  const url = pub?.publicUrl;
  if (!url) throw new Error('Dekont adresi alınamadı');
  return { url, path };
}

async function fulfillPaidOrder(order, { provider = 'paytr', ref = null, raw = null } = {}) {
  if (order.payment_status === 'paid') {
    return { ok: true, already_paid: true, order_id: order.id, order_number: order.order_number };
  }
  const now = new Date().toISOString();
  const patch = {
    status: 'paid',
    payment_status: 'paid',
    paid_at: now,
    updated_at: now,
  };
  if (provider === 'garanti') patch.garanti_order_id = ref;
  if (raw?.order_notes) patch.notes = raw.order_notes;

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
      raw_response: raw || null,
    })
    .eq('order_id', order.id);

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
    vendor_whatsapp = await notifyVendorWhatsAppForPaidOrder(order.id, { paymentMethod: provider });
  } catch (e) {
    console.warn('[commerce-store] vendor whatsapp failed', e?.message || e);
    vendor_whatsapp = { ok: false, error: e?.message || 'whatsapp_failed' };
  }

  return { ok: true, order_id: order.id, order_number: order.order_number, vendor_whatsapp };
}

async function checkoutIban(body, actor) {
  const settings = await loadCommerceSettings();
  const account = resolveIbanAccount(settings);
  if (!account.enabled) throw new Error('IBAN ile ödeme şu an kapalı');
  const receipt = parseIbanReceipt(body);

  const shipPreview = parseShippingFromBody(body);
  const notes = shipPreview.notes
    ? `IBAN havale · ${account.holder} · ${formatIbanDisplay(account.iban)} · dekont yüklendi · ${shipPreview.notes}`
    : `IBAN havale · ${account.holder} · ${formatIbanDisplay(account.iban)} · dekont yüklendi`;
  const prepared = await prepareCheckout(body, actor, {
    provider: 'iban',
    skipRedirect: true,
    orderPatch: {
      notes,
    },
  });

  let uploaded;
  try {
    uploaded = await uploadIbanReceipt(prepared.order_id, receipt);
  } catch (e) {
    const now = new Date().toISOString();
    await supabaseAdmin
      .from('commerce_orders')
      .update({ status: 'cancelled', payment_status: 'failed', cancelled_at: now, updated_at: now })
      .eq('id', prepared.order_id);
    throw e;
  }

  const paid = await fulfillPaidOrder(
    {
      id: prepared.order_id,
      user_id: prepared.user_id,
      payment_status: 'pending',
      order_number: prepared.order_number,
    },
    {
      provider: 'iban',
      ref: prepared.payment_ref,
      raw: {
        method: 'iban',
        holder: account.holder,
        iban: account.iban,
        note: account.note,
        receipt_url: uploaded.url,
        receipt_path: uploaded.path,
        order_notes: notes,
      },
    }
  );

  return {
    ok: true,
    payment_method: 'iban',
    order_id: prepared.order_id,
    order_number: prepared.order_number,
    total_kurus: prepared.total_kurus,
    receipt_url: uploaded.url,
    iban_payment: account,
    already_paid: paid.already_paid || false,
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
  const ship = parseShippingFromBody(body);
  const name = ship.full_name || fields.name;
  const email = ship.email || fields.email;
  const phone = ship.phone || fields.phone;
  if (!name || name.length < 3) throw new Error('Veli adı soyadı en az 3 karakter olmalıdır.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Geçerli e-posta girin');
  if (phone.replace(/\D/g, '').length < 10) throw new Error('Geçerli telefon girin');

  const { error } = await supabaseAdmin
    .from('commerce_orders')
    .update({
      customer_name: name,
      customer_email: email,
      customer_phone: phone,
      notes: fields.notes || ship.notes || null,
      payment_status: 'processing',
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('status', 'pending_payment');
  if (error) throw error;

  if (shippingIsComplete(ship)) {
    await upsertShippingAddress(orderId, { ...ship, full_name: name, phone });
  } else {
    const existing = await loadShippingAddress(orderId);
    if (!existing) throw new Error('Teslimat adresi gerekli');
  }

  return { name, email, phone, notes: fields.notes || ship.notes };
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
    const pub = orderPublic(order);
    pub.order_number = decorateOrderNumberForCouponWidget(pub.order_number);
    return {
      ok: true,
      order: pub,
    };
  }

  if (op === 'checkout.apply_coupon') {
    const payload = verifyCheckoutToken(body.token);
    const rawCode = String(body.coupon_code || body.code || '').trim();
    const order = await loadOrderSummary(payload.oid);
    if (order.status !== 'pending_payment') {
      throw new Error('Kupon yalnızca ödenmemiş siparişe uygulanır');
    }
    let couponId = null;
    let couponCode = null;
    let discount = 0;
    if (rawCode) {
      const couponRes = await lookupActiveCoupon(rawCode);
      if (!couponRes.ok || !couponRes.coupon) throw new Error(couponRes.error || 'Geçersiz kupon');
      const c = couponRes.coupon;
      discount = computeCouponDiscount(c, order.subtotal_kurus);
      if (discount <= 0 && order.subtotal_kurus < Number(c.min_order_kurus || 0)) {
        throw new Error(`Bu kupon için minimum sipariş tutarı yetersiz`);
      }
      couponId = c.id;
      couponCode = c.code;
    }
    const total = Math.max(0, Number(order.subtotal_kurus || 0) + Number(order.shipping_kurus || 0) - discount);
    if (total < 100) throw new Error('İndirim sonrası ödeme tutarı geçersiz');
    const { error: updErr } = await supabaseAdmin
      .from('commerce_orders')
      .update({
        coupon_id: couponId,
        coupon_code: couponCode,
        discount_kurus: discount,
        total_kurus: total,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)
      .eq('status', 'pending_payment');
    if (updErr) throw updErr;
    await supabaseAdmin
      .from('commerce_payments')
      .update({ amount_kurus: total, updated_at: new Date().toISOString() })
      .eq('order_id', order.id)
      .in('status', ['pending', 'processing']);
    const refreshed = await loadOrderSummary(order.id);
    return { ok: true, order: orderPublic(refreshed) };
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

    const amount = Number(body.amount_kurus);
    if (Number.isFinite(amount) && amount > 0 && amount !== order.total_kurus) {
      console.warn('[commerce-store] order.paid amount mismatch', amount, order.total_kurus);
    }

    return fulfillPaidOrder(order, {
      provider: String(body.provider || 'paytr').toLowerCase(),
      ref,
      raw: body.raw || null,
    });
  }

  throw new Error(`Bilinmeyen operasyon: ${op}`);
}

async function requireStoreStaff(actor) {
  if (!actor?.sub || actor.sub === 'anonymous') throw new Error('Giriş gerekli');
  const roleSet = await actorRoleSet(actor);
  if (!staffCanManageStore(roleSet)) throw new Error('Yetki yok');
  return roleSet;
}

async function resolveAssignableStudentIds(actor, roleSet, body) {
  const explicit = uniqueIds(body.student_ids || (body.student_id ? [body.student_id] : []));
  if (explicit.length) return explicit;
  const classId = String(body.class_id || '').trim();
  const classLevel = String(body.class_level || '').trim();
  const institutionId = actor.institution_id || body.institution_id || null;
  const ids = new Set();

  if (classId) {
    const { data: cs } = await supabaseAdmin
      .from('class_students')
      .select('student_id')
      .eq('class_id', classId);
    for (const row of cs || []) if (row.student_id) ids.add(String(row.student_id));
  }

  if (classLevel && !classId) {
    let q = supabaseAdmin.from('students').select('id, class_level').limit(800);
    if (institutionId) q = q.eq('institution_id', institutionId);
    if (roleSet.has('coach') && actor.coach_id && !roleSet.has('admin') && !roleSet.has('super_admin')) {
      q = q.eq('coach_id', actor.coach_id);
    }
    const { data: rows } = await q;
    for (const row of rows || []) {
      if (classKeyMatchesLevels(classLevel, [row.class_level])) ids.add(String(row.id));
    }
  }

  return [...ids];
}

async function handleStaff(op, body, actor) {
  const roleSet = await requireStoreStaff(actor);
  const source = assignmentSourceFromRoles(roleSet);
  const institutionId = actor.institution_id || body.institution_id || null;

  if (op === 'staff.roster') {
    let classQuery = supabaseAdmin.from('classes').select('id, name, class_level').order('name', { ascending: true }).limit(200);
    if (institutionId && !roleSet.has('super_admin')) classQuery = classQuery.eq('institution_id', institutionId);
    const { data: classes } = await classQuery;

    let studentQuery = supabaseAdmin
      .from('students')
      .select('id, name, class_level, coach_id, institution_id')
      .limit(500);
    if (institutionId && !roleSet.has('super_admin')) studentQuery = studentQuery.eq('institution_id', institutionId);
    if (roleSet.has('coach') && actor.coach_id && !roleSet.has('admin') && !roleSet.has('super_admin')) {
      studentQuery = studentQuery.eq('coach_id', actor.coach_id);
    }
    const { data: students, error: stErr } = await studentQuery;
    if (stErr) throw stErr;
    const studentIds = (students || []).map((s) => s.id);
    const classByStudent = new Map();
    if (studentIds.length) {
      const { data: links } = await supabaseAdmin
        .from('class_students')
        .select('student_id, class_id')
        .in('student_id', studentIds)
        .limit(2000);
      for (const row of links || []) {
        if (row.student_id && !classByStudent.has(row.student_id)) {
          classByStudent.set(row.student_id, row.class_id || null);
        }
      }
    }
    return {
      ok: true,
      classes: classes || [],
      students: (students || []).map((s) => ({
        id: s.id,
        name: s.name,
        class_level: s.class_level,
        class_id: classByStudent.get(s.id) || null
      })),
      can_manage: true
    };
  }

  if (op === 'staff.assign') {
    const bookIds = uniqueIds(body.book_ids || (body.book_id ? [body.book_id] : []));
    if (!bookIds.length) throw new Error('book_id gerekli');
    const assignmentType = normalizeAssignmentType(body.assignment_type || (body.recommend_only ? 'recommended' : 'required'));
    const studentIds = await resolveAssignableStudentIds(actor, roleSet, body);
    if (!studentIds.length && assignmentType === 'recommended') {
      await supabaseAdmin
        .from('commerce_vendor_offers')
        .update({ teacher_recommended: true })
        .in('book_id', bookIds)
        .eq('status', 'approved')
        .is('deleted_at', null);
      return {
        ok: true,
        created: 0,
        updated: 0,
        student_count: 0,
        book_count: bookIds.length,
        catalog_recommended: true
      };
    }
    if (!studentIds.length) throw new Error('öğrenci bulunamadı — sınıf veya kişi seçin');
    let inst = institutionId;
    if (!inst) {
      const { data: st } = await supabaseAdmin
        .from('students')
        .select('institution_id')
        .eq('id', studentIds[0])
        .maybeSingle();
      inst = st?.institution_id || null;
    }
    if (!inst) throw new Error('institution_id gerekli');
    const { data: offers } = await supabaseAdmin
      .from('commerce_vendor_offers')
      .select('id, book_id, price_kurus, stock_quantity, status')
      .in('book_id', bookIds)
      .eq('status', 'approved')
      .is('deleted_at', null);
    const offerByBook = {};
    for (const o of offers || []) {
      if (Number(o.price_kurus) > 0 && Number(o.stock_quantity) > 0 && !offerByBook[o.book_id]) {
        offerByBook[o.book_id] = o.id;
      }
    }
    const rows = buildAssignmentInserts({
      institutionId: inst,
      studentIds,
      bookIds,
      offerByBook,
      assignmentType,
      source,
      assignedBy: actor.sub,
      notes: body.notes
    });
    let created = 0;
    let updated = 0;
    for (const row of rows) {
      const { data: existing } = await supabaseAdmin
        .from('commerce_student_book_assignments')
        .select('id')
        .eq('student_id', row.student_id)
        .eq('book_id', row.book_id)
        .is('deleted_at', null)
        .maybeSingle();
      if (existing) {
        await supabaseAdmin
          .from('commerce_student_book_assignments')
          .update({
            assignment_type: row.assignment_type,
            source: row.source,
            status: 'assigned',
            vendor_offer_id: row.vendor_offer_id,
            notes: row.notes,
            assigned_by: row.assigned_by,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);
        updated += 1;
      } else {
        const { error } = await supabaseAdmin.from('commerce_student_book_assignments').insert(row);
        if (error) throw error;
        created += 1;
      }
    }
    if (assignmentType === 'recommended' && bookIds.length === 1) {
      await supabaseAdmin
        .from('commerce_vendor_offers')
        .update({ teacher_recommended: true })
        .eq('book_id', bookIds[0])
        .eq('status', 'approved')
        .is('deleted_at', null);
    }
    return { ok: true, created, updated, student_count: studentIds.length, book_count: bookIds.length };
  }

  if (op === 'staff.package_create') {
    const name = String(body.name || '').trim();
    if (!name) throw new Error('name gerekli');
    const bookIds = uniqueIds(body.book_ids || []);
    if (!bookIds.length) throw new Error('pakete en az bir kitap ekleyin');
    const { data: offers } = await supabaseAdmin
      .from('commerce_vendor_offers')
      .select('id, book_id, price_kurus, stock_quantity, status')
      .in('book_id', bookIds)
      .eq('status', 'approved')
      .is('deleted_at', null);
    const priceKurus = resolvePackagePriceKurus(body.price_kurus, offers);
    const slugBase = slugifyPackageName(name) || `paket-${Date.now()}`;
    const slug = `${slugBase}-${String(Date.now()).slice(-6)}`;
    const { data: pkg, error } = await supabaseAdmin
      .from('commerce_book_packages')
      .insert({
        name,
        slug,
        description: String(body.description || '').trim() || null,
        class_level: String(body.class_level || '').trim() || null,
        program: String(body.program || '').trim() || null,
        price_kurus: priceKurus,
        compare_at_price_kurus: body.compare_at_price_kurus != null ? sanitizeInt(body.compare_at_price_kurus) : null,
        is_active: true,
        institution_id: institutionId,
        created_by: actor.sub,
        updated_by: actor.sub
      })
      .select()
      .single();
    if (error) throw error;
    const offerByBook = {};
    for (const o of offers || []) {
      if (Number(o.price_kurus) > 0 && !offerByBook[o.book_id]) offerByBook[o.book_id] = o.id;
    }
    const { error: itemErr } = await supabaseAdmin.from('commerce_book_package_items').insert(
      bookIds.map((book_id, idx) => ({
        package_id: pkg.id,
        book_id,
        vendor_offer_id: offerByBook[book_id] || null,
        quantity: 1,
        is_required: true,
        sort_order: idx
      }))
    );
    if (itemErr) throw itemErr;
    return { ok: true, package: pkg, item_count: bookIds.length, price_kurus: priceKurus, auto_summed: !(Number(body.price_kurus) > 0) };
  }

  if (op === 'staff.package_update') {
    const id = String(body.id || body.package_id || '').trim();
    if (!id) throw new Error('paket id gerekli');
    const { data: existing, error: findErr } = await supabaseAdmin
      .from('commerce_book_packages')
      .select('id, institution_id')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!existing) throw new Error('paket bulunamadı');
    if (institutionId && existing.institution_id && existing.institution_id !== institutionId && !roleSet.has('super_admin')) {
      throw new Error('Yetki yok');
    }
    const patch = buildPackageUpdatePatch(body, actor.sub);
    const { data: pkg, error } = await supabaseAdmin
      .from('commerce_book_packages')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return { ok: true, package: pkg };
  }

  if (op === 'staff.package_delete') {
    const id = String(body.id || body.package_id || '').trim();
    if (!id) throw new Error('paket id gerekli');
    const { data: existing, error: findErr } = await supabaseAdmin
      .from('commerce_book_packages')
      .select('id, institution_id')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!existing) throw new Error('paket bulunamadı');
    if (institutionId && existing.institution_id && existing.institution_id !== institutionId && !roleSet.has('super_admin')) {
      throw new Error('Yetki yok');
    }
    const { error } = await supabaseAdmin
      .from('commerce_book_packages')
      .update({ deleted_at: new Date().toISOString(), updated_by: actor.sub, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    return { ok: true };
  }

  if (op === 'staff.package_items_set') {
    const id = String(body.package_id || body.id || '').trim();
    if (!id) throw new Error('paket id gerekli');
    const bookIds = uniqueIds(body.book_ids || []);
    if (!bookIds.length) throw new Error('pakete en az bir kitap ekleyin');
    const { data: existing, error: findErr } = await supabaseAdmin
      .from('commerce_book_packages')
      .select('id, institution_id')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!existing) throw new Error('paket bulunamadı');
    if (institutionId && existing.institution_id && existing.institution_id !== institutionId && !roleSet.has('super_admin')) {
      throw new Error('Yetki yok');
    }
    const { data: offers } = await supabaseAdmin
      .from('commerce_vendor_offers')
      .select('id, book_id, price_kurus, stock_quantity, status')
      .in('book_id', bookIds)
      .eq('status', 'approved')
      .is('deleted_at', null);
    const offerByBook = {};
    for (const o of offers || []) {
      if (Number(o.price_kurus) > 0 && !offerByBook[o.book_id]) offerByBook[o.book_id] = o.id;
    }
    await supabaseAdmin.from('commerce_book_package_items').delete().eq('package_id', id);
    const { error: itemErr } = await supabaseAdmin.from('commerce_book_package_items').insert(
      bookIds.map((book_id, idx) => ({
        package_id: id,
        book_id,
        vendor_offer_id: offerByBook[book_id] || null,
        quantity: 1,
        is_required: true,
        sort_order: idx
      }))
    );
    if (itemErr) throw itemErr;
    const summed = sumUniqueBookOfferPrices(offers);
    let price_kurus = null;
    if (body.auto_sum === true && summed > 0) {
      await supabaseAdmin
        .from('commerce_book_packages')
        .update({ price_kurus: summed, updated_at: new Date().toISOString(), updated_by: actor.sub })
        .eq('id', id);
      price_kurus = summed;
    }
    return { ok: true, item_count: bookIds.length, price_kurus, auto_summed: body.auto_sum === true };
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
  applyCors(req, res);
  if (handleCorsPreflight(req, res)) return;
  if (req.method !== 'POST') return err(res, 405, 'Method Not Allowed');
  try {
    const body = req.body ?? {};
    let op = String(body.op ?? '').trim();
    if (!op) return err(res, 400, 'op gerekli');
    // Site /odeme/kitap: resolve | pay | update_customer
    if (op === 'resolve' || op === 'pay' || op === 'update_customer' || op === 'apply_coupon') {
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
    } else if (prefix === 'staff') {
      result = await handleStaff(op, body, actor);
    } else {
      return err(res, 400, `Bilinmeyen operasyon: ${op}`);
    }

    return res.status(200).json(result);
  } catch (e) {
    console.error('[commerce-store]', e?.message || e);
    const msg = e?.message || 'sunucu_hatası';
    const status = commerceStoreHttpStatus(msg);
    return err(res, status, msg);
  }
}
