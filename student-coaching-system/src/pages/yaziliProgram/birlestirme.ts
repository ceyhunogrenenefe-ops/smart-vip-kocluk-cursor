/** Sınıf birleştirme planı (ortak program): saf hesap, arayüzden ayrı. */
import type { Durum, Mesgul } from './YaziliProgramPage';

export type Oturum = Mesgul & { id: string; lesson_date: string };

export const dk = (t: string) => {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};
const ortusur = (a: Oturum, b: Oturum) => dk(a.start_time) < dk(b.end_time) && dk(a.end_time) > dk(b.start_time);
export const dersAnahtari = (s: string) => String(s || '').trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ');
const anahtar = (s: Oturum) =>
  [s.lesson_date, s.start_time, s.end_time, dersAnahtari(s.subject), s.teacher_id || ''].join('|');
export const bugunIst = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
export const kisa = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', weekday: 'short', timeZone: 'UTC' });
};

/** "11A 2026-2027" / "11 A SINIFI" → 11 (aynı seviyedeki sınıfları öne almak için) */
export const seviye = (ad: string) => {
  const m = String(ad || '').replace(/\b20\d{2}\s*[-–]\s*20\d{2}\b/g, ' ').match(/\b(\d{1,2})\s*[-/]?\s*[A-ZÇĞİÖŞÜ]?\b/i);
  return m ? Number(m[1]) : null;
};

export type BirlestirmePlani = { eklenecek: Oturum[]; iptal: Oturum[]; ayni: number; korunan: Oturum[] };

/**
 * B sınıfının programını A ile aynı yapma planı (bugünden itibaren, seçili aralıkta).
 * - A'da olup B'de olmayan dersler B'ye eklenir (aynı öğretmen / saat / ders → ortak ders, tek canlı oda).
 * - B'nin A'nın dersleriyle aynı saate düşen farklı dersleri iptal edilir.
 * - tamamen=true ise B'nin A'da karşılığı olmayan diğer dersleri de iptal edilir.
 */
export function birlestirmePlani(durum: Durum, aId: string, bId: string, bas: string, bit: string, tamamen: boolean): BirlestirmePlani {
  const aralikta = (s: Oturum) => s.id && s.lesson_date >= bas && s.lesson_date <= bit;
  const a = (durum.sessions as Oturum[]).filter((s) => s.class_id === aId && aralikta(s));
  const b = (durum.sessions as Oturum[]).filter((s) => s.class_id === bId && aralikta(s));
  const aK = new Set(a.map(anahtar));
  const bK = new Set(b.map(anahtar));
  const eklenecek = a.filter((s) => !bK.has(anahtar(s)));
  const iptal: Oturum[] = [];
  const korunan: Oturum[] = [];
  let ayni = 0;
  for (const s of b) {
    if (aK.has(anahtar(s))) {
      ayni += 1;
      continue;
    }
    const cakisan = a.some((x) => x.lesson_date === s.lesson_date && ortusur(x, s));
    if (tamamen || cakisan) iptal.push(s);
    else korunan.push(s);
  }
  return { eklenecek, iptal, ayni, korunan };
}

