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

/** 4 / 5 / 6 / 7. sınıf (4A, 5. sınıf…). 8 / LGS / lise hariç. */
export function isPrimary4567Grade(classLevel, className) {
  const blob = `${normalizeGradeBlob(classLevel)} ${normalizeGradeBlob(className)}`.trim();
  if (!blob) return false;
  if (/\blgs\b/.test(blob)) return false;
  if (/\b(tyt|ayt|yks|lise|mezun|yos)\b/.test(blob)) return false;
  if (/(?:^|[^\d])8(?:[a-z]|\.|\s|$)/.test(blob)) return false;
  return /(?:^|[^\d])([4567])(?:[a-z]|\.|\s|$)/.test(blob);
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
