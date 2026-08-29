/**
 * Kitap mağazası — öğretmen / koç / admin paket ve atama.
 */

export function staffCanManageStore(roleSet) {
  if (!roleSet || typeof roleSet.has !== 'function') return false;
  return ['super_admin', 'admin', 'coach', 'teacher'].some((r) => roleSet.has(r));
}

export function assignmentSourceFromRoles(roleSet) {
  if (roleSet?.has('teacher')) return 'teacher';
  if (roleSet?.has('coach')) return 'coach';
  if (roleSet?.has('admin') || roleSet?.has('super_admin')) return 'admin';
  return 'system';
}

export function normalizeAssignmentType(value) {
  const t = String(value || '').trim().toLowerCase();
  if (t === 'required' || t === 'optional' || t === 'recommended') return t;
  return 'recommended';
}

export function slugifyPackageName(name) {
  return String(name || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function uniqueIds(list) {
  const out = [];
  const seen = new Set();
  for (const raw of list || []) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Atama satırları — öğrenci × kitap (mevcut unique index). */
export function buildAssignmentInserts({
  institutionId,
  studentIds,
  bookIds,
  offerByBook = {},
  assignmentType = 'recommended',
  source = 'teacher',
  assignedBy,
  notes = null
}) {
  const students = uniqueIds(studentIds);
  const books = uniqueIds(bookIds);
  const type = normalizeAssignmentType(assignmentType);
  const rows = [];
  for (const student_id of students) {
    for (const book_id of books) {
      rows.push({
        institution_id: institutionId,
        student_id,
        book_id,
        vendor_offer_id: offerByBook[book_id] || null,
        assignment_type: type,
        source,
        status: 'assigned',
        assigned_by: assignedBy || null,
        notes: notes ? String(notes).slice(0, 500) : null
      });
    }
  }
  return rows;
}

export function sanitizePackageName(value) {
  const name = String(value ?? '').trim();
  if (!name) throw new Error('name gerekli');
  return name.slice(0, 160);
}

export function sanitizePackagePriceKurus(value) {
  if (value == null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error('Geçersiz paket fiyatı');
  return Math.round(n);
}

/** Personel paket güncelleme — boş fiyat “Fiyat yakında”. */
export function buildPackageUpdatePatch(body, actorSub) {
  const patch = { updated_by: actorSub || null, updated_at: new Date().toISOString() };
  if (body.name !== undefined) patch.name = sanitizePackageName(body.name);
  if (body.description !== undefined) {
    const d = String(body.description || '').trim();
    patch.description = d ? d.slice(0, 2000) : null;
  }
  if (body.class_level !== undefined) {
    const c = String(body.class_level || '').trim();
    patch.class_level = c || null;
  }
  if (body.program !== undefined) {
    const p = String(body.program || '').trim();
    patch.program = p || null;
  }
  if (body.price_kurus !== undefined) patch.price_kurus = sanitizePackagePriceKurus(body.price_kurus);
  if (body.compare_at_price_kurus !== undefined) {
    patch.compare_at_price_kurus = body.compare_at_price_kurus == null || body.compare_at_price_kurus === ''
      ? null
      : sanitizePackagePriceKurus(body.compare_at_price_kurus);
  }
  if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);
  return patch;
}
