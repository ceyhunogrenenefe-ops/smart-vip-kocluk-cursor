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
