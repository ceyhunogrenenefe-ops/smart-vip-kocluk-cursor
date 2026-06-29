/** Eğitim-öğretim yılı etiketi: 2025-2026 */

export const PINNED_ACADEMIC_YEAR_TERMS = ['2025-2026', '2026-2027', '2027-2028'] as const;

export function normalizeAcademicYearLabel(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{4})\s*[-–/]\s*(\d{4})$/);
  if (m) return `${m[1]}-${m[2]}`;
  return s;
}

/** Eylül itibarıyla yeni dönem başlar. */
export function currentAcademicYearTerm(now = new Date()): string {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (m >= 8) return `${y}-${y + 1}`;
  return `${y - 1}-${y}`;
}

export function buildAcademicYearTermOptions(anchorYear = new Date().getFullYear()): string[] {
  const terms: string[] = [];
  for (let y = anchorYear - 1; y <= anchorYear + 2; y++) {
    terms.push(`${y}-${y + 1}`);
  }
  return terms;
}

export function mergeAcademicYearTermOptions(existing: Iterable<string>): string[] {
  const set = new Set<string>([...PINNED_ACADEMIC_YEAR_TERMS, ...buildAcademicYearTermOptions()]);
  for (const raw of existing) {
    const label = normalizeAcademicYearLabel(raw);
    if (label) set.add(label);
  }
  return [...set].sort();
}
