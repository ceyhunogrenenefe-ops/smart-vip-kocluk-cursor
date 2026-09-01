/**
 * Sınıf paketi / set içeriği — satıcı kargoda set adıyla yetinmesin, kitap listesini görsün.
 */

function oneBook(pi) {
  const raw = pi?.commerce_books;
  const book = Array.isArray(raw) ? raw[0] : raw;
  return book && typeof book === 'object' ? book : {};
}

export function packageContentsFromRows(rows, setQty = 1) {
  const mul = Math.max(1, Number(setQty) || 1);
  return [...(rows || [])]
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
    .map((pi) => {
      const book = oneBook(pi);
      const title = String(book.title || pi.title || '').trim();
      if (!title && !book.id && !pi.book_id) return null;
      return {
        book_id: book.id || pi.book_id || null,
        title: title || 'Kitap',
        isbn: book.isbn ? String(book.isbn).trim() : null,
        author: book.author ? String(book.author).trim() : null,
        quantity: Math.max(1, Number(pi.quantity) || 1) * mul
      };
    })
    .filter(Boolean);
}

export function groupPackageContentsByPackageId(rows) {
  const buckets = new Map();
  for (const row of rows || []) {
    const id = row?.package_id;
    if (!id) continue;
    const list = buckets.get(id) || [];
    list.push(row);
    buckets.set(id, list);
  }
  const out = new Map();
  for (const [id, list] of buckets) {
    out.set(id, packageContentsFromRows(list, 1));
  }
  return out;
}

export function snapshotPackageTitle(pkgName, contents) {
  const name = String(pkgName || 'Set').trim() || 'Set';
  const books = (contents || []).map(formatContentBook);
  if (!books.length) return name;
  return `${name} (${books.length} kitap): ${books.join('; ')}`;
}

export function formatContentBook(c) {
  const isbn = c?.isbn ? ` [${c.isbn}]` : '';
  const q = Number(c?.quantity) > 1 ? ` ×${c.quantity}` : '';
  return `${String(c?.title || 'Kitap').trim()}${isbn}${q}`;
}

function packageDisplayName(item) {
  const named = String(item?.package_name || '').trim();
  if (named) return named;
  const snap = String(item?.title_snapshot || '').trim();
  const cut = snap.replace(/\s*\(\d+\s*kitap\)\s*:[\s\S]*$/i, '').trim();
  return cut || snap || 'Set';
}

export function formatSellerItemLabel(item) {
  const contents = Array.isArray(item?.package_contents) ? item.package_contents : [];
  if (contents.length) {
    const setName = packageDisplayName(item);
    const setQty = Math.max(1, Number(item.quantity) || 1);
    const head = setQty > 1 ? `${setName} ×${setQty}` : setName;
    return `${head} → ${contents.map(formatContentBook).join(' · ')}`;
  }
  const qty = Math.max(1, Number(item?.quantity) || 1);
  const title = String(item?.title_snapshot || item?.title || 'Kitap').trim();
  const isbn = String(item?.isbn_snapshot || item?.isbn || '').trim();
  const label = isbn && !title.includes(isbn) ? `${title} [${isbn}]` : title;
  return qty > 1 ? `${label} × ${qty}` : label;
}

export function attachPackageContents(items, contentsByPackageId, namesByPackageId = new Map()) {
  return (items || []).map((it) => {
    const pid = it?.package_id;
    if (!pid) return { ...it, package_contents: it.package_contents || null };
    const base = contentsByPackageId.get(pid) || contentsByPackageId.get(String(pid)) || [];
    if (!base.length) {
      return {
        ...it,
        package_name: namesByPackageId.get(pid) || namesByPackageId.get(String(pid)) || it.package_name || null,
        package_contents: it.package_contents || null
      };
    }
    const setQty = Math.max(1, Number(it.quantity) || 1);
    return {
      ...it,
      package_name: namesByPackageId.get(pid) || namesByPackageId.get(String(pid)) || packageDisplayName(it),
      package_contents: base.map((c) => ({
        ...c,
        quantity: Math.max(1, Number(c.quantity) || 1) * setQty
      }))
    };
  });
}

export async function loadPackageContentsByIds(admin, packageIds) {
  const ids = [...new Set((packageIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const empty = { contentsByPackageId: new Map(), namesByPackageId: new Map() };
  if (!ids.length || !admin) return empty;
  const [{ data: items }, { data: pkgs }] = await Promise.all([
    admin
      .from('commerce_book_package_items')
      .select('package_id, quantity, sort_order, book_id, commerce_books(id, title, isbn, author)')
      .in('package_id', ids),
    admin.from('commerce_book_packages').select('id, name').in('id', ids)
  ]);
  return {
    contentsByPackageId: groupPackageContentsByPackageId(items),
    namesByPackageId: new Map((pkgs || []).map((p) => [p.id, p.name]))
  };
}
