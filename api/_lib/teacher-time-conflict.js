/**
 * Öğretmen saat çakışması: aynı sınıfta çakışma yasak.
 * Farklı sınıfta aynı ders (8A + 8C Fen aynı saat) birleşik grup — serbest.
 */

export function normalizeLessonSubjectKey(subject) {
  return String(subject || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ');
}

export function timeRangesOverlapHms(aStart, aEnd, bStart, bEnd) {
  const A1 = String(aStart || '').slice(0, 8);
  const A2 = String(aEnd || '').slice(0, 8);
  const B1 = String(bStart || '').slice(0, 8);
  const B2 = String(bEnd || '').slice(0, 8);
  return A1 < B2 && A2 > B1;
}

export function subjectsMatchCombined(a, b) {
  const left = normalizeLessonSubjectKey(a);
  const right = normalizeLessonSubjectKey(b);
  return Boolean(left && right && left === right);
}

/**
 * true = bu satır yeni dersi engeller.
 * ownClassId + farklı class_id + aynı subject → engelleme (birleşik sınıf).
 */
export function teacherRowBlocksNewLesson({ start, end, subject, ownClassId }, row) {
  if (!row) return false;
  if (!timeRangesOverlapHms(start, end, row.start_time, row.end_time)) return false;
  const otherClass = String(row.class_id || '').trim();
  const own = String(ownClassId || '').trim();
  if (own && otherClass && otherClass !== own && subjectsMatchCombined(subject, row.subject)) {
    return false;
  }
  return true;
}

export function findBlockingTeacherRow({ start, end, subject, ownClassId, rows, excludeIds = [] }) {
  const ex = new Set((excludeIds || []).map(String));
  for (const row of rows || []) {
    if (ex.has(String(row.id || ''))) continue;
    if (teacherRowBlocksNewLesson({ start, end, subject, ownClassId }, row)) return row;
  }
  return null;
}
