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

/**
 * Takvim kademeleri. İlkokul ve ortaokul (3–7, LGS) Deneme Kulübü için
 * eklendi; önceden yalnız lise ve YKS vardı ve bu kademelerin takvimi hiç
 * girilemiyordu.
 */
export const EXAM_CALENDAR_LEVELS = ['3', '4', '5', '6', '7', 'lgs', '9', '10', '11', 'yks'];

/** Ekranlarda ve sitede görünen adlar — tek kaynak. */
export const EXAM_CALENDAR_LEVEL_LABELS = {
  3: '3. Sınıf',
  4: '4. Sınıf',
  5: '5. Sınıf',
  6: '6. Sınıf',
  7: '7. Sınıf',
  lgs: 'LGS (8. Sınıf)',
  9: '9. Sınıf',
  10: '10. Sınıf',
  11: '11. Sınıf',
  yks: 'YKS (12 / Mezun)'
};

export function examCalendarLevelLabel(level) {
  const k = String(level ?? '').trim().toLocaleLowerCase('tr-TR');
  return EXAM_CALENDAR_LEVEL_LABELS[k] || String(level ?? '');
}

/**
 * Öğrencinin class_level değeri → takvim sınıfı. Eşleşmezse null (takvim yok).
 *
 * 3–7 → kendi sınıfı; 8 ve "LGS" → lgs; 9 / 10 / 11 → kendi sınıfı;
 * 12, YKS, TYT, AYT, Mezun → yks. YÖS'ün ayrı takvimi yok → null.
 *
 * Sıra önemli: "LGS" metni rakam içermediği için sayı eşlemesinden ÖNCE
 * bakılır; "8. sınıf" yazımı da aynı kademeye düşer.
 */
export function examCalendarLevelForClassLevel(classLevel) {
  const s = String(classLevel ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR');
  if (!s) return null;
  if (/\byos\b|yös/.test(s)) return null;
  if (/\blgs\b/.test(s)) return 'lgs';
  if (/\b(yks|tyt|ayt|mezun)\b/.test(s)) return 'yks';
  const m = s.match(/(?:^|[^\d])(3|4|5|6|7|8|9|10|11|12)(?:[^\d]|$)/);
  if (!m) return null;
  if (m[1] === '8') return 'lgs';
  if (m[1] === '12') return 'yks';
  return m[1];
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
