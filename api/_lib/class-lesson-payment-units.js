/**
 * Kurum standardı: 1 ders saati = 40 dakika.
 *
 * Grup dersi, özel ders, öğretmen hakedişi ve veli ücretlendirmesi — hepsi
 * bu tek sabiti kullanır. Değer başka hiçbir dosyada tekrar yazılmaz;
 * ön yüzdeki eşi `src/lib/groupLessonPaymentUnits.ts` içindedir.
 *
 *   40 dk = 1 ders · 80 dk = 2 ders · 120 dk = 3 ders · 160 dk = 4 ders
 *
 * Hiçbir yerde "60 dakika = 1 ders" hesabı kullanılmaz.
 */
export const LESSON_DURATION_MINUTES = 40;

/** Eski ad — çağrı yerleri bozulmasın diye duruyor, aynı sabittir. */
export const GROUP_LESSON_UNIT_MINUTES = LESSON_DURATION_MINUTES;

export function completedSessionMinutes(row) {
  const start = String(row?.start_time || '').slice(0, 8);
  const end = String(row?.end_time || '').slice(0, 8);
  const toSec = (t) => {
    const p = String(t || '')
      .trim()
      .split(':')
      .map((x) => Number(x || 0));
    if (p.length < 2 || p.some((x) => Number.isNaN(x))) return null;
    return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
  };
  const a = toSec(start);
  const b = toSec(end);
  if (a != null && b != null && b >= a) return Math.round((b - a) / 60);
  return GROUP_LESSON_UNIT_MINUTES;
}

export function sessionLessonUnits40(row) {
  const minutes = completedSessionMinutes(row);
  return roundUnits(minutes / GROUP_LESSON_UNIT_MINUTES);
}

export function roundUnits(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

export function sumLessonUnits40(rows) {
  return roundUnits((rows || []).reduce((acc, row) => acc + sessionLessonUnits40(row), 0));
}
