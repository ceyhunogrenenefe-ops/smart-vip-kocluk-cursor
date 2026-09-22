/** Öğrenci "Denemelerim" listesi — sınıf/program filtresi */

export type ExamScope = {
  classLevel?: string | number | null;
  gradeName?: string | null;
  className?: string | null;
  programKeys?: string[] | null;
};

export type ScopeExam = {
  name?: string | null;
  examType?: string | null;
};

export type ProgramGroup = 'lise' | 'lgs' | 'ortaokul' | 'ilkokul';

function norm(value: unknown): string {
  return String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

function hasGrade(blob: string, digits: number[]): boolean {
  return digits.some((d) => new RegExp(`(?:^|[^\\d])${d}(?:[^\\d]|$)`).test(blob));
}

/** Öğrencinin programı: sınıf seviyesi / Edesis sınıf adı / program anahtarları */
export function studentProgramGroup(scope?: ExamScope | null): ProgramGroup | null {
  const blob = norm(
    [scope?.classLevel, scope?.gradeName, scope?.className, ...(scope?.programKeys || [])].join(' ')
  );
  if (!blob.trim()) return null;
  if (/\b(tyt|ayt|yks|ydt|mezun|lise)\b/.test(blob) || hasGrade(blob, [9, 10, 11, 12])) return 'lise';
  if (/\blgs\b/.test(blob) || hasGrade(blob, [8])) return 'lgs';
  if (hasGrade(blob, [5, 6, 7])) return 'ortaokul';
  if (hasGrade(blob, [1, 2, 3, 4])) return 'ilkokul';
  return null;
}

/** Denemenin programı: tür + ad. Anlaşılmıyorsa null (filtre gizlemez). */
export function examProgramGroup(exam?: ScopeExam | null): ProgramGroup | null {
  const blob = norm(`${exam?.examType || ''} ${exam?.name || ''}`);
  if (!blob.trim()) return null;
  if (/\b(tyt|ayt|yks|ydt)\b/.test(blob)) return 'lise';
  if (/\blgs\b/.test(blob)) return 'lgs';
  if (hasGrade(blob, [9, 10, 11, 12])) return 'lise';
  if (hasGrade(blob, [8])) return 'lgs';
  if (hasGrade(blob, [5, 6, 7])) return 'ortaokul';
  if (hasGrade(blob, [2, 3, 4])) return 'ilkokul';
  return null;
}

/**
 * Deneme öğrencinin sınıfına uygun mu?
 * Bilinmeyen durumda TRUE döner — filtre yanlışlıkla deneme gizlemesin.
 */
export function examMatchesStudentScope(exam?: ScopeExam | null, scope?: ExamScope | null): boolean {
  const student = studentProgramGroup(scope);
  if (!student) return true;
  const examGroup = examProgramGroup(exam);
  if (!examGroup) return true;
  return examGroup === student;
}
