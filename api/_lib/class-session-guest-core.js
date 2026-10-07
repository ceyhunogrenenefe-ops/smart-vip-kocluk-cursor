/**
 * Misafir öğrenci — saf mantık (veritabanı erişimi yok).
 *
 * Canlı derse kayıtlı öğrenci listesi dışından katılanlar "misafir"dir.
 * Otomatik tespit KESİN KARAR VERMEZ: eşleşmeyen ad yalnız "muhtemel misafir"
 * olarak işaretlenir, öğretmen/yönetici onaylayınca kesinleşir. Böylece
 * adını farklı yazan kayıtlı öğrenci yanlışlıkla misafir sayılmaz.
 */
import {
  findBbbAttendeeForStudentName,
  normalizePersonNameForMatch,
  stripBbbDisplayNameNoise
} from './bbb-attendance.js';

export const GUEST_STATUSES = [
  { id: 'suspected', label: 'Muhtemel Misafir' },
  { id: 'confirmed', label: 'Misafir Öğrenci' },
  { id: 'dismissed', label: 'Misafir Değil' }
];

export const GUEST_SOURCES = [
  { id: 'auto', label: 'Link ile giriş (tespit)' },
  { id: 'link', label: 'Link ile giriş' },
  { id: 'admin', label: 'Yönetici ekledi' },
  { id: 'teacher', label: 'Öğretmen işaretledi' },
  { id: 'trial', label: 'Deneme dersi' }
];

const STATUS_IDS = new Set(GUEST_STATUSES.map((s) => s.id));
const SOURCE_IDS = new Set(GUEST_SOURCES.map((s) => s.id));

export function isGuestStatus(v) {
  return STATUS_IDS.has(String(v || '').trim());
}

export function isGuestSource(v) {
  return SOURCE_IDS.has(String(v || '').trim());
}

export function guestStatusLabel(id) {
  return GUEST_STATUSES.find((s) => s.id === id)?.label || String(id || '');
}

export function guestSourceLabel(id) {
  return GUEST_SOURCES.find((s) => s.id === id)?.label || String(id || '');
}

/** Katılımcı adını kaydedilecek hâle getirir: "Ahmet (telefon)" → "Ahmet". */
export function cleanGuestDisplayName(raw) {
  const stripped = stripBbbDisplayNameNoise(String(raw || ''));
  return String(stripped || raw || '').trim().slice(0, 160);
}

export function guestNormalizedName(raw) {
  return normalizePersonNameForMatch(cleanGuestDisplayName(raw));
}

/**
 * Katılımcı listesinden kayıtlı öğrenciyle eşleşmeyen adları ayıklar.
 *
 * @param {string[]} attendeeNames  BBB'de görülen adlar
 * @param {{id:string,name:string}[]} roster  dersin kayıtlı öğrencileri
 * @param {string[]} [teacherNames]  öğretmen/moderatör adları — misafir sayılmaz
 * @returns {{ display_name: string, normalized_name: string }[]}
 */
export function detectGuestNames(attendeeNames, roster, teacherNames = []) {
  const names = Array.isArray(attendeeNames) ? attendeeNames : [];
  if (!names.length) return [];

  // Kayıtlı öğrencilerin eşleştiği katılımcı adları — bunlar misafir değil
  const matchedKeys = new Set();
  const attendeeObjs = names.map((n) => ({ fullName: String(n || '') }));
  for (const student of roster || []) {
    const hit = findBbbAttendeeForStudentName(student?.name, attendeeObjs);
    if (hit?.fullName) matchedKeys.add(guestNormalizedName(hit.fullName));
  }

  // Öğretmen ve moderatörler de listeden düşer
  for (const t of teacherNames || []) {
    const key = guestNormalizedName(t);
    if (key) matchedKeys.add(key);
  }

  const out = [];
  const seen = new Set();
  for (const raw of names) {
    const display = cleanGuestDisplayName(raw);
    const key = guestNormalizedName(raw);
    if (!display || !key) continue;
    if (matchedKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ display_name: display, normalized_name: key });
  }
  return out;
}

/**
 * Kayıtlı öğrencilerden hangisinin hangi katılımcıya denk geldiğini bulamadığımız
 * durumda bile ad listesini bozmamak için: aynı kişi birden çok derste
 * görünürse "kaçıncı kez" bilgisi buradan çıkar.
 *
 * @param {{normalized_name:string, session_id:string, status:string}[]} rows
 * @returns {Map<string, { visits: number, sessions: Set<string> }>}
 */
export function guestVisitStats(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const key = String(r?.normalized_name || '').trim();
    if (!key) continue;
    // "Misafir değil" denilen kayıt geçmişe sayılmaz
    if (String(r?.status || '') === 'dismissed') continue;
    if (!map.has(key)) map.set(key, { visits: 0, sessions: new Set() });
    const cur = map.get(key);
    const sid = String(r?.session_id || '');
    if (sid && cur.sessions.has(sid)) continue;
    if (sid) cur.sessions.add(sid);
    cur.visits += 1;
  }
  return map;
}

/** Dersin süresi (dk) — katılımcının derste kaldığı süre üst sınırı. */
export function sessionDurationMinutes(session) {
  const toMin = (t) => {
    const p = String(t || '').trim().split(':').map((x) => Number(x));
    if (p.length < 2 || p.some((x) => Number.isNaN(x))) return null;
    return (p[0] || 0) * 60 + (p[1] || 0);
  };
  const a = toMin(session?.start_time);
  const b = toMin(session?.end_time);
  if (a == null || b == null || b < a) return null;
  return b - a;
}

/** Derste kalma süresi — ilk/son görülme arası, ders süresiyle sınırlı. */
export function minutesPresent(firstSeenAt, lastSeenAt, session) {
  const a = Date.parse(String(firstSeenAt || ''));
  const b = Date.parse(String(lastSeenAt || ''));
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  const mins = Math.round((b - a) / 60000);
  const cap = sessionDurationMinutes(session);
  if (cap != null && mins > cap) return cap;
  return mins;
}
