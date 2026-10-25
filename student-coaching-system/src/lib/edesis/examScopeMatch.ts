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

/** Deneme AYT mi? (TYT-AYT karma denemeler AYT sayılmaz) */
export function examIsAyt(exam?: ScopeExam | null): boolean {
  const blob = norm(`${exam?.examType || ''} ${exam?.name || ''}`);
  if (!/\bayt\b/.test(blob)) return false;
  return !/\btyt\b/.test(blob);
}

/** Öğrenci AYT denemesi görebilir mi: 12. sınıf ve mezun evet; 9/10/11 hayır. */
export function studentTakesAyt(scope?: ExamScope | null): boolean {
  const blob = norm(
    [scope?.classLevel, scope?.gradeName, scope?.className, ...(scope?.programKeys || [])].join(' ')
  );
  if (/\bmezun\b/.test(blob)) return true;
  if (hasGrade(blob, [12])) return true;
  // 9 / 10 / 11 açıkça yazıyorsa AYT gösterilmez
  if (hasGrade(blob, [9, 10, 11])) return false;
  // Sınıf bilinmiyorsa (ör. "YKS SAYISAL" grubu) gizleme
  return true;
}

/**
 * Deneme öğrencinin sınıfına uygun mu?
 * Bilinmeyen durumda TRUE döner — filtre yanlışlıkla deneme gizlemesin.
 */
export function examMatchesStudentScope(exam?: ScopeExam | null, scope?: ExamScope | null): boolean {
  const student = studentProgramGroup(scope);
  if (!student) return true;
  const examGroup = examProgramGroup(exam);
  if (examGroup && examGroup !== student) return false;
  // AYT yalnızca 12. sınıf ve mezunlara
  if (student === 'lise' && examIsAyt(exam) && !studentTakesAyt(scope)) return false;
  return true;
}

/**
 * "Sınava gir" sınıf süzgeci etiketi. Deneme adı/türünden sınıf çıkarılır:
 * "7.SINIF OKYANUS" → "7. sınıf", "LGS ULTİ" → "LGS", "PARAF TYT-1" → "TYT".
 * Belirli sınıf numarası, LGS/TYT/AYT etiketinden önce gelir (ör. "11 SINIF … TYT-1" → "11. sınıf").
 */
export function examClassLabel(exam?: ScopeExam | null): string {
  const blob = norm(`${exam?.name || ''} ${exam?.examType || ''}`);
  const sinif = blob.match(/(?:^|[^\d])(1[0-2]|[1-9])\s*\.?\s*(?:sinif|sinifi|snf)\b/);
  if (sinif) return `${Number(sinif[1])}. sınıf`;
  if (/\bmezun\b/.test(blob)) return 'Mezun';
  if (/\bayt\b/.test(blob) && !/\btyt\b/.test(blob)) return 'AYT';
  if (/\b(tyt|yks)\b/.test(blob)) return 'TYT';
  if (/\blgs\b/.test(blob)) return 'LGS';
  return 'Diğer';
}

const CLASS_LABEL_ORDER = [
  '1. sınıf', '2. sınıf', '3. sınıf', '4. sınıf', '5. sınıf', '6. sınıf', '7. sınıf', '8. sınıf', 'LGS',
  '9. sınıf', '10. sınıf', '11. sınıf', '12. sınıf', 'TYT', 'AYT', 'Mezun', 'Diğer'
];

/** Listede bulunan sınıf etiketleri, sınıf sırasıyla ve adetleriyle */
export function examClassOptions(exams: ScopeExam[]): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const ex of exams || []) {
    const label = examClassLabel(ex);
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => CLASS_LABEL_ORDER.indexOf(a.label) - CLASS_LABEL_ORDER.indexOf(b.label));
}
