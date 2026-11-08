/**
 * Junior VIP — tarih / saat çözümleme. Tüm "bugün / yarın / pazartesi" ifadeleri Europe/Istanbul
 * takvim gününe göre hesaplanır (sunucu UTC'de çalışsa da gece yarısına yakın saatlerde doğru gün).
 */
import { addCalendarDaysYmd, getIstanbulDateString, isoWeekdayMon1Istanbul } from './istanbul-time.js';
import { trNorm } from './junior-vip-text.js';

const TZ = 'Europe/Istanbul';

export function istanbulToday(now = new Date()) {
  return getIstanbulDateString(now);
}

/** Şu anki İstanbul saati "HH:MM" */
export function istanbulHhmm(now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
    .format(now)
    .replace(/^24/, '00');
}

/** Pazartesi başlangıçlı hafta (YYYY-MM-DD). */
export function weekStartYmd(ymd) {
  const wd = isoWeekdayMon1Istanbul(ymd);
  if (!wd) return ymd;
  return addCalendarDaysYmd(ymd, -(wd - 1));
}

export function weekRangeYmd(ymd) {
  const from = weekStartYmd(ymd);
  return { from, to: addCalendarDaysYmd(from, 6) };
}

/** İstanbul takvim aylık anahtar "YYYY-MM". */
export function istanbulMonthKey(now = new Date()) {
  return istanbulToday(now).slice(0, 7);
}

const WEEKDAYS = [
  { re: /\bpazartesi/, n: 1 },
  { re: /\bsali\b|\bsaliya\b|\bsalidan\b|\bsalinin\b|\bsali /, n: 2 },
  { re: /\bcarsamba/, n: 3 },
  { re: /\bpersembe/, n: 4 },
  { re: /\bcuma(?!rtesi)/, n: 5 },
  { re: /\bcumartesi/, n: 6 },
  { re: /\bpazar(?!tesi)/, n: 7 }
];

const MONTHS = {
  ocak: 1,
  subat: 2,
  mart: 3,
  nisan: 4,
  mayis: 5,
  haziran: 6,
  temmuz: 7,
  agustos: 8,
  eylul: 9,
  ekim: 10,
  kasim: 11,
  aralik: 12
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

function validYmd(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Metindeki tarih ifadesini çözer.
 * @param {string} text
 * @param {{ now?: Date, direction?: 'future'|'past' }} opts
 *   direction: plan eklerken gün adı "önümüzdeki" günü, çözülen soru kaydında "son geçen" günü gösterir.
 * @returns {{ date: string, source: string } | null}
 */
export function resolveDateExpression(text, { now = new Date(), direction = 'future' } = {}) {
  const t = trNorm(text);
  const today = istanbulToday(now);

  if (/\bobur gun\b|\bobur gune\b/.test(t)) return { date: addCalendarDaysYmd(today, 2), source: 'öbür gün' };
  if (/\byarin\b|\byarina\b|\byarinki\b|\byarinin\b/.test(t)) return { date: addCalendarDaysYmd(today, 1), source: 'yarın' };
  if (/\bdun\b|\bdunku\b|\bdune\b|\bdunun\b/.test(t)) return { date: addCalendarDaysYmd(today, -1), source: 'dün' };
  if (/\bbugun|\bbu aksam|\bbu gece|\bbu sabah|\bbu ogle|\bsimdi|\bdemin|\baz once/.test(t)) {
    return { date: today, source: 'bugün' };
  }

  // 12.11 / 12/11 / 12.11.2026 / 2026-11-12
  const iso = t.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso && validYmd(+iso[1], +iso[2], +iso[3])) return { date: `${iso[1]}-${iso[2]}-${iso[3]}`, source: 'tarih', raw: iso[0] };
  const dm = t.match(/(?<![\d:])(\d{1,2})[./](\d{1,2})(?:[./](20\d{2}))?(?![\d:])/);
  if (dm) {
    const d = +dm[1];
    const m = +dm[2];
    // saat ifadesi ("19.00") ile karışmasın: ay 1-12 ve ikinci kısım iki haneli 00 değil
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && !/^\d{1,2}[.:]00$/.test(`${dm[1]}.${dm[2]}`)) {
      let y = dm[3] ? +dm[3] : +today.slice(0, 4);
      if (validYmd(y, m, d)) {
        let ymd = `${y}-${pad2(m)}-${pad2(d)}`;
        if (!dm[3] && direction === 'future' && ymd < addCalendarDaysYmd(today, -60)) {
          y += 1;
          if (validYmd(y, m, d)) ymd = `${y}-${pad2(m)}-${pad2(d)}`;
        }
        return { date: ymd, source: 'tarih', raw: dm[0] };
      }
    }
  }
  // "12 kasım"
  const dmName = t.match(/\b(\d{1,2})\s+(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)/);
  if (dmName) {
    const d = +dmName[1];
    const m = MONTHS[dmName[2]];
    let y = +today.slice(0, 4);
    if (validYmd(y, m, d)) {
      let ymd = `${y}-${pad2(m)}-${pad2(d)}`;
      if (direction === 'future' && ymd < addCalendarDaysYmd(today, -60)) ymd = `${y + 1}-${pad2(m)}-${pad2(d)}`;
      return { date: ymd, source: 'tarih', raw: dmName[0] };
    }
  }

  const nextWeek = /\bhaftaya\b|\bgelecek hafta|\bonumuzdeki hafta|\bsonraki hafta/.test(t);
  const lastWeek = /\bgecen hafta|\bonceki hafta/.test(t);
  for (const w of WEEKDAYS) {
    if (!w.re.test(t)) continue;
    const todayWd = isoWeekdayMon1Istanbul(today);
    if (nextWeek) {
      const nextMon = addCalendarDaysYmd(weekStartYmd(today), 7);
      return { date: addCalendarDaysYmd(nextMon, w.n - 1), source: 'gelecek hafta' };
    }
    if (lastWeek) {
      const prevMon = addCalendarDaysYmd(weekStartYmd(today), -7);
      return { date: addCalendarDaysYmd(prevMon, w.n - 1), source: 'geçen hafta' };
    }
    let diff = w.n - todayWd;
    if (direction === 'past') {
      if (diff > 0) diff -= 7;
    } else if (diff < 0) {
      diff += 7;
    }
    return { date: addCalendarDaysYmd(today, diff), source: 'gün adı' };
  }
  return null;
}

/**
 * Metindeki saat ifadesini "HH:MM" olarak çözer. Belirsiz tek sayı ("7'de") için gün dilimi
 * ipucu yoksa null döner — saat uydurulmaz.
 */
export function resolveTimeExpression(text) {
  const t = trNorm(text);
  const hm = t.match(/(?<!\d)([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)/);
  if (hm) {
    // "12.11" gibi tarih ile karışmasın: saat bağlamı veya dakika 00/15/30/45 ya da "saat" kelimesi
    const minute = hm[2];
    const raw = hm[0];
    const after = t.slice(t.indexOf(raw) + raw.length);
    const looksLikeTime =
      raw.includes(':') ||
      /\bsaat\b|\bsularinda\b/.test(t) ||
      ['00', '15', '30', '45'].includes(minute) ||
      /^\s*(?:de|da|te|ta|gibi|civari|sularinda)\b/.test(after) ||
      t.trim() === raw;
    if (looksLikeTime) return `${pad2(+hm[1])}:${minute}`;
  }
  const part = t.match(/\b(sabah|ogle(?:den sonra)?|ikindi|aksam|gece)\s+(?:saat\s+)?(\d{1,2})(?:[:.](\d{2}))?(?!\d)/);
  if (part) {
    let h = +part[2];
    const m = part[3] ? +part[3] : 0;
    const p = part[1];
    if ((p.startsWith('ogle') || p === 'ikindi' || p === 'aksam') && h < 12) h += 12;
    if (p === 'gece' && h >= 7 && h < 12) h += 12;
    if (h <= 23 && m <= 59) return `${pad2(h)}:${pad2(m)}`;
  }
  const saat = t.match(/\bsaat\s+(\d{1,2})(?:[:.](\d{2}))?(?!\d)/);
  if (saat) {
    const h = +saat[1];
    const m = saat[2] ? +saat[2] : 0;
    // 13-23 açık; 0-12 ise öğleden sonra mı belirsiz → yalnız 8-12 arası sabah varsayılmaz
    if (h >= 13 && h <= 23) return `${pad2(h)}:${pad2(m)}`;
    if (h === 0 || h === 12) return `${pad2(h)}:${pad2(m)}`;
    return null;
  }
  // Yalnız saat cevabı: "19", "19'da"
  const bare = t.match(/^(\d{1,2})\s*(?:de|da|te|ta)?$/);
  if (bare) {
    const h = +bare[1];
    if (h >= 13 && h <= 23) return `${pad2(h)}:00`;
  }
  return null;
}

export function addMinutesHhmm(hhmm, minutes) {
  const [h, m] = String(hhmm).split(':').map((x) => parseInt(x, 10));
  const total = h * 60 + m + minutes;
  // Planlayıcı 00:00–01:59'u ertesi gün sayar; gün içinde kalmak için 23:59'da kes.
  const capped = Math.min(total, 23 * 60 + 59);
  return `${pad2(Math.floor(capped / 60))}:${pad2(capped % 60)}`;
}
