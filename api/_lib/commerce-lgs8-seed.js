/**
 * Yankı Kitapevi + 8. sınıf VIP katalog seed / toplu upsert.
 */
import { supabaseAdmin } from './supabase-admin.js';
import {
  LGS8_COLLECTIONS,
  LGS8_DENEME_KULUBU_SET,
  PARAF_LGS8_IQ_SET,
  VIP_LGS8_BOOKS,
  VIP_LGS8_PACKAGE,
  YANKI_VENDOR_SLUG,
  normalizeBulkBookInput,
  offerStatusForPrice,
  yankiVendorDefaults,
} from './commerce-lgs8-catalog.js';
import { canonicalBookSeries } from './commerce-store-browse.js';

const DEFAULT_INSTITUTION_ID = '73323d75-eea1-4552-8bba-d50555423589';

function bookRowFromNormalized(row, actorSub) {
  return {
    isbn: row.isbn,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    author: row.author,
    publisher: row.publisher,
    subject: row.subject,
    class_levels: row.class_levels,
    exam_types: row.exam_types,
    description: row.description,
    cover_image_url: row.cover_image_url,
    is_catalog_active: row.is_catalog_active !== false,
    metadata: row.metadata || {},
    updated_by: actorSub || null,
    updated_at: new Date().toISOString(),
  };
}

export async function findLinkedYankiKitapci(institutionId) {
  const inst = String(institutionId || DEFAULT_INSTITUTION_ID).trim();
  let q = supabaseAdmin.from('kitapcilar').select('id, name, phone, institution_id, is_active').eq('is_active', true);
  if (inst) q = q.eq('institution_id', inst);
  const { data } = await q;
  const rows = data || [];
  const hit = rows.find((r) => /yank[ıi]/i.test(String(r.name || '')));
  return hit || null;
}

export async function ensureYankiVendor({ actorSub, contact_phone, institution_id } = {}) {
  const { data: existing } = await supabaseAdmin
    .from('commerce_vendors')
    .select('*')
    .eq('slug', YANKI_VENDOR_SLUG)
    .is('deleted_at', null)
    .maybeSingle();

  const kitapci = await findLinkedYankiKitapci(institution_id || DEFAULT_INSTITUTION_ID);
  const phone = contact_phone || existing?.contact_phone || kitapci?.phone || null;
  const defaults = yankiVendorDefaults({
    contact_phone: phone,
    institution_id: institution_id || existing?.institution_id || DEFAULT_INSTITUTION_ID,
    linked_kitapci_id: existing?.linked_kitapci_id || kitapci?.id || null,
  });

  if (existing) {
    const patch = {
      name: defaults.name,
      is_active: true,
      updated_by: actorSub || existing.updated_by,
      updated_at: new Date().toISOString(),
      meta: { ...(existing.meta || {}), ...defaults.meta },
    };
    if (phone && !existing.contact_phone) patch.contact_phone = phone;
    if (defaults.linked_kitapci_id && !existing.linked_kitapci_id) patch.linked_kitapci_id = defaults.linked_kitapci_id;
    if (defaults.institution_id && !existing.institution_id) patch.institution_id = defaults.institution_id;
    const { data, error } = await supabaseAdmin
      .from('commerce_vendors')
      .update(patch)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return { vendor: data, created: false, kitapci };
  }

  const { data, error } = await supabaseAdmin
    .from('commerce_vendors')
    .insert({
      ...defaults,
      created_by: actorSub || null,
      updated_by: actorSub || null,
    })
    .select()
    .single();
  if (error) throw error;
  return { vendor: data, created: true, kitapci };
}

async function findBookByIsbnOrSlug(isbn, slug) {
  if (isbn) {
    const { data } = await supabaseAdmin
      .from('commerce_books')
      .select('*')
      .eq('isbn', isbn)
      .is('deleted_at', null)
      .maybeSingle();
    if (data) return data;
  }
  if (slug) {
    const { data } = await supabaseAdmin
      .from('commerce_books')
      .select('*')
      .eq('slug', slug)
      .is('deleted_at', null)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}

export async function upsertBookAndYankiOffer(normalized, vendor, actorSub, { approveIfPriced = true } = {}) {
  const row = bookRowFromNormalized(normalized, actorSub);
  const existing = await findBookByIsbnOrSlug(row.isbn, row.slug);
  let book;
  if (existing) {
    const updateRow = { updated_by: actorSub || existing.updated_by, updated_at: new Date().toISOString(), deleted_at: null };
    for (const [k, v] of Object.entries(row)) {
      if (v === undefined || v === null || v === '') continue;
      if (k === 'metadata') continue;
      updateRow[k] = v;
    }
    const metaIncoming = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const metaClean = {};
    for (const [k, v] of Object.entries(metaIncoming)) {
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v) && v.length === 0) continue;
      metaClean[k] = v;
    }
    updateRow.metadata = { ...(existing.metadata || {}), ...metaClean };
    const { data, error } = await supabaseAdmin
      .from('commerce_books')
      .update(updateRow)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    book = data;
  } else {
    const { data, error } = await supabaseAdmin
      .from('commerce_books')
      .insert({ ...row, created_by: actorSub || null })
      .select()
      .single();
    if (error) throw error;
    book = data;
  }

  const offer = await upsertYankiOfferForExistingBook(book.id, vendor, actorSub, {
    price_kurus: normalized.price_kurus,
    stock_quantity: normalized.stock_quantity,
    shipping_days: normalized.shipping_days,
    approveIfPriced,
  });

  return { book, offer, created: !existing };
}

/** Mevcut kitap için Yankı teklifini oluşturur veya soft-delete edilmişse geri açar. */
export async function upsertYankiOfferForExistingBook(
  bookId,
  vendor,
  actorSub,
  { price_kurus = 0, stock_quantity, shipping_days, approveIfPriced = true } = {},
) {
  const price = Number(price_kurus) || 0;
  const stock = Number(stock_quantity);
  const status = offerStatusForPrice(price, { approveIfPriced });
  const offerPatch = {
    vendor_id: vendor.id,
    book_id: bookId,
    price_kurus: price,
    stock_quantity: Number.isFinite(stock) && stock >= 0 ? stock : 100,
    shipping_days: Number(shipping_days) || 3,
    status,
    updated_by: actorSub || null,
    updated_at: new Date().toISOString(),
    deleted_at: null,
  };
  if (status === 'approved') {
    offerPatch.approved_at = new Date().toISOString();
    offerPatch.approved_by = actorSub || null;
  }

  const { data: existingOffer } = await supabaseAdmin
    .from('commerce_vendor_offers')
    .select('id, status, price_kurus')
    .eq('vendor_id', vendor.id)
    .eq('book_id', bookId)
    .maybeSingle();

  if (existingOffer) {
    if (existingOffer.status === 'approved' && price <= 0) {
      delete offerPatch.status;
      delete offerPatch.approved_at;
      delete offerPatch.approved_by;
    }
    if (existingOffer.status === 'correction_requested' && status !== 'approved') {
      delete offerPatch.status;
      delete offerPatch.approved_at;
      delete offerPatch.approved_by;
    }
    if (existingOffer.status === 'pending_approval' && status !== 'approved') {
      delete offerPatch.status;
      delete offerPatch.approved_at;
      delete offerPatch.approved_by;
    }
    const { data, error } = await supabaseAdmin
      .from('commerce_vendor_offers')
      .update(offerPatch)
      .eq('id', existingOffer.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabaseAdmin
    .from('commerce_vendor_offers')
    .insert({ ...offerPatch, created_by: actorSub || null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function bulkUpsertBooks({ books, actorSub, vendorId, approveIfPriced = true } = {}) {
  if (!Array.isArray(books) || !books.length) throw new Error('books dizisi gerekli');
  const { vendor } = vendorId
    ? await (async () => {
        const { data, error } = await supabaseAdmin.from('commerce_vendors').select('*').eq('id', vendorId).single();
        if (error || !data) throw new Error('Satıcı bulunamadı');
        return { vendor: data };
      })()
    : await ensureYankiVendor({ actorSub });

  const results = [];
  for (const raw of books) {
    const normalized = raw.slug && raw.title && raw.metadata ? raw : normalizeBulkBookInput(raw);
    const out = await upsertBookAndYankiOffer(normalized, vendor, actorSub, { approveIfPriced });
    results.push(out);
  }
  return { vendor, results, count: results.length };
}

export async function upsertVipLgs8Package({ actorSub, vendor, bookByIsbn, price_kurus = 0 } = {}) {
  const items = VIP_LGS8_PACKAGE.book_isbns
    .map((isbn, idx) => {
      const book = bookByIsbn.get(isbn);
      return book
        ? {
            book_id: book.id,
            vendor_offer_id: book.offer_id || null,
            quantity: 1,
            is_required: true,
            sort_order: idx,
          }
        : null;
    })
    .filter(Boolean);
  if (!items.length) return { package: null, skipped: true };

  const pkgRow = {
    name: VIP_LGS8_PACKAGE.name,
    slug: VIP_LGS8_PACKAGE.slug,
    description: VIP_LGS8_PACKAGE.description,
    class_level: VIP_LGS8_PACKAGE.class_level,
    program: VIP_LGS8_PACKAGE.program,
    price_kurus: Number(price_kurus) || 0,
    cover_image_url: VIP_LGS8_PACKAGE.cover_image_url,
    is_active: Number(price_kurus) > 0,
    sort_order: 1,
    institution_id: vendor?.institution_id || DEFAULT_INSTITUTION_ID,
    updated_by: actorSub || null,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabaseAdmin
    .from('commerce_book_packages')
    .select('id')
    .eq('slug', VIP_LGS8_PACKAGE.slug)
    .is('deleted_at', null)
    .maybeSingle();

  let pkg;
  if (existing) {
    const { data, error } = await supabaseAdmin
      .from('commerce_book_packages')
      .update(pkgRow)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    pkg = data;
    await supabaseAdmin.from('commerce_book_package_items').delete().eq('package_id', pkg.id);
  } else {
    const { data, error } = await supabaseAdmin
      .from('commerce_book_packages')
      .insert({ ...pkgRow, created_by: actorSub || null })
      .select()
      .single();
    if (error) throw error;
    pkg = data;
  }

  const { error: itemErr } = await supabaseAdmin
    .from('commerce_book_package_items')
    .insert(items.map((it) => ({ ...it, package_id: pkg.id })));
  if (itemErr) throw itemErr;
  return { package: pkg, item_count: items.length };
}

export async function seedLgs8VipCatalog({ actorSub, prices = {}, package_price_kurus = 0, contact_phone } = {}) {
  const { vendor, created } = await ensureYankiVendor({ actorSub, contact_phone });
  const books = VIP_LGS8_BOOKS.map((b) => {
    const override = prices[b.isbn] || prices[b.slug] || {};
    return {
      ...b,
      price_kurus: Number(override.price_kurus) || 0,
      stock_quantity: Number(override.stock_quantity) || 100,
      shipping_days: 3,
    };
  });
  const upserted = await bulkUpsertBooks({ books, actorSub, vendorId: vendor.id, approveIfPriced: true });
  const bookByIsbn = new Map(
    upserted.results.map((r) => [r.book.isbn, { id: r.book.id, offer_id: r.offer?.id }])
  );
  const pkg = await upsertVipLgs8Package({
    actorSub,
    vendor,
    bookByIsbn,
    price_kurus: package_price_kurus,
  });
  return {
    vendor,
    vendor_created: created,
    books: upserted.results.map((r) => ({
      id: r.book.id,
      title: r.book.title,
      isbn: r.book.isbn,
      offer_id: r.offer?.id,
      price_kurus: r.offer?.price_kurus,
      status: r.offer?.status,
    })),
    package: pkg.package,
    collections: LGS8_COLLECTIONS,
  };
}

async function seedYankiSingleProduct(product, { actorSub, price_kurus = 0, stock_quantity = 100, contact_phone } = {}) {
  const { vendor, created } = await ensureYankiVendor({ actorSub, contact_phone });
  const out = await upsertBookAndYankiOffer(
    {
      ...product,
      price_kurus: Number(price_kurus) || 0,
      stock_quantity: Number(stock_quantity) || 100,
      shipping_days: 3,
    },
    vendor,
    actorSub,
    { approveIfPriced: true },
  );
  return {
    vendor,
    vendor_created: created,
    book: {
      id: out.book.id,
      title: out.book.title,
      isbn: out.book.isbn,
      slug: out.book.slug,
      offer_id: out.offer?.id,
      price_kurus: out.offer?.price_kurus,
      status: out.offer?.status,
    },
    offer: out.offer,
  };
}

export async function seedLgs8ParafIqSet(opts = {}) {
  return seedYankiSingleProduct(PARAF_LGS8_IQ_SET, opts);
}

export async function seedLgs8DenemeKulubu(opts = {}) {
  return seedYankiSingleProduct(LGS8_DENEME_KULUBU_SET, opts);
}

export async function listLgs8Collections() {
  const { data: books } = await supabaseAdmin
    .from('commerce_books')
    .select(
      'id, slug, title, publisher, subject, class_levels, cover_image_url, description, metadata, isbn, commerce_vendor_offers(id, price_kurus, stock_quantity, status, shipping_days, commerce_vendors(id, name, slug))'
    )
    .is('deleted_at', null)
    .eq('is_catalog_active', true);

  const bySeries = new Map();
  for (const b of books || []) {
    const series = canonicalBookSeries(b) || b.metadata?.series;
    if (!series) continue;
    if (!bySeries.has(series)) bySeries.set(series, []);
    const approved = (b.commerce_vendor_offers || []).filter((o) => o.status === 'approved' && o.stock_quantity > 0);
    bySeries.get(series).push({
      ...b,
      commerce_vendor_offers: approved,
      buyable: approved.some((o) => Number(o.price_kurus) > 0),
    });
  }

  return LGS8_COLLECTIONS.map((col) => {
    const colBooks = (bySeries.get(col.key) || []).sort(
      (a, b) => (a.metadata?.sort_order || 0) - (b.metadata?.sort_order || 0)
    );
    return {
      ...col,
      coming_soon: col.coming_soon && colBooks.length === 0,
      book_count: colBooks.length,
      priced_count: colBooks.filter((b) => b.buyable).length,
      books: colBooks,
    };
  });
}
