/** Deneme sınav takvimi — sınıf eşlemesi ve başlangıç verisi */
import { supabaseAdmin } from './supabase-admin.js';
import { EXAM_CALENDAR_SEED } from './exam-calendar-seed.js';
import { PLATFORM_PRIMARY_INSTITUTION_ID } from './quota-enforce.js';

/** Takvim kurum bazlı: boş / platform kimliği = Online VIP takvimi */
export function examCalendarInstitutionId(institutionId) {
  const id = String(institutionId || '').trim();
  return id || PLATFORM_PRIMARY_INSTITUTION_ID;
}

export function isPlatformExamCalendar(institutionId) {
  return examCalendarInstitutionId(institutionId) === PLATFORM_PRIMARY_INSTITUTION_ID;
}

export const EXAM_CALENDAR_LEVELS = ['9', '10', '11', 'yks'];

/**
 * Öğrencinin class_level değeri → takvim sınıfı. Eşleşmezse null (takvim yok).
 * 9 / 10 / 11 → kendi sınıfı; 12, YKS, YKS-Sayısal, TYT, AYT, Mezun → yks.
 * LGS, YÖS, 2–8. sınıf → null.
 */
export function examCalendarLevelForClassLevel(classLevel) {
  const s = String(classLevel ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR');
  if (!s) return null;
  if (/\byos\b|yös/.test(s)) return null;
  if (/\b(yks|tyt|ayt|mezun)\b/.test(s)) return 'yks';
  const m = s.match(/(?:^|[^\d])(9|10|11|12)(?:[^\d]|$)/);
  if (m) return m[1] === '12' ? 'yks' : m[1];
  return null;
}

let seedChecked = false;

/**
 * Platform takvimi boşsa başlangıç verisini bir kez yükler.
 * Diğer kurumlar kendi takvimini kendisi girer — platformun verisi kopyalanmaz.
 */
export async function ensureExamCalendarSeeded(institutionId) {
  if (!isPlatformExamCalendar(institutionId)) return;
  if (seedChecked) return;
  const { count, error } = await supabaseAdmin
    .from('exam_calendar')
    .select('id', { count: 'exact', head: true })
    .eq('institution_id', PLATFORM_PRIMARY_INSTITUTION_ID);
  if (error) throw new Error(error.message);
  if ((count || 0) === 0) {
    const seed = EXAM_CALENDAR_SEED.map((row) => ({
      ...row,
      institution_id: PLATFORM_PRIMARY_INSTITUTION_ID
    }));
    const { error: insErr } = await supabaseAdmin
      .from('exam_calendar')
      .upsert(seed, { onConflict: 'id', ignoreDuplicates: true });
    if (insErr) throw new Error(insErr.message);
  }
  seedChecked = true;
}
