/**
 * Yazılıya hazırlık ekranı çakışma kontrolü (sunucudaki kurallarla aynı):
 * - Aynı sınıfın aynı saatte iki dersi olamaz.
 * - Aynı öğretmen aynı saatte iki derste olamaz; ancak farklı sınıfta AYNI ders
 *   ortak (birleşik) derstir, çakışma sayılmaz.
 * - Etüt / Deneme / Din / Ödev / Kitap okuma / Soru çözüm ortak oda dersleri öğretmen çakışması üretmez.
 */
import type { Durum } from './YaziliProgramPage';

export type CakismaAday = {
  id?: string;
  class_id: string;
  teacher_id: string | null;
  subject: string;
  lesson_date: string;
  start_time: string;
  end_time: string;
};

const dk = (t: string) => {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};
const ortusur = (a: { start_time: string; end_time: string }, b: { start_time: string; end_time: string }) =>
  dk(a.start_time) < dk(b.end_time) && dk(a.end_time) > dk(b.start_time);

/** "Matematik (yazılıya hazırlık)" → "matematik" */
const dersAnahtari = (s: string) =>
  String(s || '')
    .replace(/\s*\(yazılıya hazırlık\)\s*$/i, '')
    .trim()
    .toLocaleLowerCase('tr')
    .replace(/\s+/g, ' ');

export function ortakOdaDersi(subject: string) {
  const s = String(subject || '').trim().toLocaleUpperCase('tr-TR');
  return (
    /ET[ÜU]T|DENEME|DİN|ÖDEV|ODEV|KİTAP|KITAP/.test(s) ||
    /soru[\s-]?çözüm|soru[\s-]?cozum/i.test(String(subject || ''))
  );
}

const saatYaz = (x: { start_time: string; end_time: string }) => `${x.start_time.slice(0, 5)}–${x.end_time.slice(0, 5)}`;

/** Aynı gün, saat aralığı çakışan tüm dersler (canlı dersler + hazırlık taslakları) */
function gununDersleri(durum: Durum, d: CakismaAday) {
  const out: CakismaAday[] = [];
  for (const s of durum.sessions as CakismaAday[]) {
    if (!s.lesson_date || s.lesson_date !== d.lesson_date) continue;
    if (d.id && s.id === d.id) continue;
    if (ortusur(s, d)) out.push(s);
  }
  for (const i of durum.items) {
    if (i.lesson_date !== d.lesson_date) continue;
    if (d.id && i.id === d.id) continue;
    if (ortusur(i, d)) out.push(i as CakismaAday);
  }
  return out;
}

/**
 * Dersin çakışmaları; okunur cümleler döner.
 * Ör. "Öğretmen çakışması: Ali Aktaş bu saatte 11B · Fizik dersinde (10:00–10:40)"
 */
export function cakismalar(
  durum: Durum,
  d: CakismaAday,
  sinifAd: Map<string, string>,
  ogretmenAd?: Map<string, string>
): string[] {
  if (!d.lesson_date || !(dk(d.end_time) > dk(d.start_time))) return [];
  const out: string[] = [];
  const digerleri = gununDersleri(durum, d);

  const sinif = digerleri.find((x) => x.class_id === d.class_id);
  if (sinif) out.push(`Sınıfın bu saatte başka dersi var: ${sinif.subject} (${saatYaz(sinif)})`);

  if (d.teacher_id && !ortakOdaDersi(d.subject)) {
    const ogr = digerleri.find(
      (x) =>
        x.teacher_id === d.teacher_id &&
        !ortakOdaDersi(x.subject) &&
        // farklı sınıfta aynı ders = ortak ders, çakışma değil
        !(x.class_id !== d.class_id && dersAnahtari(x.subject) === dersAnahtari(d.subject))
    );
    if (ogr && ogr !== sinif) {
      const ad = ogretmenAd?.get(d.teacher_id) || 'Öğretmen';
      out.push(`Öğretmen çakışması: ${ad} bu saatte ${sinifAd.get(ogr.class_id) || 'başka sınıf'} · ${ogr.subject} dersinde (${saatYaz(ogr)})`);
    }
  }
  return out;
}

