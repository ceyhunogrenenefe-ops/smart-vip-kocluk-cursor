/** Deneme sınav takvimi — sınıf eşlemesi ve başlangıç verisi */
import { supabaseAdmin } from './supabase-admin.js';
import { EXAM_CALENDAR_SEED } from './exam-calendar-seed.js';

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

/** Tablo boşsa HTML'den gelen başlangıç verisini bir kez yükler. */
export async function ensureExamCalendarSeeded() {
  if (seedChecked) return;
  const { count, error } = await supabaseAdmin.from('exam_calendar').select('id', { count: 'exact', head: true });
  if (error) throw new Error(error.message);
  if ((count || 0) === 0) {
    const { error: insErr } = await supabaseAdmin
      .from('exam_calendar')
      .upsert(EXAM_CALENDAR_SEED, { onConflict: 'id', ignoreDuplicates: true });
    if (insErr) throw new Error(insErr.message);
  }
  seedChecked = true;
}
