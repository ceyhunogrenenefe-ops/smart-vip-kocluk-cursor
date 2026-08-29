/**
 * Mağaza kitap türü — her sınıfta aynı üç kutu:
 * Eğitim Setleri / Soru Bankaları / Denemeler
 */

import { VIP_LGS8_BOOKS } from './commerce-lgs8-catalog.js';

export const STORE_KIND_EGITIM = 'egitim-setleri';
export const STORE_KIND_SORU = 'soru-bankalari';
export const STORE_KIND_DENEME = 'denemeler';

export const STORE_CATEGORY_KINDS = [
  { key: STORE_KIND_EGITIM, label: 'Eğitim Setleri', description: 'Ders eğitim setleri' },
  { key: STORE_KIND_SORU, label: 'Soru Bankaları', description: 'Soru bankası ve kütüphane setleri' },
  { key: STORE_KIND_DENEME, label: 'Denemeler', description: 'Deneme ve branş denemeleri' },
];

const KIND_SET = new Set(STORE_CATEGORY_KINDS.map((k) => k.key));

const LEGACY_SERIES_TO_KIND = {
  'vip-lgs-8-egitim': STORE_KIND_EGITIM,
  'paraf-lgs-8-egitim': STORE_KIND_SORU,
  'lgs-8-denemeler': STORE_KIND_DENEME,
  'egitim-seti': STORE_KIND_EGITIM,
  'soru-bankasi': STORE_KIND_SORU,
  deneme: STORE_KIND_DENEME,
};

const OLD_PUBLISHER_CATEGORY_KEYS = new Set([
  'vip-lgs-8-egitim',
  'paraf-lgs-8-egitim',
  'lgs-8-denemeler',
]);

function fold(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

function digitsIsbn(value) {
  return String(value || '').replace(/[^0-9Xx]/g, '');
}

export function normalizeStoreKind(value) {
  const raw = String(value || '').trim().toLocaleLowerCase('tr');
  if (KIND_SET.has(raw)) return raw;
  return LEGACY_SERIES_TO_KIND[raw] || '';
}

export function inferStoreKindFromTitle(book) {
  const hay = `${fold(book?.title)} ${fold(book?.slug)}`;
  if (!hay.trim()) return '';
  if (hay.includes('deneme kulub') || hay.includes('deneme klub')) return STORE_KIND_DENEME;
  if (hay.includes('soru bank') || hay.includes('soru kutuphan')) return STORE_KIND_SORU;
  if (hay.includes('deneme')) return STORE_KIND_DENEME;
  if (hay.includes('egitim set')) return STORE_KIND_EGITIM;
  return '';
}

/** Kitap hangi kutu: eğitim seti / soru bankası / deneme. */
export function storeKindOfBook(book) {
  const fromTitle = inferStoreKindFromTitle(book);
  if (fromTitle === STORE_KIND_DENEME || fromTitle === STORE_KIND_SORU) return fromTitle;
  const md = book?.metadata && typeof book.metadata === 'object' ? book.metadata : {};
  const explicit = normalizeStoreKind(md.store_kind) || normalizeStoreKind(md.series);
  if (fromTitle === STORE_KIND_EGITIM) return STORE_KIND_EGITIM;
  return explicit || fromTitle || '';
}

export function storeKindLabel(kind) {
  const row = STORE_CATEGORY_KINDS.find((k) => k.key === kind);
  return row?.label || '';
}

/** VIP 8. sınıf eğitim setinin branş kitapları — set olarak satılacak, tek tek vitrinde yok. */
export function isVipEgitimComponentBook(book) {
  if (!book) return false;
  const slug = String(book.slug || '').toLowerCase();
  const isbn = digitsIsbn(book.isbn);
  for (const row of VIP_LGS8_BOOKS) {
    if (slug && (slug === row.slug || slug.startsWith(`${row.slug}-`))) return true;
    if (isbn && isbn === digitsIsbn(row.isbn)) return true;
  }
  const title = String(book.title || '');
  if (/VIP Yayınları 8\. Sınıf LGS .+ Eğitim Seti/i.test(title) && !/\d\s*l[iıü]/i.test(title)) {
    return true;
  }
  return false;
}

export function defaultKindCategories(classKeys) {
  const keys = Array.isArray(classKeys) ? classKeys.filter(Boolean) : [];
  return STORE_CATEGORY_KINDS.map((kind, idx) => ({
    key: kind.key,
    label: kind.label,
    class_keys: [...keys],
    series: kind.key,
    description: kind.description,
    sort: idx + 1,
    active: true,
  }));
}

export function isLegacyPublisherCategory(category) {
  const key = String(category?.key || '').trim();
  const series = String(category?.series || '').trim();
  if (OLD_PUBLISHER_CATEGORY_KEYS.has(key) || OLD_PUBLISHER_CATEGORY_KEYS.has(series)) return true;
  if (key.endsWith('-diger') || key === 'diger') return true;
  return false;
}

export function withStoreKindMetadata(book) {
  const metadata = { ...(book?.metadata && typeof book.metadata === 'object' ? book.metadata : {}) };
  const kind = storeKindOfBook({ ...book, metadata });
  if (kind) {
    metadata.store_kind = kind;
    metadata.series = kind;
    metadata.series_label = storeKindLabel(kind);
  }
  return metadata;
}
