/** 4A / 5A / 6A etüt, ödev, kitap okuma ve deneme — ortak Zoom (BBB değil). */
export const PRIMARY_4567_ZOOM_URL =
  'https://us06web.zoom.us/j/9448152197?pwd=czQvZWhtQ2Y3M1VwZnZIZHM1Q3pVdz09';

/** 8. sınıf / LGS etüt Zoom — 7. sınıf etüt de buna bağlanır. */
export const LGS8_ETUT_ZOOM_URL =
  'https://us06web.zoom.us/j/6946337643?pwd=SHkwQzNnaEkrOXVNajJMR1Z6UCtCUT09';

function normalizeGradeBlob(value: unknown): string {
  return String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

function hasGradeDigitToken(value: unknown, digit: number): boolean {
  const blob = normalizeGradeBlob(value).trim();
  if (!blob) return false;
  return new RegExp(`(?:^|[^\\d])${digit}(?:[a-z]|\\.|\\s|$)`).test(blob);
}

/** 8A, 8. sınıf, LGS 8 — çıplak "LGS" tek başına burada değil. */
export function hasEighthGradeToken(value: unknown): boolean {
  const blob = normalizeGradeBlob(value).trim();
  if (!blob) return false;
  if (/\blgs\s*8\b/.test(blob)) return true;
  if (/\bclass\s*78\b/.test(blob)) return true;
  if (/(?:^|[^\d])8(?:[a-z]|\.|\s|$)/.test(blob)) return true;
  return false;
}

/** 4A / 5. sınıf / class47 vb. */
export function hasPrimary4567GradeToken(value: unknown): boolean {
  const blob = normalizeGradeBlob(value).trim();
  if (!blob) return false;
  if (/\bclass\s*4\s*7\b/.test(blob) || /\bclass\s*56\b/.test(blob)) return true;
  if (/\b4\s*[-–]\s*7\b/.test(blob) || /\b5\s*[-–]\s*6\b/.test(blob)) return true;
  return /(?:^|[^\d])([4567])(?:[a-z]|\.|\s|$)/.test(blob);
}

/**
 * 4 / 5 / 6 / 7. sınıf (4A, 5. sınıf…).
 * Sınıf adında 4–7 varsa LGS program etiketi 8. sınıfa düşürmez.
 * 8A / 8. sınıf / LGS 8 ve çıplak LGS (4–7 yok) hariç.
 */
export function isPrimary4567Grade(classLevel?: unknown, className?: unknown): boolean {
  const level = normalizeGradeBlob(classLevel);
  const name = normalizeGradeBlob(className);
  const blob = `${level} ${name}`.trim();
  if (!blob) return false;
  if (/\b(tyt|ayt|yks|lise|mezun|yos)\b/.test(blob)) return false;
  if (hasEighthGradeToken(name) || hasEighthGradeToken(level)) return false;
  if (hasPrimary4567GradeToken(name) || hasPrimary4567GradeToken(level)) return true;
  if (/\blgs\b/.test(blob)) return false;
  return false;
}

/** 7A / 7. sınıf (8. sınıf değil). */
export function isSeventhGrade(classLevel?: unknown, className?: unknown): boolean {
  if (hasEighthGradeToken(classLevel) || hasEighthGradeToken(className)) return false;
  if (hasGradeDigitToken(classLevel, 7)) return true;
  if (hasGradeDigitToken(className, 7) && !/\b4\s*[-–]\s*7\b/.test(normalizeGradeBlob(className))) {
    return true;
  }
  return false;
}

/** Etüt, ödev (takibi/saati), kitap okuma, deneme sınavı — matematik vb. hariç. */
export function isPrimary4567JoinSubject(subject?: unknown): boolean {
  const s = normalizeGradeBlob(subject).trim();
  if (!s) return false;
  if (s.includes('analiz')) return false;
  if (s.includes('etut')) return true;
  if (s.includes('odev')) return true;
  if (s.includes('kitap')) return true;
  if (s.includes('deneme')) return true;
  return false;
}

/** Sadece etüt (ödev / kitap / deneme değil). */
export function isEtutJoinSubject(subject?: unknown): boolean {
  const s = normalizeGradeBlob(subject).trim();
  if (!s) return false;
  if (s.includes('analiz')) return false;
  return s.includes('etut');
}

/**
 * 4–6 (+ 7 ödev/kitap/deneme) → 4–7 Zoom.
 * 7. sınıf etüt → 8. sınıf / LGS Zoom.
 */
export function primary4567ZoomIfApplicable(opts?: {
  subject?: unknown;
  className?: unknown;
  classLevel?: unknown;
}): string | null {
  if (!isPrimary4567Grade(opts?.classLevel, opts?.className)) return null;
  if (!isPrimary4567JoinSubject(opts?.subject)) return null;
  if (isSeventhGrade(opts?.classLevel, opts?.className) && isEtutJoinSubject(opts?.subject)) {
    return LGS8_ETUT_ZOOM_URL;
  }
  return PRIMARY_4567_ZOOM_URL;
}
