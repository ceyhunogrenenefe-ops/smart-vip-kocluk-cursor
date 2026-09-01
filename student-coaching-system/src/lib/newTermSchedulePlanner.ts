/**
 * 2026-2027 akademik yıl — ders programı planlayıcısı (yaz kampı değil).
 * Eylül–Haziran; varsayılan dilimler akşam canlı ders saatleri.
 */

export const NEW_TERM_PLANNER_PATH = '/ders-saatleri-yeni-donem';
export const NEW_TERM_PLAN_TITLE = 'Ders Saatleri Yeni Dönem Programı';
export const NEW_TERM_PLAN_NAME = 'Ders Saatleri 2026-2027';
export const NEW_TERM_KEY = '2026-2027';
export const NEW_TERM_START = '2026-09-01';
export const NEW_TERM_END = '2027-06-19';

export const NEW_TERM_PERIODS = [
  { label: '1. Ders', time: '17:00–17:40' },
  { label: '2. Ders', time: '17:50–18:30' },
  { label: '3. Ders', time: '18:40–19:20' },
  { label: '4. Ders', time: '19:30–20:10' },
  { label: '5. Ders', time: '20:20–21:00' },
  { label: '6. Ders', time: '21:10–21:50' },
] as const;

export type NewTermPlanRow = { id: string; name: string; updated_at?: string };

export function isNewTermPlanName(name: unknown): boolean {
  const n = String(name || '')
    .trim()
    .toLocaleLowerCase('tr-TR');
  if (!n) return false;
  if (n.includes('yaz') && !n.includes('yeni dönem')) return false;
  if (n.includes('yeni dönem')) return true;
  const year = n.includes('2026-2027') || n.includes('2026 / 2027');
  return year && (n.includes('ders saat') || n.includes('dönem program') || n.includes('akademik'));
}

export function pickNewTermPlan(plans: NewTermPlanRow[]): NewTermPlanRow | null {
  const hits = (Array.isArray(plans) ? plans : []).filter((p) => isNewTermPlanName(p.name));
  if (!hits.length) return null;
  return [...hits].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))[0];
}

export function blankNewTermPlannerState() {
  return {
    term: { start: NEW_TERM_START, end: NEW_TERM_END },
    days: ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'],
    periods: NEW_TERM_PERIODS.map((p) => ({ label: p.label, time: p.time })),
    groups: [] as { id: string; name: string }[],
  };
}
