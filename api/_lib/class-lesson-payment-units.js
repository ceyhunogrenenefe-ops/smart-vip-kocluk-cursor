/** Grup dersi ödeme özeti — 40 dakikalık birim ders periyodu */
export const GROUP_LESSON_UNIT_MINUTES = 40;

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
