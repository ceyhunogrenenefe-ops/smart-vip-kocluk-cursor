/** ISBN / slug eşleştirme — commerce_books unique constraint revive. */

export function isbnDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

/** commerce_books_slug_unique silinmiş satırları da kilitler; çakışanı serbest bırakırken kullanılır. */
export function retiredBookSlug(slug, id) {
  const base = String(slug || 'book')
    .replace(/-x-[a-f0-9]{8}$/i, '')
    .slice(0, 60);
  const short = String(id || '').replace(/-/g, '').slice(0, 8) || 'retired';
  return `${base}-x-${short}`.slice(0, 80);
}

/** ISBN veya slug çakışmasında aktif kaydı, yoksa soft-delete edilmişi seç. */
export function selectBookMatch(rows, isbn, slug) {
  const list = Array.isArray(rows) ? rows : [];
  const digits = isbnDigits(isbn);
  const slugWant = String(slug || '').trim();
  const scored = [];
  for (const r of list) {
    if (!r) continue;
    const isbnHit = Boolean(digits) && isbnDigits(r.isbn) === digits;
    const slugHit = Boolean(slugWant) && r.slug === slugWant;
    if (!isbnHit && !slugHit) continue;
    scored.push({ row: r, isbnHit, slugHit, deleted: Boolean(r.deleted_at) });
  }
  scored.sort(
    (a, b) =>
      Number(a.deleted) - Number(b.deleted) ||
      Number(b.isbnHit) - Number(a.isbnHit) ||
      Number(b.slugHit) - Number(a.slugHit),
  );
  return scored[0]?.row || null;
}

export function isUniqueViolation(error) {
  const msg = String(error?.message || error?.code || '');
  return error?.code === '23505' || /duplicate key|unique constraint/i.test(msg);
}
