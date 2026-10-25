/**
 * Edesis ↔ platform öğrenci senkron raporu.
 *
 * Panelde eskiden yalnız Edesis numarası kayıtlı öğrenciler listeleniyordu ve Edesis'e hiç
 * sorulmuyordu: Edesis numarası olmayan öğrenciler görünmüyor, Edesis'ten silinmiş öğrenciler
 * ise "bağlı" görünmeye devam ediyordu. Bu modül iki tarafı karşılaştırıp her öğrenciyi
 * tek bir duruma koyar.
 */

/** Durumlar (UI etiketleriyle aynı sırada) */
export const SYNC_STATUS = {
  ok: 'ok', // sistemde aktif, Edesis'te var ve bağlı
  deleted: 'deleted_in_edesis', // sistemde Edesis no kayıtlı ama Edesis'te öğrenci yok
  notLinked: 'not_linked', // sistemde aktif, Edesis numarası yok
  edesisOnly: 'edesis_only', // Edesis'te var, sistemde hiçbir öğrenciye bağlı değil
  passive: 'passive_in_system' // sistemde pasif/silinmiş ama Edesis'te hâlâ var
};

function str(v) {
  return v == null ? '' : String(v).trim();
}

function pickCi(obj, keys) {
  if (!obj || typeof obj !== 'object') return '';
  const lower = new Map(Object.keys(obj).map((k) => [k.toLowerCase(), k]));
  for (const k of keys) {
    const real = lower.get(String(k).toLowerCase());
    if (real != null && obj[real] != null && str(obj[real]) !== '') return str(obj[real]);
  }
  return '';
}

/** Sistemde aktif öğrenci mi? (silinmemiş ve kaydı çekilmemiş) */
export function platformStudentIsActive(s) {
  if (!s) return false;
  if (s.deleted_at) return false;
  const st = str(s.enrollment_status).toLowerCase();
  return !['withdrawn', 'passive', 'pasif', 'inactive', 'left', 'deleted', 'archived'].includes(st);
}

/** Edesis öğrenci satırından ekranda gösterilecek özet */
export function summarizeEdesisStudentRow(row, keys) {
  const r = row?.ogrenci && typeof row.ogrenci === 'object' ? { ...row, ...row.ogrenci } : row || {};
  return {
    edesisId: str(keys?.edesisStudentId),
    name: str(keys?.name),
    email: str(keys?.email) || null,
    className: pickCi(r, ['classroomName', 'className', 'subeAdi', 'sube', 'classroom']) || null,
    gradeName: pickCi(r, ['gradeName', 'sinifAdi', 'grade']) || null,
    termName: pickCi(r, ['termName', 'donemAdi', 'term']) || null,
    state: pickCi(r, ['studentState', 'state', 'durum']) || null
  };
}

/**
 * @param {object} p
 * @param {Array} p.students  platform öğrencileri (id, name, email, class_level, edesis_ogrenci_id, deleted_at, enrollment_status)
 * @param {Array} p.edesisRows Edesis /students satırları
 * @param {(row) => {edesisStudentId, name, email}} p.keysOf satırdan anahtar çıkarır
 * @param {(students, {name,email}) => {studentId}} [p.suggest] eşleşmemiş Edesis öğrencisi için öneri
 * @param {Map<string, object|null>} [p.lookedUp] listede olmayan Edesis no'larının tek tek sorgu sonucu
 *        (null = Edesis'te yok, nesne = başka dönemde var)
 * @param {boolean} [p.includeEdesisOnly] Edesis'te olup sistemde olmayanlar listelensin mi
 */
export function buildStudentSyncReport({
  students = [],
  edesisRows = [],
  keysOf,
  suggest,
  lookedUp = new Map(),
  includeEdesisOnly = true
}) {
  const edesisById = new Map();
  for (const row of edesisRows) {
    const keys = keysOf(row);
    const id = str(keys?.edesisStudentId);
    if (!id || edesisById.has(id)) continue;
    edesisById.set(id, summarizeEdesisStudentRow(row, keys));
  }

  const linkedIds = new Set();
  const items = [];
  for (const s of students) {
    const edesisId = str(s.edesis_ogrenci_id);
    const active = platformStudentIsActive(s);
    const base = {
      platformStudentId: s.id,
      platformName: s.name || '',
      classLevel: s.class_level != null ? str(s.class_level) : null,
      email: s.email || null,
      edesisId: edesisId || null,
      active
    };
    if (edesisId) linkedIds.add(edesisId);

    let edesis = edesisId ? edesisById.get(edesisId) || null : null;
    if (edesisId && !edesis && lookedUp.has(edesisId)) {
      const hit = lookedUp.get(edesisId);
      if (hit) edesis = { edesisId, name: '', className: hit.className || null, gradeName: hit.gradeName || null, otherTerm: true };
    }
    const existsInEdesis = Boolean(edesis);

    if (!active) {
      // Pasif öğrenci Edesis'te yoksa iş yok; varsa bilgi olarak göster
      if (existsInEdesis) items.push({ ...base, status: SYNC_STATUS.passive, edesis });
      continue;
    }
    if (!edesisId) {
      items.push({ ...base, status: SYNC_STATUS.notLinked, edesis: null });
      continue;
    }
    if (!existsInEdesis) {
      // Listede yok ve tek tek sorgulanmadıysa kesin "silinmiş" denmez
      const verified = lookedUp.has(edesisId);
      items.push({ ...base, status: SYNC_STATUS.deleted, edesis: null, verified });
      continue;
    }
    items.push({ ...base, status: SYNC_STATUS.ok, edesis });
  }

  if (includeEdesisOnly) {
    for (const [id, e] of edesisById) {
      if (linkedIds.has(id)) continue;
      const hit = suggest ? suggest(students, { name: e.name, email: e.email }) : null;
      const sugg = hit?.studentId ? students.find((s) => s.id === hit.studentId) : null;
      items.push({
        platformStudentId: null,
        platformName: '',
        classLevel: null,
        email: e.email,
        edesisId: id,
        active: null,
        status: SYNC_STATUS.edesisOnly,
        edesis: e,
        suggestion:
          sugg && !str(sugg.edesis_ogrenci_id)
            ? { platformStudentId: sugg.id, name: sugg.name, method: hit.method || null }
            : null
      });
    }
  }

  const counts = Object.fromEntries(Object.values(SYNC_STATUS).map((k) => [k, 0]));
  for (const it of items) counts[it.status] += 1;
  const inSync =
    counts[SYNC_STATUS.deleted] === 0 &&
    counts[SYNC_STATUS.notLinked] === 0 &&
    counts[SYNC_STATUS.edesisOnly] === 0;
  return { items, counts, inSync, edesisCount: edesisById.size };
}
