/** 4A / 5A / 6A / 7A etüt, ödev, kitap okuma ve deneme — ortak Zoom (BBB değil). */
export const PRIMARY_4567_ZOOM_URL =
  'https://us06web.zoom.us/j/9448152197?pwd=czQvZWhtQ2Y3M1VwZnZIZHM1Q3pVdz09';

function normalizeGradeBlob(value) {
  return String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

/** 8A, 8. sınıf, LGS 8 — çıplak "LGS" tek başına burada değil. */
export function hasEighthGradeToken(value) {
  const blob = normalizeGradeBlob(value).trim();
  if (!blob) return false;
  if (/\blgs\s*8\b/.test(blob)) return true;
  if (/\bclass\s*78\b/.test(blob)) return true;
  if (/(?:^|[^\d])8(?:[a-z]|\.|\s|$)/.test(blob)) return true;
  return false;
}

/** 4A / 5. sınıf / class47 vb. */
export function hasPrimary4567GradeToken(value) {
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
export function isPrimary4567Grade(classLevel, className) {
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

/** Etüt, ödev (takibi/saati), kitap okuma, deneme sınavı — matematik vb. hariç. */
export function isPrimary4567JoinSubject(subject) {
  const s = normalizeGradeBlob(subject).trim();
  if (!s) return false;
  if (s.includes('analiz')) return false;
  if (s.includes('etut')) return true;
  if (s.includes('odev')) return true;
  if (s.includes('kitap')) return true;
  if (s.includes('deneme')) return true;
  return false;
}

export function primary4567ZoomIfApplicable({ subject, className, classLevel } = {}) {
  if (!isPrimary4567Grade(classLevel, className)) return null;
  if (!isPrimary4567JoinSubject(subject)) return null;
  return PRIMARY_4567_ZOOM_URL;
}
