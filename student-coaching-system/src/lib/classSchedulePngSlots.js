/**
 * Haftalık ders programı PNG satırları: şablon + tarihli oturum birleşimi.
 * 8C gibi yalnızca tarihli oturumu olan sınıflarda PNG boş kalmasın.
 */

export function fmtHm(t) {
  const raw = String(t || '').trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return raw.slice(0, 5);
  return `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`;
}

/** Pazartesi=1 … Pazar=7 (YYYY-MM-DD, yerel takvim) */
export function isoToDowMon1(iso) {
  const s = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return 0;
  const [y, m, d] = s.split('-').map(Number);
  const jd = new Date(y, m - 1, d).getDay();
  return jd === 0 ? 7 : jd;
}

function slotKey(dayOfWeek, startTime) {
  return `${Number(dayOfWeek)}|${fmtHm(startTime)}`;
}

/**
 * Aynı gün+saat için tarihli oturum şablonu ezer.
 * Pazar (7) planlayıcı tablosunda yok — atlanır.
 */
export function mergeWeeklyAndSessionSlots(weekly, sessions) {
  const out = [];
  const seen = new Set();

  for (const s of sessions || []) {
    if (String(s.status || '').toLowerCase() === 'cancelled') continue;
    const day = isoToDowMon1(s.lesson_date);
    if (day < 1 || day > 6) continue;
    const key = slotKey(day, s.start_time);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      day_of_week: day,
      start_time: String(s.start_time || ''),
      end_time: String(s.end_time || ''),
      subject: String(s.subject || ''),
      teacher_name: s.teacher_name || null
    });
  }

  for (const w of weekly || []) {
    const day = Number(w.day_of_week);
    if (day < 1 || day > 6) continue;
    const key = slotKey(day, w.start_time);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      day_of_week: day,
      start_time: String(w.start_time || ''),
      end_time: String(w.end_time || ''),
      subject: String(w.subject || ''),
      teacher_name: w.teacher_name || null
    });
  }

  return out;
}
