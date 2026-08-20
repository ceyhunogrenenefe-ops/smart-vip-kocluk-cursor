/** Kitap Mağazası — para birimi ve sipariş numarası yardımcıları */

export function formatCommerceTry(kurus) {
  const n = Number(kurus);
  if (!Number.isFinite(n)) return '₺0,00';
  const lira = n / 100;
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(lira);
}

export function liraToKurus(lira) {
  return Math.round(Number(lira) * 100);
}

export function kurusToLira(kurus) {
  const n = Number(kurus);
  if (!Number.isFinite(n)) return 0;
  return n / 100;
}

/** VIP-KTP-2026-000001 format doğrulama */
export function isValidCommerceOrderNumber(value) {
  const s = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9]+-[A-Z0-9]+-\d{4}-\d{6}$/.test(s);
}

/**
 * PostgREST gömülü join alanlarını UI'nin beklediği `book` / `vendor` alias'larına kopyala.
 * (commerce_books → book, commerce_vendors → vendor)
 */
export function attachOfferRelations(row) {
  if (!row || typeof row !== 'object') return row;
  const book = row.book ?? row.commerce_books ?? null;
  const vendor = row.vendor ?? row.commerce_vendors ?? null;
  return { ...row, book, vendor, commerce_books: book, commerce_vendors: vendor };
}

export function attachOfferRelationsList(rows) {
  return (rows ?? []).map(attachOfferRelations);
}
