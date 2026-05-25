const TZ = 'Europe/Istanbul';

/** YYYY-MM-DD (İstanbul takvim günü) */
export function getIstanbulDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

export function getIstanbulHour(date = new Date()) {
  const s = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: 'numeric',
    hour12: false
  }).format(date);
  return parseInt(s, 10);
}

export function getIstanbulMinute(date = new Date()) {
  const s = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    minute: 'numeric'
  }).format(date);
  return parseInt(s, 10);
}

/** Örn. Sat, Sun, Mon */
export function getIstanbulWeekdayShort(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short'
  }).format(date);
}

/** Pazartesi=1 … Pazar=7 (İstanbul takvim günü, class_weekly_slots.day_of_week ile uyumlu) */
export function isoWeekdayMon1Istanbul(dateStr) {
  const s = String(dateStr || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const noon = new Date(`${s}T12:00:00+03:00`);
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(noon);
  const map = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[wd] ?? null;
}

/** YYYY-MM-DD (İstanbul) + gün ekle */
export function addCalendarDaysYmd(ymd, daysToAdd) {
  const t = new Date(`${String(ymd).trim().slice(0, 10)}T12:00:00+03:00`);
  if (Number.isNaN(t.getTime())) return ymd;
  t.setTime(t.getTime() + daysToAdd * 86400000);
  return getIstanbulDateString(t);
}
