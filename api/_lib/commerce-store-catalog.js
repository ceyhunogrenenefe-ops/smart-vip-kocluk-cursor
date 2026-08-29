/**
 * Öğrenci mağazası düz katalog — tüm aktif kitaplar + varsa onaylı teklif.
 * Seri kutusu eşleşmesi görünürlük kapısı değildir.
 */

import { classKeyMatchesLevels } from './commerce-store-browse.js';
import { isVipEgitimComponentBook, storeKindOfBook } from './commerce-store-kinds.js';

export function pickBestApprovedOffer(offers = []) {
  const list = Array.isArray(offers) ? offers : [];
  const buyable = list.filter(
    (o) =>
      o &&
      String(o.status || '').toLowerCase() === 'approved' &&
      Number(o.stock_quantity) > 0 &&
      Number(o.price_kurus) > 0
  );
  if (buyable.length) {
    return [...buyable].sort((a, b) => Number(a.price_kurus) - Number(b.price_kurus))[0];
  }
  const approved = list.filter((o) => o && String(o.status || '').toLowerCase() === 'approved');
  return approved[0] || null;
}

export function catalogOfferFromBook(book, offer = null) {
  if (!book || !book.id) return null;
  const vendor = offer?.commerce_vendors || { id: '', name: '' };
  if (offer && offer.id) {
    const { commerce_vendor_offers: _drop, ...bookRow } = book;
    return {
      ...offer,
      unpriced: !(Number(offer.price_kurus) > 0 && Number(offer.stock_quantity) > 0),
      commerce_books: bookRow,
      commerce_vendors: vendor
    };
  }
  const { commerce_vendor_offers: _off, ...bookRow } = book;
  return {
    id: `unpriced-${book.id}`,
    price_kurus: 0,
    compare_at_price_kurus: null,
    stock_quantity: 0,
    shipping_days: 0,
    is_featured: false,
    is_bestseller: false,
    is_new_arrival: false,
    teacher_recommended: false,
    required_for_classes: [],
    unpriced: true,
    commerce_books: bookRow,
    commerce_vendors: { id: '', name: '' }
  };
}

export function buildCatalogListRows(books = []) {
  const out = [];
  for (const book of books || []) {
    if (!book || book.deleted_at) continue;
    if (book.is_catalog_active === false) continue;
    if (isVipEgitimComponentBook(book)) continue;
    const row = catalogOfferFromBook(book, pickBestApprovedOffer(book.commerce_vendor_offers));
    if (row) out.push(row);
  }
  return out;
}

function fold(s) {
  return String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

export function filterCatalogListRows(rows = [], params = {}) {
  let list = Array.isArray(rows) ? [...rows] : [];
  const search = fold(params.search);
  const subject = String(params.subject || '').trim();
  const publisher = String(params.publisher || '').trim();
  const classLevel = String(params.class_level || '').trim();
  const series = String(params.series || '').trim();
  if (search) {
    list = list.filter((o) => {
      const b = o.commerce_books || {};
      return [b.title, b.author, b.publisher].some((v) => fold(v).includes(search));
    });
  }
  if (subject) list = list.filter((o) => String(o.commerce_books?.subject || '') === subject);
  if (publisher) list = list.filter((o) => String(o.commerce_books?.publisher || '') === publisher);
  if (classLevel) {
    list = list.filter((o) => classKeyMatchesLevels(classLevel, o.commerce_books?.class_levels));
  }
  if (series) {
    list = list.filter((o) => storeKindOfBook(o.commerce_books) === series);
  }
  if (params.teacher_recommended) list = list.filter((o) => o.teacher_recommended);
  if (params.is_featured) list = list.filter((o) => o.is_featured);
  if (params.is_bestseller) list = list.filter((o) => o.is_bestseller);
  if (params.is_new_arrival) list = list.filter((o) => o.is_new_arrival);
  if (params.price_min) list = list.filter((o) => Number(o.price_kurus) >= Number(params.price_min));
  if (params.price_max) list = list.filter((o) => Number(o.price_kurus) > 0 && Number(o.price_kurus) <= Number(params.price_max));

  const sort = params.sort || 'newest';
  if (sort === 'price_asc') {
    list.sort((a, b) => Number(a.price_kurus || 0) - Number(b.price_kurus || 0));
  } else if (sort === 'price_desc') {
    list.sort((a, b) => Number(b.price_kurus || 0) - Number(a.price_kurus || 0));
  } else {
    list.sort((a, b) => String(b.commerce_books?.created_at || '').localeCompare(String(a.commerce_books?.created_at || '')));
  }
  return list;
}
