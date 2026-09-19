/** 4A / 5A / 6A etüt, ödev, kitap okuma ve deneme — ortak Zoom (BBB değil). */
export const PRIMARY_4567_ZOOM_URL =
  'https://us06web.zoom.us/j/9448152197?pwd=czQvZWhtQ2Y3M1VwZnZIZHM1Q3pVdz09';

/** 8. sınıf / LGS etüt Zoom — 7. sınıf etüt de buna bağlanır. */
export const LGS8_ETUT_ZOOM_URL =
  'https://us06web.zoom.us/j/6946337643?pwd=SHkwQzNnaEkrOXVNajJMR1Z6UCtCUT09';

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

function hasGradeDigitToken(value, digit) {
  const blob = normalizeGradeBlob(value).trim();
  if (!blob) return false;
  return new RegExp(`(?:^|[^\\d])${digit}(?:[a-z]|\\.|\\s|$)`).test(blob);
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

/** 7A / 7. sınıf (8. sınıf değil). */
export function isSeventhGrade(classLevel, className) {
  if (hasEighthGradeToken(classLevel) || hasEighthGradeToken(className)) return false;
  if (hasGradeDigitToken(classLevel, 7)) return true;
  // Ad "7A" gibi; "4-7" kart adını sınıf sanma
  if (hasGradeDigitToken(className, 7) && !/\b4\s*[-–]\s*7\b/.test(normalizeGradeBlob(className))) {
    return true;
  }
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

/** Sadece etüt (ödev / kitap / deneme değil). */
export function isEtutJoinSubject(subject) {
  const s = normalizeGradeBlob(subject).trim();
  if (!s) return false;
  if (s.includes('analiz')) return false;
  return s.includes('etut');
}

/** Sadece deneme sınavı (analiz hariç). */
export function isDenemeJoinSubject(subject) {
  const s = normalizeGradeBlob(subject).trim();
  if (!s) return false;
  if (s.includes('analiz')) return false;
  return s.includes('deneme');
}

/** 8A / 8. sınıf / LGS 8 veya çıplak LGS (4–7 yok). Lise / TYT hariç. */
export function isEighthGrade(classLevel, className) {
  const level = normalizeGradeBlob(classLevel);
  const name = normalizeGradeBlob(className);
  const blob = `${level} ${name}`.trim();
  if (!blob) return false;
  if (/\b(tyt|ayt|yks|lise|mezun|yos)\b/.test(blob)) return false;
  if (hasEighthGradeToken(name) || hasEighthGradeToken(level)) return true;
  if (/\blgs\b/.test(blob) && !hasPrimary4567GradeToken(name) && !hasPrimary4567GradeToken(level)) return true;
  return false;
}

/**
 * 7. ve 8. sınıf (LGS) deneme sınavı → 8. sınıf / LGS Zoom (sabit).
 * 7. sınıf etüt → 8. sınıf / LGS Zoom (önceden olduğu gibi). 8. sınıf etüt ve normal dersler değişmez.
 * 4–6 etüt / ödev / kitap / deneme ve 7. sınıf ödev / kitap → 4–7 Zoom.
 */
export function primary4567ZoomIfApplicable({ subject, className, classLevel } = {}) {
  const seventh = isSeventhGrade(classLevel, className);
  if (isDenemeJoinSubject(subject) && (seventh || isEighthGrade(classLevel, className))) {
    return LGS8_ETUT_ZOOM_URL;
  }
  if (seventh && isEtutJoinSubject(subject)) return LGS8_ETUT_ZOOM_URL;
  if (!isPrimary4567Grade(classLevel, className)) return null;
  if (!isPrimary4567JoinSubject(subject)) return null;
  return PRIMARY_4567_ZOOM_URL;
}
