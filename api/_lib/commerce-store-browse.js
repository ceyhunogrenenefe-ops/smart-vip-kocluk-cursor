/**
 * Öğrenci kitap mağazası — sınıf → kategori → kitap gezinmesi.
 * Süper admin `commerce_settings.meta.store_browse` ile tanımlar.
 * Kayıt yoksa LGS-8 VIP / Paraf / Deneme varsayılanı kullanılır.
 */

import { LGS8_COLLECTIONS, LGS8_DENEME_SERIES, LGS8_DENEME_SET_ISBN, LGS8_DENEME_SET_SLUG, slugifyTr } from './commerce-lgs8-catalog.js';

export const STORE_BROWSE_MAX_CLASSES = 40;
export const STORE_BROWSE_MAX_CATEGORIES = 80;

export const DEFAULT_STORE_CLASSES = [
  { key: '5', label: '5. Sınıf', sort: 5, active: true },
  { key: '6', label: '6. Sınıf', sort: 6, active: true },
  { key: '7', label: '7. Sınıf', sort: 7, active: true },
  { key: '8', label: '8. Sınıf', sort: 8, active: true },
  { key: 'LGS', label: 'LGS', sort: 9, active: true },
  { key: '9', label: '9. Sınıf', sort: 10, active: true },
  { key: '10', label: '10. Sınıf', sort: 11, active: true },
  { key: '11', label: '11. Sınıf', sort: 12, active: true },
  { key: '12', label: '12. Sınıf', sort: 13, active: true },
  { key: 'TYT', label: 'TYT', sort: 14, active: true },
  { key: 'AYT', label: 'AYT', sort: 15, active: true },
];

export function defaultStoreCategories() {
  return LGS8_COLLECTIONS.map((col, idx) => ({
    key: col.key,
    label: col.label,
    class_keys: ['8', 'LGS'],
    series: col.key,
    description: col.description || '',
    sort: idx + 1,
    active: true,
  }));
}

export function defaultStoreBrowse() {
  return {
    classes: DEFAULT_STORE_CLASSES.map((c) => ({ ...c })),
    categories: defaultStoreCategories(),
  };
}

const PRESERVE_CLASS_KEYS = new Set(['LGS', 'TYT', 'AYT', 'YOS', 'YKS']);

function sanitizeKey(value, fallback = '') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  if (/^\d{1,2}$/.test(raw)) return raw;
  const up = raw.toLocaleUpperCase('tr');
  if (PRESERVE_CLASS_KEYS.has(up)) return up;
  const slug = slugifyTr(raw).replace(/_/g, '-').slice(0, 48);
  return slug || fallback;
}

function sanitizeLabel(value, fallback = '') {
  const s = String(value ?? '').trim().slice(0, 80);
  return s || fallback;
}

function sanitizeSort(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(-999, Math.min(9999, Math.round(n)));
}

export function classKeysEqual(a, b) {
  const left = String(a ?? '').trim().toLocaleUpperCase('tr');
  const right = String(b ?? '').trim().toLocaleUpperCase('tr');
  if (!left || !right) return false;
  if (left === right) return true;
  const ln = parseInt(left, 10);
  const rn = parseInt(right, 10);
  if (/^\d+$/.test(left) && Number.isFinite(rn) && ln === rn) return true;
  if (/^\d+$/.test(right) && Number.isFinite(ln) && ln === rn) return true;
  return false;
}

/** 8. sınıf ve LGS mağazada aynı aile. */
export function isLgsStoreClassKey(value) {
  const s = String(value ?? '').trim().toLocaleUpperCase('tr');
  if (!s) return false;
  if (s === 'LGS' || s.startsWith('8.') || s.startsWith('8 ')) return true;
  return /^\d+$/.test(s) && parseInt(s, 10) === 8;
}

export function classKeyMatchesLevels(classKey, classLevels) {
  const key = String(classKey ?? '').trim();
  if (!key) return false;
  const levels = Array.isArray(classLevels) ? classLevels : [];
  if (levels.some((lv) => classKeysEqual(key, lv))) return true;
  if (isLgsStoreClassKey(key) && levels.some((lv) => isLgsStoreClassKey(lv))) return true;
  return false;
}

export function categoryBelongsToClass(category, classKey) {
  const keys = Array.isArray(category?.class_keys) ? category.class_keys : [];
  if (keys.some((k) => classKeysEqual(k, classKey))) return true;
  if (isLgsStoreClassKey(classKey) && keys.some((k) => isLgsStoreClassKey(k))) return true;
  return false;
}

function digitsIsbn(value) {
  return String(value ?? '').replace(/[^0-9Xx]/g, '');
}

/** Deneme Kulübü kaydı yanlışlıkla VIP serisine yazılmış olsa bile Denemeler kutusuna düşer. */
export function canonicalBookSeries(book) {
  const stored = String(book?.metadata?.series ?? '').trim();
  const isbn = digitsIsbn(book?.isbn);
  const slug = String(book?.slug ?? '').toLowerCase();
  const title = String(book?.title ?? '').toLocaleLowerCase('tr');
  const denemeIsbn = digitsIsbn(LGS8_DENEME_SET_ISBN);
  const looksDeneme =
    (denemeIsbn && isbn === denemeIsbn) ||
    slug === LGS8_DENEME_SET_SLUG ||
    slug.includes('deneme-kulubu') ||
    slug.includes('deneme-klubu') ||
    title.includes('deneme kulübü') ||
    title.includes('deneme kulubu');
  if (looksDeneme) return LGS8_DENEME_SERIES;
  if (stored) return stored;
  const levels = Array.isArray(book?.class_levels) ? book.class_levels : [];
  const lgsPack =
    levels.some((lv) => isLgsStoreClassKey(lv)) ||
    title.includes('lgs') ||
    slug.includes('lgs');
  if (
    lgsPack &&
    (title.includes('deneme') || title.includes('soru bank') || title.includes('branş') || title.includes('brans'))
  ) {
    return LGS8_DENEME_SERIES;
  }
  return stored;
}

/** Serisi boşsa başlıktan/sınıftan doldur; kayıtlı seriyi ezme. */
export function withInferredSeriesMetadata(book) {
  const metadata = { ...(book?.metadata && typeof book.metadata === 'object' ? book.metadata : {}) };
  if (String(metadata.series ?? '').trim()) return metadata;
  const inferred = canonicalBookSeries({ ...book, metadata });
  if (inferred) metadata.series = inferred;
  return metadata;
}

export function bookMatchesCategory(book, category) {
  if (!book || !category) return false;
  const series = String(category.series || category.key || '').trim();
  if (!series) return false;
  const bookSeries = canonicalBookSeries(book);
  return Boolean(bookSeries) && bookSeries === series;
}

/** Serisiz kitapları her eşleşen sınıfta Diğer kutusuna koy (ilk sınıf yutmasın). */
export function attachUnmatchedStoreCategories(classes, seriesCategories, decoratedBooks) {
  const seriesMatchedIds = new Set(
    (seriesCategories || []).flatMap((cat) => (cat.books || []).map((b) => b.id))
  );
  const out = [...(seriesCategories || [])];
  for (const cl of classes || []) {
    if (cl.active === false) continue;
    const unmatched = (decoratedBooks || []).filter(
      (b) => !seriesMatchedIds.has(b.id) && classKeyMatchesLevels(cl.key, b.class_levels)
    );
    if (!unmatched.length) continue;
    const key = `${sanitizeKey(cl.key) || cl.key}-diger`;
    out.push({
      key,
      label: 'Diğer',
      class_keys: [cl.key],
      series: '',
      description: 'Serisi seçilmeden yüklenen kitaplar',
      sort: 999,
      book_count: unmatched.length,
      priced_count: unmatched.filter((b) => b.buyable).length,
      books: unmatched,
    });
  }
  return out;
}

function normalizeClass(raw, index) {
  const fallbackKey = `sinif-${index + 1}`;
  const key = sanitizeKey(raw?.key || raw?.label, fallbackKey) || fallbackKey;
  return {
    key,
    label: sanitizeLabel(raw?.label, key),
    sort: sanitizeSort(raw?.sort, index + 1),
    active: raw?.active !== false,
  };
}

function normalizeCategory(raw, index, classKeySet) {
  const fallbackKey = `kategori-${index + 1}`;
  const key = sanitizeKey(raw?.key || raw?.label || raw?.series, fallbackKey) || fallbackKey;
  const classKeys = Array.isArray(raw?.class_keys)
    ? [...new Set(raw.class_keys.map((k) => sanitizeKey(k)).filter((k) => k && classKeySet.has(k)))]
    : [];
  return {
    key,
    label: sanitizeLabel(raw?.label, key),
    class_keys: classKeys,
    series: sanitizeKey(raw?.series || raw?.key, key) || key,
    description: String(raw?.description ?? '').trim().slice(0, 200),
    sort: sanitizeSort(raw?.sort, index + 1),
    active: raw?.active !== false,
  };
}

export function normalizeStoreBrowse(input) {
  const src = input && typeof input === 'object' ? input : {};
  const fallback = defaultStoreBrowse();
  const hasCustom =
    (Array.isArray(src.classes) && src.classes.length > 0) ||
    (Array.isArray(src.categories) && src.categories.length > 0);

  const classSource = Array.isArray(src.classes) && src.classes.length ? src.classes : (hasCustom ? [] : fallback.classes);
  const seenClass = new Set();
  const classes = [];
  for (let i = 0; i < classSource.length && classes.length < STORE_BROWSE_MAX_CLASSES; i += 1) {
    const item = normalizeClass(classSource[i], i);
    const uniq = item.key.toLocaleLowerCase('tr');
    if (seenClass.has(uniq)) continue;
    seenClass.add(uniq);
    classes.push(item);
  }
  if (!classes.length) classes.push(...fallback.classes.map((c) => ({ ...c })));

  const classKeySet = new Set(classes.map((c) => c.key));
  const catSource = Array.isArray(src.categories) && src.categories.length
    ? src.categories
    : (hasCustom ? [] : fallback.categories);
  const seenCat = new Set();
  const categories = [];
  for (let i = 0; i < catSource.length && categories.length < STORE_BROWSE_MAX_CATEGORIES; i += 1) {
    const item = normalizeCategory(catSource[i], i, classKeySet);
    const uniq = item.key.toLocaleLowerCase('tr');
    if (seenCat.has(uniq)) continue;
    seenCat.add(uniq);
    categories.push(item);
  }

  classes.sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, 'tr'));
  categories.sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, 'tr'));
  return { classes, categories };
}

export function publicStoreBrowseNav(browse) {
  const nav = normalizeStoreBrowse(browse);
  return {
    classes: nav.classes.filter((c) => c.active).map((c) => ({
      key: c.key,
      label: c.label,
      sort: c.sort,
    })),
    categories: nav.categories.filter((c) => c.active).map((c) => ({
      key: c.key,
      label: c.label,
      class_keys: c.class_keys,
      series: c.series,
      description: c.description,
      sort: c.sort,
    })),
  };
}

function decorateBook(book) {
  const approved = (book.commerce_vendor_offers || []).filter(
    (o) => o.status === 'approved' && o.stock_quantity > 0
  );
  return {
    ...book,
    commerce_vendor_offers: approved,
    buyable: approved.some((o) => Number(o.price_kurus) > 0),
  };
}

async function db() {
  const { supabaseAdmin } = await import('./supabase-admin.js');
  return supabaseAdmin;
}

export async function loadStoreBrowseSettings() {
  const supabaseAdmin = await db();
  const { data, error } = await supabaseAdmin
    .from('commerce_settings')
    .select('meta')
    .is('institution_id', null)
    .maybeSingle();
  if (error) throw error;
  return normalizeStoreBrowse(data?.meta?.store_browse);
}

export async function listStoreBrowse() {
  const nav = await loadStoreBrowseSettings();
  const supabaseAdmin = await db();
  const { data: books, error } = await supabaseAdmin
    .from('commerce_books')
    .select(
      'id, slug, title, publisher, subject, class_levels, cover_image_url, description, metadata, isbn, commerce_vendor_offers(id, price_kurus, stock_quantity, status, shipping_days, commerce_vendors(id, name, slug))'
    )
    .is('deleted_at', null)
    .eq('is_catalog_active', true);
  if (error) throw error;

  const decoratedBooks = (books || []).map(decorateBook);

  const seriesCategories = nav.categories
    .filter((c) => c.active)
    .map((cat) => {
      const matched = decoratedBooks
        .filter((b) => bookMatchesCategory(b, cat))
        .sort((a, b) => (a.metadata?.sort_order || 0) - (b.metadata?.sort_order || 0));
      return {
        key: cat.key,
        label: cat.label,
        class_keys: cat.class_keys,
        series: cat.series,
        description: cat.description,
        sort: cat.sort,
        book_count: matched.length,
        priced_count: matched.filter((b) => b.buyable).length,
        books: matched,
      };
    });

  const classes = nav.classes.filter((c) => c.active);
  const categories = attachUnmatchedStoreCategories(classes, seriesCategories, decoratedBooks);

  const classRows = classes.map((cl) => {
    const cats = categories.filter((cat) => categoryBelongsToClass(cat, cl.key));
    const bookIds = new Set(cats.flatMap((cat) => cat.books.map((b) => b.id)));
    return {
      key: cl.key,
      label: cl.label,
      sort: cl.sort,
      category_count: cats.length,
      book_count: bookIds.size,
    };
  });

  return { classes: classRows, categories };
}
