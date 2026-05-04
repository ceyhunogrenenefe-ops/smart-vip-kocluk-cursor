/** teacher_lessons.lesson_date + start_time → UTC epoch (Europe/Istanbul +03:00) */

export function normalizeTimeForParse(raw) {
  const s = String(raw || '').trim();
  if (!s) return '00:00:00';
  if (/^\d{1,2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) return s;
  return '00:00:00';
}

export function wallTimeToUtcMs(lessonDate, timeStr) {
  const t = normalizeTimeForParse(timeStr);
  const iso = `${lessonDate}T${t}+03:00`;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}
