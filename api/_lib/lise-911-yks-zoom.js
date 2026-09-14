/**
 * 9–10–11 + YKS: Etüt ve Deneme → ortak Lise Zoom (Akademik Merkez ile aynı oda).
 */
export const LISE_911_YKS_ZOOM_URL =
  'https://us06web.zoom.us/j/3565095951?pwd=Rk56NGhXeEYrZkZOWEVVbG5pa0RjUT09';

/** @deprecated alias — Akademik Merkez exams.lise ile aynı URL */
export const LISE_DENEME_ZOOM_ENTRY = LISE_911_YKS_ZOOM_URL;

function normalizeBlob(value) {
  return String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Etüt veya deneme (analiz dahil). */
export function isLiseEtutOrDenemeSubject(subject) {
  const s = normalizeBlob(subject);
  if (!s) return false;
  if (s.includes('etut')) return true;
  if (s.includes('deneme')) return true;
  return false;
}

/**
 * 9 / 10 / 11 / 12 / YKS / TYT / AYT / mezun / lise (YÖS hariç).
 */
export function isLise911YksGrade(classLevel, className) {
  const blob = normalizeBlob(`${classLevel || ''} ${className || ''}`);
  if (!blob) return false;
  if (/\byos\b/.test(blob)) return false;
  if (/\b(tyt|ayt|yks|mezun|lise)\b/.test(blob)) return true;
  if (/(?:^|[^\d])(9|10|11|12)(?:[a-z]|\b|\.|-)/.test(blob)) return true;
  return false;
}

/**
 * Canlı ders / slot: 9–11–YKS etüt veya deneme → ortak Zoom.
 * @returns {string|null}
 */
export function lise911YksZoomIfApplicable({ subject, className, classLevel } = {}) {
  if (!isLise911YksGrade(classLevel, className)) return null;
  if (!isLiseEtutOrDenemeSubject(subject)) return null;
  return LISE_911_YKS_ZOOM_URL;
}
