/** Haftalık plan koç hedefi birimleri */
export const COACH_GOAL_QUANTITY_UNITS = [
  { value: 'soru', label: 'Soru / adet' },
  { value: 'paragraf', label: 'Paragraf' },
  { value: 'problem', label: 'Problem' },
  { value: 'sayfa', label: 'Sayfa (kitap)' },
  { value: 'dakika', label: 'Süre — dakika' },
  { value: 'tekrar', label: 'Tekrar (adet)' }
] as const;

export type CoachGoalQuantityUnit = (typeof COACH_GOAL_QUANTITY_UNITS)[number]['value'];

export function normalizeGoalUnit(raw?: string | null): string {
  const u = String(raw || 'soru')
    .trim()
    .toLowerCase();
  if (u === 'sorular' || u === 'adet' || u === '') return 'soru';
  if (u === 'dk' || u === 'dakika' || u === 'süre' || u === 'sure' || u === 'dak') return 'dakika';
  if (u === 'sayfa' || u === 'kitap') return 'sayfa';
  if (u === 'paragraf' || u === 'paragraflar') return 'paragraf';
  if (u === 'problem' || u === 'problemler') return 'problem';
  return u;
}

export function goalUnitLabel(unit?: string | null): string {
  const u = normalizeGoalUnit(unit);
  return COACH_GOAL_QUANTITY_UNITS.find((o) => o.value === u)?.label ?? u;
}

/** Öğrenci çalışma kaydından hedef birimine göre tamamlanan miktar */
export function completedQuantityForGoalUnit(
  unit: string | null | undefined,
  amounts: { solvedQuestions: number; pagesRead: number; screenMinutes: number }
): number {
  const u = normalizeGoalUnit(unit);
  if (u === 'sayfa') return Math.max(0, amounts.pagesRead);
  if (u === 'dakika') return Math.max(0, amounts.screenMinutes);
  if (u === 'paragraf' || u === 'problem') return Math.max(0, amounts.solvedQuestions);
  return Math.max(0, amounts.solvedQuestions);
}
