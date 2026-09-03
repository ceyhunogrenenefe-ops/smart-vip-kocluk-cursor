/**
 * /api/commerce-admin — Süper Admin kitap pazaryeri yönetimi
 *
 * İzin verilen roller: super_admin, admin
 *
 * Operasyonlar:
 *  vendors.list | vendors.get | vendors.create | vendors.update | vendors.delete
 *  vendor_users.list | vendor_users.add | vendor_users.remove
 *  books.list | books.get | books.create | books.update | books.delete | books.save | books.request_correction
 *  books.bulk_upsert | books.seed_lgs8_vip | books.seed_lgs8_paraf_iq | books.seed_lgs8_deneme_kulubu
 *  offers.list | offers.get | offers.approve | offers.reject | offers.request_correction | offers.inactive | offers.update
 *  packages.list | packages.get | packages.create | packages.update | packages.delete | packages.items.set
 *  vendors.ensure_yanki
 *  orders.list | orders.get | orders.update | orders.update_status | orders.delete
 *  orders.sync_whatsapp_template
 *  orders.import_kitap_form | orders.push_to_yanki
 *  deployMarker: kitap-iban-yanki-push-2026-09-03
 *  vendor_orders.list | vendor_orders.update_status
 *  shipments.list | shipments.get | shipments.create | shipments.update
 *  payouts.list | payouts.get | payouts.create | payouts.approve | payouts.mark_paid
 *  refunds.list | refunds.get | refunds.decide
 *  coupons.list | coupons.get | coupons.create | coupons.update | coupons.delete
 *  settings.get | settings.update  (store_browse = sınıf + kategori menüsü)
 *  reports.sales | reports.vendors | reports.low_stock
 */

import { randomUUID } from 'crypto';
import { requireAuth } from '../api/_lib/auth.js';
import { actorRoleSet, roleSetHasSuperAdmin, roleSetHasAdmin } from '../api/_lib/actor-roles.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { bulkUpsertBooks, ensureYankiVendor, seedLgs8DenemeKulubu, seedLgs8ParafIqSet, seedLgs8VipCatalog, seedLgs8VipSet, upsertYankiOfferForExistingBook } from '../api/_lib/commerce-lgs8-seed.js';
import { attachOfferRelations, attachOfferRelationsList } from '../api/_lib/commerce-utils.js';
import { defaultStoreBrowse, normalizeStoreBrowse, withInferredSeriesMetadata } from '../api/_lib/commerce-store-browse.js';
import { decorateOrderWithIbanReceipt } from '../api/_lib/commerce-iban.js';
import { activateBookOrderMetaTemplate } from '../api/_lib/book-order-meta-send.js';
import { importKitapFormOrdersToYanki, DEFAULT_SINCE } from '../api/_lib/commerce-kitap-form-import.js';
import { pushPaidOrdersToYanki } from '../api/_lib/commerce-push-paid-to-vendor.js';

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

function sanitizeIsbn(v) {
  const t = sanitizeText(v);
  return t || null;
}

function activeOffers(list) {
  return (list ?? []).filter((o) => !o.deleted_at);
}

async function logAudit(params) {
  try {
    await supabaseAdmin.from('commerce_audit_logs').insert({
      entity_type: params.entity_type,
      entity_id: String(params.entity_id ?? ''),
      action: params.action,
      actor_user_id: params.actor_user_id ?? null,
      vendor_id: params.vendor_id ?? null,
      institution_id: params.institution_id ?? null,
      old_value: params.old_value ?? null,
      new_value: params.new_value ?? null,
      ip_address: params.ip_address ?? null,
    });
  } catch (e) {
    console.warn('[commerce-admin] audit log failed', e?.message);
  }
}

// ─────────────────────────────────────────────
// Satıcılar
// ─────────────────────────────────────────────
async function handleVendors(op, body, actor) {
  if (op === 'vendors.list') {
    const { data, error } = await supabaseAdmin
      .from('commerce_vendors')
      .select('*, commerce_vendor_users(count)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return { ok: true, vendors: data };
  }

  if (op === 'vendors.get') {
    const { id } = body;
    if (!id) throw new Error('id gerekli');
    const { data, error } = await supabaseAdmin
      .from('commerce_vendors')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();
    if (error) throw error;
    return { ok: true, vendor: data };
  }

  if (op === 'vendors.create') {
    const slug =
      sanitizeText(body.slug) ||
      sanitizeText(body.name)
        ?.toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
    if (!body.name || !slug) throw new Error('name ve slug gerekli');
    const { data, error } = await supabaseAdmin
      .from('commerce_vendors')
      .insert({
        name: sanitizeText(body.name),
        slug,
        description: sanitizeText(body.description),
        contact_email: sanitizeText(body.contact_email),
        contact_phone: sanitizeText(body.contact_phone),
        address_line1: sanitizeText(body.address_line1),
        city: sanitizeText(body.city),
        commission_rate: parseFloat(body.commission_rate ?? 15),
        payout_iban: sanitizeText(body.payout_iban),
        linked_kitapci_id: body.linked_kitapci_id ?? null,
        institution_id: body.institution_id ?? null,
        created_by: actor.sub,
        updated_by: actor.sub,
      })
      .select()
      .single();
    if (error) throw error;
    await logAudit({ entity_type: 'commerce_vendor', entity_id: data.id, action: 'create', actor_user_id: actor.sub, new_value: data });
    return { ok: true, vendor: data };
  }

  if (op === 'vendors.update') {
    const { id, ...fields } = body;
    if (!id) throw new Error('id gerekli');
    const { data: old } = await supabaseAdmin.from('commerce_vendors').select('*').eq('id', id).single();
    const patch = {};
    if (fields.name !== undefined) patch.name = sanitizeText(fields.name);
    if (fields.slug !== undefined) patch.slug = sanitizeText(fields.slug);
    if (fields.description !== undefined) patch.description = sanitizeText(fields.description);
    if (fields.contact_email !== undefined) patch.contact_email = sanitizeText(fields.contact_email);
    if (fields.contact_phone !== undefined) patch.contact_phone = sanitizeText(fields.contact_phone);
    if (fields.commission_rate !== undefined) patch.commission_rate = parseFloat(fields.commission_rate);
    if (fields.is_active !== undefined) patch.is_active = Boolean(fields.is_active);
    if (fields.payout_iban !== undefined) patch.payout_iban = sanitizeText(fields.payout_iban);
    if (fields.address_line1 !== undefined) patch.address_line1 = sanitizeText(fields.address_line1);
    if (fields.city !== undefined) patch.city = sanitizeText(fields.city);
    if (fields.meta !== undefined && typeof fields.meta === 'object') patch.meta = fields.meta;
    if (fields.linked_kitapci_id !== undefined) patch.linked_kitapci_id = fields.linked_kitapci_id || null;
    patch.updated_by = actor.sub;
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabaseAdmin.from('commerce_vendors').update(patch).eq('id', id).select().single();
    if (error) throw error;
    await logAudit({ entity_type: 'commerce_vendor', entity_id: id, action: 'update', actor_user_id: actor.sub, old_value: old, new_value: data });
    return { ok: true, vendor: data };
  }

  if (op === 'vendors.delete') {
    const { id } = body;
    if (!id) throw new Error('id gerekli');
    const { error } = await supabaseAdmin.from('commerce_vendors').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    await logAudit({ entity_type: 'commerce_vendor', entity_id: id, action: 'soft_delete', actor_user_id: actor.sub });
    return { ok: true };
  }

  if (op === 'vendors.ensure_yanki') {
    const out = await ensureYankiVendor({
      actorSub: actor.sub,
      contact_phone: sanitizeText(body.contact_phone),
      institution_id: sanitizeText(body.institution_id),
    });
    await logAudit({
      entity_type: 'commerce_vendor',
      entity_id: out.vendor.id,
      action: out.created ? 'create' : 'ensure_yanki',
      actor_user_id: actor.sub,
      new_value: { slug: out.vendor.slug, phone: out.vendor.contact_phone },
    });
    return { ok: true, ...out };
  }

  throw new Error(`Bilinmeyen operasyon: ${op}`);
}

// ─────────────────────────────────────────────
// Satıcı kullanıcıları
// ─────────────────────────────────────────────
async function handleVendorUsers(op, body, actor) {
  if (op === 'vendor_users.list') {
    const { vendor_id } = body;
    if (!vendor_id) throw new Error('vendor_id gerekli');

    // İki adımlı sorgu: FK çakışmasını önlemek için join yerine ayrı çek
    const { data: vuRows, error: vuErr } = await supabaseAdmin
      .from('commerce_vendor_users')
      .select('id, vendor_id, user_id, role, is_active, created_at')
      .eq('vendor_id', vendor_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (vuErr) throw vuErr;

    const userIds = (vuRows ?? []).map((r) => r.user_id).filter(Boolean);
    let usersMap = {};
    if (userIds.length) {
      const { data: userRows } = await supabaseAdmin
        .from('users')
        .select('id, name, email, role, is_active, last_login_at')
        .in('id', userIds);
      for (const u of userRows ?? []) usersMap[u.id] = u;
    }

    const normalized = (vuRows ?? []).map((row) => ({
      ...row,
      users: usersMap[row.user_id] ?? null,
    }));
    return { ok: true, users: normalized };
  }

  /**
   * vendor_users.create_account
   * Satıcı için yeni users kaydı oluşturur + commerce_vendor_users bağlar.
   * body: { vendor_id, name, email, password, phone? }
   */
  if (op === 'vendor_users.create_account') {
    const { vendor_id, name, email, password, phone } = body;
    if (!vendor_id || !name || !email || !password) {
      throw new Error('vendor_id, name, email, password zorunlu');
    }
    const normalizedEmail = String(email).toLowerCase().trim();
    if (String(password).length < 6) throw new Error('Şifre en az 6 karakter olmalı');

    // E-posta çakışma kontrolü
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();
    if (existing) throw new Error('Bu e-posta adresi zaten kullanımda');

    const now = new Date().toISOString();
    const userId = randomUUID();

    // Kullanıcı oluştur
    const { data: newUser, error: userErr } = await supabaseAdmin
      .from('users')
      .insert({
        id: userId,
        name: String(name).trim(),
        email: normalizedEmail,
        phone: phone ? String(phone).trim() : null,
        role: 'vendor_admin',
        roles: ['vendor_admin'],
        password_hash: String(password),
        is_active: true,
        institution_id: null,
        package: 'starter',
        start_date: now,
        end_date: new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000).toISOString(),
        created_by: actor.sub,
        created_at: now,
        updated_at: now,
      })
      .select('id, name, email, role')
      .single();
    if (userErr) throw new Error(`Kullanıcı oluşturulamadı: ${userErr.message}`);

    // commerce_vendor_users bağla
    const { error: vuErr } = await supabaseAdmin
      .from('commerce_vendor_users')
      .upsert({
        vendor_id,
        user_id: userId,
        role: 'admin',
        is_active: true,
        created_by: actor.sub,
        deleted_at: null,
      }, { onConflict: 'vendor_id,user_id' });
    if (vuErr) throw new Error(`Satıcı bağlantısı kurulamadı: ${vuErr.message}`);

    await logAudit({
      entity_type: 'commerce_vendor_user',
      entity_id: userId,
      action: 'create_account',
      actor_user_id: actor.sub,
      vendor_id,
      new_value: { email: normalizedEmail, name },
    });

    return { ok: true, user: newUser, password_set: String(password) };
  }

  /**
   * vendor_users.reset_password
   * body: { user_id, new_password }
   */
  if (op === 'vendor_users.reset_password') {
    const { user_id, new_password } = body;
    if (!user_id || !new_password) throw new Error('user_id ve new_password zorunlu');
    if (String(new_password).length < 6) throw new Error('Şifre en az 6 karakter olmalı');
    const { error } = await supabaseAdmin
      .from('users')
      .update({ password_hash: String(new_password), updated_at: new Date().toISOString() })
      .eq('id', user_id);
    if (error) throw error;
    await logAudit({ entity_type: 'user', entity_id: user_id, action: 'password_reset', actor_user_id: actor.sub });
    return { ok: true };
  }

  /**
   * vendor_users.toggle_active
   * body: { user_id, is_active }
   */
  if (op === 'vendor_users.toggle_active') {
    const { user_id, is_active } = body;
    if (!user_id) throw new Error('user_id gerekli');
    const { error } = await supabaseAdmin
      .from('users')
      .update({ is_active: Boolean(is_active), updated_at: new Date().toISOString() })
      .eq('id', user_id);
    if (error) throw error;
    return { ok: true };
  }

  if (op === 'vendor_users.add') {
    const { vendor_id, user_id, role } = body;
    if (!vendor_id || !user_id) throw new Error('vendor_id ve user_id gerekli');
    const { data, error } = await supabaseAdmin
      .from('commerce_vendor_users')
      .upsert({ vendor_id, user_id, role: role ?? 'admin', is_active: true, created_by: actor.sub, deleted_at: null }, { onConflict: 'vendor_id,user_id' })
      .select()
      .single();
    if (error) throw error;
    await logAudit({ entity_type: 'commerce_vendor_user', entity_id: data.id, action: 'add', actor_user_id: actor.sub, vendor_id, new_value: { user_id, role } });
    return { ok: true, vendor_user: data };
  }

  if (op === 'vendor_users.remove') {
    const { id } = body;
    if (!id) throw new Error('id gerekli');
    const { error } = await supabaseAdmin.from('commerce_vendor_users').update({ is_active: false, deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    return { ok: true };
  }

  throw new Error(`Bilinmeyen operasyon: ${op}`);
}

// ─────────────────────────────────────────────
// Kitap kataloğu
// ─────────────────────────────────────────────
async function handleBooks(op, body, actor) {
  if (op === 'books.list') {
    let q = supabaseAdmin
      .from('commerce_books')
      .select('*, commerce_vendor_offers(id, vendor_id, price_kurus, stock_quantity, status, shipping_days, correction_notes, deleted_at)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (body.search) q = q.ilike('title', `%${body.search}%`);
    if (body.publisher) q = q.eq('publisher', body.publisher);
    if (body.limit) q = q.limit(parseInt(body.limit, 10));
    if (body.offset) q = q.range(parseInt(body.offset, 10), parseInt(body.offset, 10) + (parseInt(body.limit ?? 50, 10) - 1));
    const { data, error } = await q;
    if (error) throw error;
    const books = (data ?? []).map((b) => ({
      ...b,
      commerce_vendor_offers: activeOffers(b.commerce_vendor_offers),
    }));
    return { ok: true, books };
  }

  if (op === 'books.get') {
    const { id } = body;
    if (!id) throw new Error('id gerekli');
    const { data, error } = await supabaseAdmin
      .from('commerce_books')
      .select('*, commerce_vendor_offers(id, vendor_id, price_kurus, stock_quantity, status, shipping_days, correction_notes, deleted_at, commerce_vendors(name))')
      .eq('id', id)
      .is('deleted_at', null)
      .single();
    if (error) throw error;
    return { ok: true, book: { ...data, commerce_vendor_offers: activeOffers(data.commerce_vendor_offers) } };
  }

  if (op === 'books.create') {
    if (!body.title) throw new Error('title gerekli');
    const slug =
      sanitizeText(body.slug) ||
      sanitizeText(body.title)
        ?.toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '') + '-' + Date.now();
    const { data, error } = await supabaseAdmin
      .from('commerce_books')
      .insert({
        isbn: sanitizeIsbn(body.isbn),
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
        is_catalog_active: body.is_catalog_active !== false,
        metadata: withInferredSeriesMetadata({
          title: sanitizeText(body.title),
          isbn: sanitizeIsbn(body.isbn),
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
    await logAudit({ entity_type: 'commerce_book', entity_id: data.id, action: 'create', actor_user_id: actor.sub, new_value: data });
    return { ok: true, book: data };
  }

  if (op === 'books.update') {
    const { id, ...fields } = body;
    if (!id) throw new Error('id gerekli');
    const patch = {};
    const textFields = ['slug', 'title', 'subtitle', 'author', 'publisher', 'subject', 'description', 'cover_image_url'];
    textFields.forEach((f) => { if (fields[f] !== undefined) patch[f] = sanitizeText(fields[f]); });
    if (fields.isbn !== undefined) patch.isbn = sanitizeIsbn(fields.isbn);
    if (fields.class_levels !== undefined) patch.class_levels = fields.class_levels;
    if (fields.exam_types !== undefined) patch.exam_types = fields.exam_types;
    if (fields.page_count !== undefined) patch.page_count = sanitizeInt(fields.page_count);
    if (fields.is_catalog_active !== undefined) patch.is_catalog_active = Boolean(fields.is_catalog_active);
    if (fields.metadata !== undefined) patch.metadata = fields.metadata;
    patch.updated_by = actor.sub;
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabaseAdmin.from('commerce_books').update(patch).eq('id', id).select().single();
    if (error) throw error;
    await logAudit({ entity_type: 'commerce_book', entity_id: id, action: 'update', actor_user_id: actor.sub, new_value: patch });
    return { ok: true, book: data };
  }

  if (op === 'books.delete') {
    const { id } = body;
    if (!id) throw new Error('id gerekli');
    const now = new Date().toISOString();
    const { error: offerErr } = await supabaseAdmin
      .from('commerce_vendor_offers')
      .update({ status: 'inactive', deleted_at: now, updated_at: now, updated_by: actor.sub })
      .eq('book_id', id)
      .is('deleted_at', null);
    if (offerErr) throw offerErr;
    await supabaseAdmin.from('commerce_book_package_items').delete().eq('book_id', id);
    const { error } = await supabaseAdmin
      .from('commerce_books')
      .update({ deleted_at: now, is_catalog_active: false, updated_at: now, updated_by: actor.sub })
      .eq('id', id);
    if (error) throw error;
    await logAudit({ entity_type: 'commerce_book', entity_id: id, action: 'soft_delete', actor_user_id: actor.sub });
    return { ok: true };
  }

  if (op === 'books.save') {
    const title = sanitizeText(body.title);
    if (!title) throw new Error('Ürün adı gerekli');
    const fascicle = sanitizeInt(body.fascicle_count);
    const metadata = {
      ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
    };
    if (body.series !== undefined) metadata.series = sanitizeText(body.series);
    if (body.series_label !== undefined) metadata.series_label = sanitizeText(body.series_label);
    if (fascicle) metadata.fascicle_count = fascicle;
    const inferredMeta = withInferredSeriesMetadata({
      title,
      isbn: sanitizeIsbn(body.isbn),
      slug: body.slug,
      class_levels: body.class_levels,
      metadata,
    });
    if (inferredMeta.series) metadata.series = inferredMeta.series;
    if (inferredMeta.store_kind) metadata.store_kind = inferredMeta.store_kind;
    if (inferredMeta.series_label) metadata.series_label = inferredMeta.series_label;
    const bookBody = {
      ...body,
      title,
      isbn: sanitizeIsbn(body.isbn),
      metadata,
    };
    let book;
    if (body.id) {
      const upd = await handleBooks('books.update', { ...bookBody, id: body.id }, actor);
      book = upd.book;
    } else {
      const created = await handleBooks('books.create', bookBody, actor);
      book = created.book;
    }
    const { vendor } = await ensureYankiVendor({ actorSub: actor.sub });
    const { data: existingOffer } = await supabaseAdmin
      .from('commerce_vendor_offers')
      .select('id, price_kurus, stock_quantity, shipping_days')
      .eq('vendor_id', vendor.id)
      .eq('book_id', book.id)
      .maybeSingle();
    let priceKurus = sanitizeInt(body.price_kurus);
    if (priceKurus == null && body.price_lira !== undefined && body.price_lira !== '') {
      const lira = Number(String(body.price_lira).replace(',', '.'));
      priceKurus = Number.isFinite(lira) && lira >= 0 ? Math.round(lira * 100) : 0;
    }
    if (priceKurus == null) priceKurus = existingOffer?.price_kurus ?? 0;
    const stockRaw = body.stock_quantity ?? body.stock;
    const offer = await upsertYankiOfferForExistingBook(book.id, vendor, actor.sub, {
      price_kurus: priceKurus,
      stock_quantity: stockRaw !== undefined && stockRaw !== '' ? stockRaw : existingOffer?.stock_quantity,
      shipping_days: body.shipping_days ?? existingOffer?.shipping_days,
      approveIfPriced: body.approve_if_priced !== false,
    });
    const got = await handleBooks('books.get', { id: book.id }, actor);
    return { ok: true, book: got.book, offer };
  }

  if (op === 'books.request_correction') {
    const { id, notes, reason } = body;
    if (!id) throw new Error('id gerekli');
    const note = sanitizeText(notes ?? reason);
    if (!note) throw new Error('Düzeltme notu gerekli');
    const { data: offers, error: offerErr } = await supabaseAdmin
      .from('commerce_vendor_offers')
      .select('id')
      .eq('book_id', id)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });
    if (offerErr) throw offerErr;
    let offerId = offers?.[0]?.id;
    if (!offerId) {
      const { vendor } = await ensureYankiVendor({ actorSub: actor.sub });
      const createdOffer = await upsertYankiOfferForExistingBook(id, vendor, actor.sub, {
        price_kurus: 0,
        approveIfPriced: false,
      });
      offerId = createdOffer.id;
    }
    return handleOffers('offers.request_correction', { id: offerId, notes: note }, actor);
  }

  if (op === 'books.bulk_upsert') {
    const out = await bulkUpsertBooks({
      books: body.books,
      actorSub: actor.sub,
      vendorId: body.vendor_id || null,
      approveIfPriced: body.approve_if_priced !== false,
    });
    await logAudit({
      entity_type: 'commerce_book',
      entity_id: out.vendor.id,
      action: 'bulk_upsert',
      actor_user_id: actor.sub,
      vendor_id: out.vendor.id,
      new_value: { count: out.count },
    });
    return {
      ok: true,
      vendor: { id: out.vendor.id, name: out.vendor.name, slug: out.vendor.slug },
      count: out.count,
      books: out.results.map((r) => ({
        id: r.book.id,
        title: r.book.title,
        isbn: r.book.isbn,
        offer_id: r.offer?.id,
        price_kurus: r.offer?.price_kurus,
        status: r.offer?.status,
        created: r.created,
      })),
    };
  }

  if (op === 'books.seed_lgs8_vip') {
    const out = await seedLgs8VipCatalog({
      actorSub: actor.sub,
      prices: body.prices && typeof body.prices === 'object' ? body.prices : {},
      package_price_kurus: sanitizeInt(body.package_price_kurus) || 0,
      contact_phone: sanitizeText(body.contact_phone),
    });
    await logAudit({
      entity_type: 'commerce_book',
      entity_id: out.vendor.id,
      action: 'seed_lgs8_vip',
      actor_user_id: actor.sub,
      vendor_id: out.vendor.id,
      new_value: { book_count: out.books.length },
    });
    return { ok: true, ...out };
  }

  if (op === 'books.seed_lgs8_vip_set') {
    const out = await seedLgs8VipSet({
      actorSub: actor.sub,
      price_kurus: sanitizeInt(body.price_kurus) || 0,
      stock_quantity: sanitizeInt(body.stock_quantity) || 100,
      contact_phone: sanitizeText(body.contact_phone),
    });
    await logAudit({
      entity_type: 'commerce_book',
      entity_id: out.book.id,
      action: 'seed_lgs8_vip_set',
      actor_user_id: actor.sub,
      vendor_id: out.vendor.id,
      new_value: { isbn: out.book.isbn, status: out.book.status },
    });
    return { ok: true, ...out };
  }

  if (op === 'books.seed_lgs8_paraf_iq') {
    const out = await seedLgs8ParafIqSet({
      actorSub: actor.sub,
      price_kurus: sanitizeInt(body.price_kurus) || 0,
      stock_quantity: sanitizeInt(body.stock_quantity) || 100,
      contact_phone: sanitizeText(body.contact_phone),
    });
    await logAudit({
      entity_type: 'commerce_book',
      entity_id: out.book.id,
      action: 'seed_lgs8_paraf_iq',
      actor_user_id: actor.sub,
      vendor_id: out.vendor.id,
      new_value: { isbn: out.book.isbn, status: out.book.status },
    });
    return { ok: true, ...out };
  }

  if (op === 'books.seed_lgs8_deneme_kulubu') {
    const out = await seedLgs8DenemeKulubu({
      actorSub: actor.sub,
      price_kurus: sanitizeInt(body.price_kurus) || 0,
      stock_quantity: sanitizeInt(body.stock_quantity) || 100,
      contact_phone: sanitizeText(body.contact_phone),
    });
    await logAudit({
      entity_type: 'commerce_book',
      entity_id: out.book.id,
      action: 'seed_lgs8_deneme_kulubu',
      actor_user_id: actor.sub,
      vendor_id: out.vendor.id,
      new_value: { isbn: out.book.isbn, status: out.book.status },
    });
    return { ok: true, ...out };
  }

  throw new Error(`Bilinmeyen operasyon: ${op}`);
}

// ─────────────────────────────────────────────
// Satıcı teklifleri (onay/ret)
// ─────────────────────────────────────────────
async function handleOffers(op, body, actor) {
  if (op === 'offers.list') {
    let q = supabaseAdmin
      .from('commerce_vendor_offers')
      .select('*, commerce_books(id, title, isbn, cover_image_url), commerce_vendors(id, name)')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });
    if (body.status) q = q.eq('status', body.status);
    if (body.vendor_id) q = q.eq('vendor_id', body.vendor_id);
    if (body.book_id) q = q.eq('book_id', body.book_id);
    if (body.limit) q = q.limit(parseInt(body.limit, 10));
    const { data, error } = await q;
    if (error) throw error;
    return { ok: true, offers: attachOfferRelationsList(data) };
  }

  if (op === 'offers.get') {
    const { id } = body;
    if (!id) throw new Error('id gerekli');
    const { data, error } = await supabaseAdmin
      .from('commerce_vendor_offers')
      .select('*, commerce_books(*), commerce_vendors(*)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return { ok: true, offer: attachOfferRelations(data) };
  }

  const APPROVAL_OPS = ['offers.approve', 'offers.reject', 'offers.request_correction', 'offers.inactive'];
  if (APPROVAL_OPS.includes(op)) {
    const { id, reason, notes } = body;
    if (!id) throw new Error('id gerekli');
    const { data: offer } = await supabaseAdmin.from('commerce_vendor_offers').select('*').eq('id', id).single();
    if (!offer) throw new Error('Teklif bulunamadı');
    let statusPatch, action;
    if (op === 'offers.approve') {
      statusPatch = { status: 'approved', approved_at: new Date().toISOString(), approved_by: actor.sub, rejection_reason: null, correction_notes: null };
      action = 'approve';
    } else if (op === 'offers.reject') {
      statusPatch = { status: 'rejected', rejection_reason: sanitizeText(reason), correction_notes: null };
      action = 'reject';
    } else if (op === 'offers.request_correction') {
      statusPatch = { status: 'correction_requested', correction_notes: sanitizeText(notes ?? reason) };
      action = 'request_correction';
    } else {
      statusPatch = { status: 'inactive' };
      action = 'set_inactive';
    }
    statusPatch.updated_at = new Date().toISOString();
    statusPatch.updated_by = actor.sub;
    const { data, error } = await supabaseAdmin.from('commerce_vendor_offers').update(statusPatch).eq('id', id).select().single();
    if (error) throw error;
    // Teklif onaylandığında kitabı katalogda görünür yap + boş seriyi doldur
    if (op === 'offers.approve' && offer.book_id) {
      const { data: bookRow } = await supabaseAdmin
        .from('commerce_books')
        .select('id, title, isbn, slug, class_levels, metadata')
        .eq('id', offer.book_id)
        .maybeSingle();
      const patch = {
        is_catalog_active: true,
        updated_at: new Date().toISOString(),
        updated_by: actor.sub,
      };
      if (bookRow) patch.metadata = withInferredSeriesMetadata(bookRow);
      await supabaseAdmin.from('commerce_books').update(patch).eq('id', offer.book_id);
    }
    await logAudit({ entity_type: 'commerce_vendor_offer', entity_id: id, action, actor_user_id: actor.sub, vendor_id: offer.vendor_id, old_value: { status: offer.status }, new_value: { status: data.status, reason } });
    return { ok: true, offer: data };
  }

  if (op === 'offers.update') {
    const { id, ...fields } = body;
    if (!id) throw new Error('id gerekli');
    const patch = {};
    if (fields.is_featured !== undefined) patch.is_featured = Boolean(fields.is_featured);
    if (fields.is_bestseller !== undefined) patch.is_bestseller = Boolean(fields.is_bestseller);
    if (fields.is_new_arrival !== undefined) patch.is_new_arrival = Boolean(fields.is_new_arrival);
    if (fields.teacher_recommended !== undefined) patch.teacher_recommended = Boolean(fields.teacher_recommended);
    if (fields.required_for_classes !== undefined) patch.required_for_classes = fields.required_for_classes;
    if (fields.visibility_scope !== undefined) patch.visibility_scope = fields.visibility_scope;
    if (fields.price_kurus !== undefined) patch.price_kurus = sanitizeInt(fields.price_kurus) ?? 0;
    if (fields.compare_at_price_kurus !== undefined) patch.compare_at_price_kurus = sanitizeInt(fields.compare_at_price_kurus);
    if (fields.stock_quantity !== undefined) patch.stock_quantity = sanitizeInt(fields.stock_quantity) ?? 0;
    if (fields.shipping_days !== undefined) patch.shipping_days = sanitizeInt(fields.shipping_days) ?? 3;
    if (fields.status !== undefined) patch.status = sanitizeText(fields.status);
    patch.updated_by = actor.sub;
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabaseAdmin.from('commerce_vendor_offers').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return { ok: true, offer: data };
  }

  throw new Error(`Bilinmeyen operasyon: ${op}`);
}

// ─────────────────────────────────────────────
// Siparişler (Süper Admin okuma + durum güncelleme)
// ─────────────────────────────────────────────
async function handleOrders(op, body, actor) {
  if (op === 'orders.import_kitap_form') {
    const since = sanitizeText(body.since) || DEFAULT_SINCE;
    const dryRun = body.dry_run === true || body.dryRun === true;
    const limit = Math.min(parseInt(body.limit ?? 500, 10), 1000);
    const repair = body.repair !== false;
    const out = await importKitapFormOrdersToYanki({
      since,
      dryRun,
      limit,
      actorSub: actor?.sub || null,
      repair,
    });
    return out;
  }

  if (op === 'orders.push_to_yanki') {
    const query = sanitizeText(body.query) || sanitizeText(body.name) || null;
    const orderId = sanitizeText(body.order_id) || sanitizeText(body.orderId) || null;
    if (!query && !orderId) throw new Error('query (ad soyad) veya order_id gerekli');
    const dryRun = body.dry_run === true || body.dryRun === true;
    const out = await pushPaidOrdersToYanki({
      query,
      orderId,
      since: sanitizeText(body.since) || DEFAULT_SINCE,
      dryRun,
      forcePending: body.force_pending !== false,
      actorSub: actor?.sub || null,
    });
    return out;
  }

  if (op === 'orders.sync_whatsapp_template') {
    const activated = await activateBookOrderMetaTemplate();
    return {
      ok: true,
      deployMarker: 'meta-template-submit-2026-08-30',
      template: {
        name: activated.meta_template_name,
        language: activated.meta_template_language,
        is_active: activated.template?.is_active !== false,
        channel: activated.channel,
        meta_configured: Boolean(activated.meta_configured),
        status: activated.submitted?.status || activated.template?.whatsapp_template_status || null,
      },
      submitted: activated.submitted || null,
      sync_warning: activated.sync_warning || null,
    };
  }

  if (op === 'orders.list') {
    let q = supabaseAdmin
      .from('commerce_orders')
      .select('*, commerce_order_items(id, title_snapshot, quantity, unit_price_kurus, vendor_id), commerce_payments(id, provider, status, raw_response, paid_at)')
      .order('created_at', { ascending: false });
    if (body.status) q = q.eq('status', body.status);
    if (body.student_id) q = q.eq('student_id', body.student_id);
    if (body.search) q = q.or(`customer_name.ilike.%${body.search}%,order_number.ilike.%${body.search}%`);
    const limit = Math.min(parseInt(body.limit ?? 50, 10), 200);
    const offset = parseInt(body.offset ?? 0, 10);
    q = q.range(offset, offset + limit - 1);
    const { data, error } = await q;
    if (error) throw error;
    return { ok: true, orders: (data || []).map(decorateOrderWithIbanReceipt), deployMarker: 'kitap-iban-dekont-siparis-2026-08-29' };
  }

  if (op === 'orders.get') {
    const { id } = body;
    if (!id) throw new Error('id gerekli');
    const { data, error } = await supabaseAdmin
      .from('commerce_orders')
      .select(`
        *,
        commerce_order_items(*),
        commerce_vendor_orders(*, commerce_shipments(*), commerce_vendors(id, name)),
        commerce_order_addresses(*),
        commerce_payments(*)
      `)
      .eq('id', id)
      .single();
    if (error) throw error;
    return { ok: true, order: decorateOrderWithIbanReceipt(data) };
  }

  if (op === 'orders.update') {
    const { id } = body;
    if (!id) throw new Error('id gerekli');
    const patch = { updated_at: new Date().toISOString() };
    if (body.customer_name !== undefined) patch.customer_name = sanitizeText(body.customer_name);
    if (body.customer_email !== undefined) patch.customer_email = sanitizeText(body.customer_email);
    if (body.customer_phone !== undefined) patch.customer_phone = sanitizeText(body.customer_phone);
    if (body.notes !== undefined) patch.notes = sanitizeText(body.notes);
    if (body.payment_status !== undefined) {
      const ps = sanitizeText(body.payment_status);
      if (ps) patch.payment_status = ps;
    }
    if (body.status) {
      const VALID = [
        'pending_payment',
        'paid',
        'confirmed',
        'preparing',
        'shipped',
        'delivered',
        'cancelled',
        'refund_requested',
        'refunded',
        'payment_failed',
      ];
      if (!VALID.includes(body.status)) throw new Error('Geçersiz durum');
      patch.status = body.status;
      // Admin «ödendi» derse satıcı paneli payment_status=paid bekler
      if (body.status === 'paid' && body.payment_status === undefined) {
        patch.payment_status = 'paid';
        patch.paid_at = patch.paid_at || new Date().toISOString();
      }
    }
    const { data, error } = await supabaseAdmin
      .from('commerce_orders')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    if (String(data.payment_status || '').toLowerCase() === 'paid' || String(data.status || '').toLowerCase() === 'paid') {
      try {
        const { vendor } = await ensureYankiVendor({ actorSub: actor?.sub || null });
        const { ensureVendorOrderForPaidOrder } = await import('../api/_lib/commerce-push-paid-to-vendor.js');
        await ensureVendorOrderForPaidOrder(id, { vendorId: vendor.id, preferPending: true });
      } catch (e) {
        console.warn('[commerce-admin] ensure vendor order after update failed', e?.message || e);
      }
    }

    return { ok: true, order: data };
  }

  if (op === 'orders.delete') {
    const { id } = body;
    if (!id) throw new Error('id gerekli');
    const { data: existing, error: loadErr } = await supabaseAdmin
      .from('commerce_orders')
      .select('id, status, payment_status, order_number')
      .eq('id', id)
      .maybeSingle();
    if (loadErr) throw loadErr;
    if (!existing) throw new Error('Sipariş bulunamadı');
    const paid = existing.payment_status === 'paid' || existing.status === 'paid';
    if (paid && existing.status !== 'cancelled' && existing.status !== 'refunded') {
      throw new Error('Ödenmiş sipariş silinemez — önce iptal veya iade edin');
    }
    await supabaseAdmin.from('commerce_order_items').delete().eq('order_id', id);
    await supabaseAdmin.from('commerce_order_addresses').delete().eq('order_id', id);
    await supabaseAdmin.from('commerce_payments').delete().eq('order_id', id);
    const { data: vos } = await supabaseAdmin.from('commerce_vendor_orders').select('id').eq('order_id', id);
    for (const vo of vos || []) {
      await supabaseAdmin.from('commerce_shipments').delete().eq('vendor_order_id', vo.id);
    }
    await supabaseAdmin.from('commerce_vendor_orders').delete().eq('order_id', id);
    const { error } = await supabaseAdmin.from('commerce_orders').delete().eq('id', id);
    if (error) throw error;
    return { ok: true, deleted: true, order_number: existing.order_number };
  }

  if (op === 'orders.update_status') {
    const { id, status, notes } = body;
    const VALID = ['confirmed', 'cancelled', 'refund_requested', 'refunded'];
    if (!VALID.includes(status)) throw new Error('Geçersiz durum');
    const { data, error } = await supabaseAdmin
      .from('commerce_orders')
      .update({ status, notes: notes ?? undefined, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return { ok: true, order: data };
  }

  if (op === 'vendor_orders.update_status') {
    const { id, status } = body;
    const VALID = ['confirmed', 'preparing', 'shipped', 'delivered', 'cancelled'];
    if (!VALID.includes(status)) throw new Error('Geçersiz durum');
    const now = new Date().toISOString();
    const patch = { status, updated_at: now };
    if (status === 'confirmed') patch.accepted_at = now;
    if (status === 'preparing') patch.prepared_at = now;
    if (status === 'shipped') patch.shipped_at = now;
    if (status === 'delivered') patch.delivered_at = now;
    const { data, error } = await supabaseAdmin.from('commerce_vendor_orders').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return { ok: true, vendor_order: data };
  }

  throw new Error(`Bilinmeyen operasyon: ${op}`);
}

// ─────────────────────────────────────────────
// Kargo
// ─────────────────────────────────────────────
async function handleShipments(op, body) {
  if (op === 'shipments.create') {
    const { vendor_order_id } = body;
    if (!vendor_order_id) throw new Error('vendor_order_id gerekli');
    const { data, error } = await supabaseAdmin
      .from('commerce_shipments')
      .insert({
        vendor_order_id,
        carrier: sanitizeText(body.carrier),
        tracking_number: sanitizeText(body.tracking_number),
        tracking_url: sanitizeText(body.tracking_url),
        invoice_number: sanitizeText(body.invoice_number),
        invoice_url: sanitizeText(body.invoice_url),
        status: 'shipped',
        shipped_at: new Date().toISOString(),
        notes: sanitizeText(body.notes),
      })
      .select()
      .single();
    if (error) throw error;
    // Satıcı siparişini güncelle
    await supabaseAdmin.from('commerce_vendor_orders').update({ status: 'shipped', shipped_at: new Date().toISOString() }).eq('id', vendor_order_id);
    return { ok: true, shipment: data };
  }

  if (op === 'shipments.update') {
    const { id, ...fields } = body;
    if (!id) throw new Error('id gerekli');
    const patch = {};
    ['carrier', 'tracking_number', 'tracking_url', 'invoice_number', 'invoice_url', 'notes'].forEach((f) => {
      if (fields[f] !== undefined) patch[f] = sanitizeText(fields[f]);
    });
    if (fields.status) patch.status = fields.status;
    if (fields.status === 'delivered') patch.delivered_at = new Date().toISOString();
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabaseAdmin.from('commerce_shipments').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return { ok: true, shipment: data };
  }

  throw new Error(`Bilinmeyen operasyon: ${op}`);
}

// ─────────────────────────────────────────────
// Hakedişler
// ─────────────────────────────────────────────
async function handlePayouts(op, body, actor) {
  if (op === 'payouts.list') {
    let q = supabaseAdmin
      .from('commerce_vendor_payouts')
      .select('*, commerce_vendors(id, name)')
      .order('period_end', { ascending: false });
    if (body.vendor_id) q = q.eq('vendor_id', body.vendor_id);
    if (body.status) q = q.eq('status', body.status);
    const { data, error } = await q;
    if (error) throw error;
    return { ok: true, payouts: data };
  }

  if (op === 'payouts.create') {
    const { vendor_id, period_start, period_end } = body;
    if (!vendor_id || !period_start || !period_end) throw new Error('vendor_id, period_start, period_end gerekli');
    // Teslim edilen siparişlerden net hesaplama
    const { data: items } = await supabaseAdmin
      .from('commerce_vendor_orders')
      .select('vendor_net_kurus, commission_kurus')
      .eq('vendor_id', vendor_id)
      .eq('status', 'delivered')
      .gte('delivered_at', period_start)
      .lte('delivered_at', period_end);
    const gross = (items ?? []).reduce((s, r) => s + (r.vendor_net_kurus + r.commission_kurus), 0);
    const commission = (items ?? []).reduce((s, r) => s + r.commission_kurus, 0);
    const net = gross - commission;
    const { data, error } = await supabaseAdmin
      .from('commerce_vendor_payouts')
      .insert({ vendor_id, period_start, period_end, gross_sales_kurus: gross, commission_kurus: commission, net_payout_kurus: net, status: 'pending', created_by: actor.sub })
      .select()
      .single();
    if (error) throw error;
    return { ok: true, payout: data };
  }

  if (op === 'payouts.approve') {
    const { id } = body;
    if (!id) throw new Error('id gerekli');
    const { data, error } = await supabaseAdmin
      .from('commerce_vendor_payouts')
      .update({ status: 'approved', approved_by: actor.sub, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return { ok: true, payout: data };
  }

  if (op === 'payouts.mark_paid') {
    const { id, payment_reference } = body;
    if (!id) throw new Error('id gerekli');
    const { data, error } = await supabaseAdmin
      .from('commerce_vendor_payouts')
      .update({ status: 'paid', paid_at: new Date().toISOString(), payment_reference: sanitizeText(payment_reference), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return { ok: true, payout: data };
  }

  throw new Error(`Bilinmeyen operasyon: ${op}`);
}

// ─────────────────────────────────────────────
// Kuponlar
// ─────────────────────────────────────────────
async function handleCoupons(op, body, actor) {
  if (op === 'coupons.list') {
    const { data, error } = await supabaseAdmin
      .from('commerce_coupons')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return { ok: true, coupons: data };
  }

  if (op === 'coupons.create') {
    if (!body.code || !body.discount_type || !body.discount_value) throw new Error('code, discount_type, discount_value gerekli');
    if (!['percent', 'fixed'].includes(body.discount_type)) throw new Error('discount_type percent veya fixed olmalı');
    const { data, error } = await supabaseAdmin
      .from('commerce_coupons')
      .insert({
        code: String(body.code).toUpperCase().trim(),
        description: sanitizeText(body.description),
        discount_type: body.discount_type,
        discount_value: parseInt(body.discount_value, 10),
        max_discount_kurus: sanitizeInt(body.max_discount_kurus),
        min_order_kurus: sanitizeInt(body.min_order_kurus) ?? 0,
        usage_limit: sanitizeInt(body.usage_limit),
        per_user_limit: sanitizeInt(body.per_user_limit) ?? 1,
        starts_at: body.starts_at ?? null,
        ends_at: body.ends_at ?? null,
        is_active: body.is_active !== false,
        created_by: actor.sub,
      })
      .select()
      .single();
    if (error) throw error;
    return { ok: true, coupon: data };
  }

  if (op === 'coupons.update') {
    const { id, ...fields } = body;
    if (!id) throw new Error('id gerekli');
    const patch = {};
    if (fields.description !== undefined) patch.description = sanitizeText(fields.description);
    if (fields.is_active !== undefined) patch.is_active = Boolean(fields.is_active);
    if (fields.ends_at !== undefined) patch.ends_at = fields.ends_at;
    if (fields.starts_at !== undefined) patch.starts_at = fields.starts_at;
    if (fields.usage_limit !== undefined) patch.usage_limit = sanitizeInt(fields.usage_limit);
    if (fields.per_user_limit !== undefined) patch.per_user_limit = sanitizeInt(fields.per_user_limit);
    if (fields.discount_type !== undefined) {
      if (!['percent', 'fixed'].includes(fields.discount_type)) throw new Error('discount_type percent veya fixed olmalı');
      patch.discount_type = fields.discount_type;
    }
    if (fields.discount_value !== undefined) patch.discount_value = parseInt(fields.discount_value, 10);
    if (fields.max_discount_kurus !== undefined) patch.max_discount_kurus = sanitizeInt(fields.max_discount_kurus);
    if (fields.min_order_kurus !== undefined) patch.min_order_kurus = sanitizeInt(fields.min_order_kurus) ?? 0;
    if (fields.code !== undefined) patch.code = String(fields.code).toUpperCase().trim();
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabaseAdmin.from('commerce_coupons').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return { ok: true, coupon: data };
  }

  if (op === 'coupons.delete') {
    const { id } = body;
    const { error } = await supabaseAdmin.from('commerce_coupons').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    return { ok: true };
  }

  throw new Error(`Bilinmeyen operasyon: ${op}`);
}

// ─────────────────────────────────────────────
// Ayarlar
// ─────────────────────────────────────────────
async function handleSettings(op, body, actor) {
  if (op === 'settings.get') {
    const { data, error } = await supabaseAdmin
      .from('commerce_settings')
      .select('*')
      .is('institution_id', null)
      .maybeSingle();
    if (error) throw error;
    const store_browse = normalizeStoreBrowse(data?.meta?.store_browse);
    return { ok: true, settings: data, store_browse };
  }

  if (op === 'settings.update') {
    const { data: current, error: currentErr } = await supabaseAdmin
      .from('commerce_settings')
      .select('*')
      .is('institution_id', null)
      .maybeSingle();
    if (currentErr) throw currentErr;
    if (!current) throw new Error('Mağaza ayarları bulunamadı');

    const patch = {};
    const FIELDS = ['commerce_mode', 'default_commission_rate', 'free_shipping_threshold_kurus', 'default_shipping_kurus', 'order_number_prefix', 'public_store_enabled', 'student_store_enabled', 'payment_sandbox', 'abandoned_cart_hours'];
    FIELDS.forEach((f) => { if (body[f] !== undefined) patch[f] = body[f]; });

    if (body.store_browse !== undefined) {
      const meta = (current.meta && typeof current.meta === 'object' && !Array.isArray(current.meta))
        ? { ...current.meta }
        : {};
      meta.store_browse = body.store_browse === null
        ? defaultStoreBrowse()
        : normalizeStoreBrowse(body.store_browse);
      patch.meta = meta;
    }

    patch.updated_by = actor.sub;
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('commerce_settings')
      .update(patch)
      .is('institution_id', null)
      .select()
      .single();
    if (error) throw error;
    await logAudit({ entity_type: 'commerce_settings', entity_id: data.id, action: 'update', actor_user_id: actor.sub, new_value: patch });
    return { ok: true, settings: data, store_browse: normalizeStoreBrowse(data?.meta?.store_browse) };
  }

  throw new Error(`Bilinmeyen operasyon: ${op}`);
}

// ─────────────────────────────────────────────
// Raporlar
// ─────────────────────────────────────────────
async function handleReports(op, body) {
  if (op === 'reports.sales') {
    const { from_date, to_date } = body;
    let q = supabaseAdmin
      .from('commerce_orders')
      .select('id, order_number, total_kurus, status, created_at, student_id')
      .in('status', ['paid', 'confirmed', 'preparing', 'shipped', 'delivered']);
    if (from_date) q = q.gte('created_at', from_date);
    if (to_date) q = q.lte('created_at', to_date);
    q = q.order('created_at', { ascending: false }).limit(500);
    const { data, error } = await q;
    if (error) throw error;
    const total = (data ?? []).reduce((s, r) => s + r.total_kurus, 0);
    return { ok: true, orders: data, total_kurus: total, count: (data ?? []).length };
  }

  if (op === 'reports.low_stock') {
    const { data, error } = await supabaseAdmin
      .from('commerce_vendor_offers')
      .select('*, commerce_books(title, isbn), commerce_vendors(name)')
      .eq('status', 'approved')
      .filter('stock_quantity', 'lte', 'low_stock_threshold')
      .is('deleted_at', null)
      .order('stock_quantity', { ascending: true })
      .limit(100);
    if (error) throw error;
    return { ok: true, offers: attachOfferRelationsList(data) };
  }

  if (op === 'reports.vendors') {
    const { data, error } = await supabaseAdmin
      .from('commerce_vendor_orders')
      .select('vendor_id, vendor_net_kurus, commission_kurus, status, created_at, commerce_vendors(name)')
      .in('status', ['delivered'])
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    return { ok: true, vendor_orders: data };
  }

  throw new Error(`Bilinmeyen operasyon: ${op}`);
}

// ─────────────────────────────────────────────
// Paketler
// ─────────────────────────────────────────────
async function handlePackages(op, body, actor) {
  if (op === 'packages.list') {
    const { data, error } = await supabaseAdmin
      .from('commerce_book_packages')
      .select('*, commerce_book_package_items(id, book_id, quantity, is_required, sort_order)')
      .is('deleted_at', null)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return { ok: true, packages: data };
  }

  if (op === 'packages.get') {
    if (!body.id) throw new Error('id gerekli');
    const { data, error } = await supabaseAdmin
      .from('commerce_book_packages')
      .select('*, commerce_book_package_items(*, commerce_books(id, title, isbn, cover_image_url))')
      .eq('id', body.id)
      .single();
    if (error) throw error;
    return { ok: true, package: data };
  }

  if (op === 'packages.create') {
    if (!body.name) throw new Error('name gerekli');
    const slug =
      sanitizeText(body.slug) ||
      sanitizeText(body.name)
        ?.toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
    const { data, error } = await supabaseAdmin
      .from('commerce_book_packages')
      .insert({
        name: sanitizeText(body.name),
        slug,
        description: sanitizeText(body.description),
        class_level: sanitizeText(body.class_level),
        program: sanitizeText(body.program),
        price_kurus: sanitizeInt(body.price_kurus) ?? 0,
        compare_at_price_kurus: sanitizeInt(body.compare_at_price_kurus),
        cover_image_url: sanitizeText(body.cover_image_url),
        is_active: body.is_active === true && (sanitizeInt(body.price_kurus) || 0) > 0,
        sort_order: sanitizeInt(body.sort_order) ?? 0,
        institution_id: body.institution_id ?? null,
        created_by: actor.sub,
        updated_by: actor.sub,
      })
      .select()
      .single();
    if (error) throw error;
    return { ok: true, package: data };
  }

  if (op === 'packages.update') {
    const { id, ...fields } = body;
    if (!id) throw new Error('id gerekli');
    const patch = { updated_by: actor.sub, updated_at: new Date().toISOString() };
    ['name', 'slug', 'description', 'class_level', 'program', 'cover_image_url'].forEach((f) => {
      if (fields[f] !== undefined) patch[f] = sanitizeText(fields[f]);
    });
    if (fields.price_kurus !== undefined) patch.price_kurus = sanitizeInt(fields.price_kurus) ?? 0;
    if (fields.compare_at_price_kurus !== undefined) patch.compare_at_price_kurus = sanitizeInt(fields.compare_at_price_kurus);
    if (fields.is_active !== undefined) patch.is_active = Boolean(fields.is_active);
    if (fields.sort_order !== undefined) patch.sort_order = sanitizeInt(fields.sort_order) ?? 0;
    const { data, error } = await supabaseAdmin.from('commerce_book_packages').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return { ok: true, package: data };
  }

  if (op === 'packages.delete') {
    if (!body.id) throw new Error('id gerekli');
    const { error } = await supabaseAdmin
      .from('commerce_book_packages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', body.id);
    if (error) throw error;
    return { ok: true };
  }

  if (op === 'packages.items.set') {
    if (!body.package_id || !Array.isArray(body.items)) throw new Error('package_id ve items gerekli');
    await supabaseAdmin.from('commerce_book_package_items').delete().eq('package_id', body.package_id);
    if (body.items.length) {
      const { error } = await supabaseAdmin.from('commerce_book_package_items').insert(
        body.items.map((it, idx) => ({
          package_id: body.package_id,
          book_id: it.book_id,
          vendor_offer_id: it.vendor_offer_id ?? null,
          quantity: sanitizeInt(it.quantity) || 1,
          is_required: it.is_required !== false,
          sort_order: sanitizeInt(it.sort_order) ?? idx,
        }))
      );
      if (error) throw error;
    }
    return { ok: true };
  }

  throw new Error(`Bilinmeyen operasyon: ${op}`);
}

// ─────────────────────────────────────────────
// Ana handler
// ─────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 405, 'Method Not Allowed');
  try {
    const actor = requireAuth(req);
    const roleSet = await actorRoleSet(actor);
    if (!roleSetHasSuperAdmin(roleSet) && !roleSetHasAdmin(roleSet)) {
      return err(res, 403, 'Yetki yok');
    }

    const body = req.body ?? {};
    const op = String(body.op ?? '').trim();
    if (!op) return err(res, 400, 'op gerekli');

    let result;
    const prefix = op.split('.')[0];
    if (prefix === 'vendors' || prefix === 'vendor_users') {
      if (prefix === 'vendor_users') {
        result = await handleVendorUsers(op, body, actor);
      } else {
        result = await handleVendors(op, body, actor);
      }
    } else if (prefix === 'books') {
      result = await handleBooks(op, body, actor);
    } else if (prefix === 'offers') {
      result = await handleOffers(op, body, actor);
    } else if (prefix === 'orders' || op === 'vendor_orders.update_status') {
      result = await handleOrders(op, body, actor);
    } else if (prefix === 'shipments') {
      result = await handleShipments(op, body);
    } else if (prefix === 'payouts') {
      result = await handlePayouts(op, body, actor);
    } else if (prefix === 'coupons') {
      result = await handleCoupons(op, body, actor);
    } else if (prefix === 'settings') {
      result = await handleSettings(op, body, actor);
    } else if (prefix === 'packages') {
      result = await handlePackages(op, body, actor);
    } else if (prefix === 'reports') {
      result = await handleReports(op, body);
    } else {
      return err(res, 400, `Bilinmeyen operasyon: ${op}`);
    }

    return res.status(200).json(result);
  } catch (e) {
    console.error('[commerce-admin]', e?.message || e);
    const raw = String(e?.message || 'sunucu_hatası');
    const message = /duplicate key|unique constraint/i.test(raw)
      ? 'Bu kitap zaten kayıtlı (ISBN veya slug). Silinmiş kaydı güncellemeyi deneyin veya farklı ad kullanın.'
      : raw;
    return err(res, 500, message);
  }
}
