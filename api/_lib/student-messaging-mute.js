/**
 * Pasife alınan öğrencilere otomatik WhatsApp mesajı gitmesin.
 *
 * Öğrenci pasife alındığında `enrollment_status` 'withdrawn' olur (ve genelde
 * `deleted_at` dolar). Otomasyonların çoğu öğrenciyi kimliğiyle değil TELEFON
 * NUMARASIYLA gönderdiği için susturma numara bazında yapılır.
 *
 * DİKKAT — kardeş durumu: aynı veli numarası hem pasif hem aktif öğrenciye
 * bağlı olabilir. Böyle bir numara susturulmaz; aktif kardeş yüzünden mesaj
 * almaya devam etmeli. Yalnızca SADECE pasif öğrencilere ait numaralar susar.
 *
 * Bu yalnız OTOMATİK gönderimleri kapsar. Temsilcinin elle yazdığı mesaj
 * engellenmez — pasif bir öğrenciye bilinçli mesaj atılabilmeli.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';

/** Pasif sayılan kayıt durumları. */
export const INACTIVE_ENROLLMENT_STATUSES = new Set([
  'withdrawn',
  'cancelled',
  'canceled',
  'inactive',
  'passive',
  'archived',
  'frozen'
]);

/** Öğrenci satırı pasif mi? (enrollment_status veya deleted_at) */
export function studentRowIsInactive(row) {
  if (!row) return false;
  if (row.deleted_at) return true;
  const st = String(row.enrollment_status || '').trim().toLowerCase();
  return INACTIVE_ENROLLMENT_STATUSES.has(st);
}

/** Karşılaştırma için numara anahtarı; normalize edilemezse ham rakamlar. */
export function phoneKey(value) {
  const e164 = normalizePhoneToE164(value);
  if (e164) return e164;
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 10 ? `+${digits}` : '';
}

const PHONE_FIELDS = ['phone', 'parent_phone', 'parent_phone_2', 'mother_phone', 'father_phone'];

function rowPhoneKeys(row) {
  const out = [];
  for (const field of PHONE_FIELDS) {
    if (row[field] === undefined) continue;
    const key = phoneKey(row[field]);
    if (key) out.push(key);
  }
  return out;
}

let cache = { at: 0, muted: new Set() };
const CACHE_MS = 60_000;

/** Yalnızca pasif öğrencilere ait numaralar. */
export async function loadMutedPhoneKeys({ force = false } = {}) {
  if (!force && Date.now() - cache.at < CACHE_MS) return cache.muted;
  try {
    const { data, error } = await supabaseAdmin
      .from('students')
      .select('id, enrollment_status, deleted_at, phone, parent_phone');
    if (error) throw error;

    const inactive = new Set();
    const active = new Set();
    for (const row of data || []) {
      const target = studentRowIsInactive(row) ? inactive : active;
      for (const key of rowPhoneKeys(row)) target.add(key);
    }
    // Aktif bir öğrencide de geçen numara susturulmaz (kardeş)
    for (const key of active) inactive.delete(key);

    cache = { at: Date.now(), muted: inactive };
    return inactive;
  } catch (e) {
    console.warn('[student-mute] liste okunamadı:', errorMessage(e));
    // Okuyamazsak kimseyi susturma: mevcut davranış bozulmasın
    return cache.muted.size ? cache.muted : new Set();
  }
}

/** Bu numaraya otomatik mesaj gitmeli mi? */
export async function isAutomationMutedPhone(phone) {
  const key = phoneKey(phone);
  if (!key) return false;
  const muted = await loadMutedPhoneKeys();
  return muted.has(key);
}

/** Öğrenci kimliğiyle doğrudan kontrol (kimliği elinde olan otomasyonlar için). */
export async function isStudentInactive(studentId) {
  const id = String(studentId || '').trim();
  if (!id) return false;
  try {
    const { data, error } = await supabaseAdmin
      .from('students')
      .select('id, enrollment_status, deleted_at')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return false;
    return studentRowIsInactive(data);
  } catch {
    return false;
  }
}

/** Test / öğrenci güncellemesi sonrası önbelleği düşür. */
export function resetMutedPhoneCache() {
  cache = { at: 0, muted: new Set() };
}
