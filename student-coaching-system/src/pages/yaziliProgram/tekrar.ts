/**
 * Haftalık tekrar: seçili tarih aralığında bir dersi her haftaya uygulamak.
 *
 * - "Seri": aynı sınıf, aynı ders adı, aynı öğretmen, aynı saat; tam 7, 14, 21… gün sonraki dersler.
 *   Haftalık şablondan üretilen dersler de, toplu oluşturulanlar da bu kurala uyar.
 * - Ekleme: çakışma olmayan haftalara canlı ders oluşturulur; çakışan haftalar atlanır ve listelenir.
 * - Düzenleme: "bu ve sonraki haftalar" mevcut eş dersleri değiştirir; "her hafta" eksik haftalara da ekler.
 */
import { apiFetch } from '../../lib/session';
import type { Durum, Mesgul } from './YaziliProgramPage';
import { cakismalar } from './cakisma';
import { bagliSiniflar, ortakIptal, ortakTasi, type OrtakSonuc } from './ortak';
import type { OturumHedef, OturumKaynak } from './oturumIslem';

export type Oturum = Mesgul & { id: string; lesson_date: string };
export type Atlanan = { tarih: string; sebep: string };
export type TekrarSonuc = { islenen: number; eklenen: number; atlanan: Atlanan[]; ortak: OrtakSonuc };

const tarihNesne = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
export const gunEkle = (iso: string, n: number) => {
  const t = tarihNesne(iso);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
export const gunFarki = (a: string, b: string) => Math.round((tarihNesne(b).getTime() - tarihNesne(a).getTime()) / 86400000);
const dk = (t: string) => {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};
const dersAnahtari = (s: string) => String(s || '').trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ');
const kisa = (iso: string) => tarihNesne(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Başlangıçtan sonraki haftalar (aynı gün): baslangic+7, +14 … bitis'e kadar */
export function sonrakiHaftalar(baslangic: string, bitis: string): string[] {
  const out: string[] = [];
  for (let k = 1; k <= 60; k += 1) {
    const t = gunEkle(baslangic, 7 * k);
    if (t > bitis) break;
    out.push(t);
  }
  return out;
}

/** Dersin sonraki haftalardaki eşleri: hafta sırası (1, 2, …) → ders */
export function seriEsleri(durum: Durum, o: Oturum, bitis: string): Map<number, Oturum> {
  const out = new Map<number, Oturum>();
  const hedef = new Map(sonrakiHaftalar(o.lesson_date, bitis).map((t, i) => [t, i + 1]));
  for (const s of durum.sessions as Oturum[]) {
    if (!s.id || s.id === o.id || s.class_id !== o.class_id) continue;
    const k = hedef.get(s.lesson_date);
    if (!k || out.has(k)) continue;
    if (s.start_time !== o.start_time || s.end_time !== o.end_time) continue;
    if (dersAnahtari(s.subject) !== dersAnahtari(o.subject)) continue;
    if ((s.teacher_id || '') !== (o.teacher_id || '')) continue;
    out.set(k, s);
  }
  return out;
}

type YeniDers = { class_id: string; teacher_id: string | null; subject: string; start_time: string; end_time: string };

/** Ardışık haftaları tek istekte oluşturur (sunucu öğretmen çakışan haftaları atlar). */
export async function haftalikOlustur(p: YeniDers, tarihler: string[]): Promise<{ eklenen: number; atlanan: Atlanan[] }> {
  const sirali = [...new Set(tarihler)].sort();
  const parcalar: string[][] = [];
  for (const t of sirali) {
    const son = parcalar[parcalar.length - 1];
    if (son && gunFarki(son[son.length - 1], t) === 7) son.push(t);
    else parcalar.push([t]);
  }
  let eklenen = 0;
  const atlanan: Atlanan[] = [];
  for (const parca of parcalar) {
    const res = await apiFetch('/api/class-live-lessons?op=bulk-schedule-sessions', {
      method: 'POST',
      body: JSON.stringify({
        ...p,
        teacher_id: p.teacher_id || undefined,
        lesson_date: parca[0],
        duration_minutes: dk(p.end_time) - dk(p.start_time),
        repeat_interval_days: parca.length > 1 ? 7 : 0,
        occurrences: parca.length
      })
    });
    const j = (await res.json().catch(() => ({}))) as {
      data?: unknown[];
      skipped?: { lesson_date: string; reason?: string }[];
      error?: string;
      message?: string;
      hint?: string;
    };
    for (const s of j.skipped || []) atlanan.push({ tarih: s.lesson_date, sebep: s.reason || 'Öğretmen çakışması' });
    if (!res.ok) {
      if (res.status === 409 && j.skipped?.length) continue;
      const msg = j.message || j.hint || j.error || `İşlem başarısız (${res.status})`;
      throw new Error(/teacher_required/.test(msg) ? 'Öğretmen seçin.' : msg);
    }
    eklenen += (j.data || []).length;
  }
  return { eklenen, atlanan };
}

/** Bir tarihteki aday dersin çakışmaları (kendi eşi hariç) */
function tarihCakismasi(durum: Durum, p: YeniDers & { lesson_date: string; id?: string }, sinifAd: Map<string, string>) {
  return cakismalar(durum, p, sinifAd);
}

/**
 * Yeni dersi verilen haftalara ekler (bağlı sınıflar dahil). Sınıf / öğretmen çakışması olan haftalar atlanır.
 * İlk tarih (asıl gün) de listeye dahil edilmelidir.
 */
export async function haftalaraEkle(
  durum: Durum,
  p: YeniDers,
  tarihler: string[],
  sinifAd: Map<string, string>
): Promise<TekrarSonuc> {
  const sonuc: TekrarSonuc = { islenen: 0, eklenen: 0, atlanan: [], ortak: { uygulanan: 0, eslesmeyen: [] } };
  const uygun: string[] = [];
  for (const t of tarihler) {
    const c = tarihCakismasi(durum, { ...p, lesson_date: t }, sinifAd);
    if (c.length) sonuc.atlanan.push({ tarih: t, sebep: c[0] });
    else uygun.push(t);
  }
  if (!uygun.length) return sonuc;
  const ana = await haftalikOlustur(p, uygun);
  sonuc.eklenen += ana.eklenen;
  sonuc.atlanan.push(...ana.atlanan);
  // Bağlı sınıflar (ortak program): aynı haftalara aynı ders
  const bagli = new Map<string, string[]>();
  for (const t of uygun) {
    if (ana.atlanan.some((a) => a.tarih === t)) continue;
    for (const c of bagliSiniflar(durum, p.class_id, t)) bagli.set(c, [...(bagli.get(c) || []), t]);
  }
  for (const [c, ts] of bagli) {
    const r = await haftalikOlustur({ ...p, class_id: c }, ts);
    sonuc.ortak.uygulanan += r.eklenen;
  }
  sonuc.atlanan.sort((a, b) => a.tarih.localeCompare(b.tarih));
  return sonuc;
}

export type SeriKapsam = 'tek' | 'sonraki' | 'herHafta';

/**
 * Düzenlenen dersin değişikliğini sonraki haftalara uygular (asıl ders ayrıca kaydedilmiş olmalı).
 * - sonraki: mevcut eş dersler aynı şekilde değiştirilir (gün kayması dahil).
 * - herHafta: ayrıca dersi olmayan haftalara yeni ders eklenir.
 */
export async function seriyeUygula(
  durum: Durum,
  o: Oturum,
  h: Required<Pick<OturumHedef, 'lesson_date' | 'start_time' | 'end_time'>> & { subject: string; teacher_id: string | null },
  kapsam: Exclude<SeriKapsam, 'tek'>,
  sinifAd: Map<string, string>,
  ilerleme?: (yapilan: number, toplam: number) => void
): Promise<TekrarSonuc> {
  const bitis = durum.ayar.bitis;
  const kayma = gunFarki(o.lesson_date, h.lesson_date);
  const esler = seriEsleri(durum, o, bitis);
  const sonuc: TekrarSonuc = { islenen: 0, eklenen: 0, atlanan: [], ortak: { uygulanan: 0, eslesmeyen: [] } };

  const haftalar = sonrakiHaftalar(o.lesson_date, bitis).map((t, i) => ({ k: i + 1, eski: t, yeni: gunEkle(t, kayma) }));
  const eklenecek: string[] = [];
  const toplam = haftalar.length;
  let yapilan = 0;
  for (const w of haftalar) {
    const es = esler.get(w.k);
    if (es) {
      const aday = { ...h, id: es.id, class_id: es.class_id, lesson_date: w.yeni };
      const c = tarihCakismasi(durum, aday, sinifAd);
      if (c.length) {
        sonuc.atlanan.push({ tarih: w.yeni, sebep: c[0] });
      } else {
        try {
          const s = await ortakTasi(durum, es as OturumKaynak, { ...h, lesson_date: w.yeni });
          sonuc.islenen += 1;
          sonuc.ortak.uygulanan += s.uygulanan;
          sonuc.ortak.eslesmeyen.push(...s.eslesmeyen);
        } catch (e) {
          sonuc.atlanan.push({ tarih: w.yeni, sebep: e instanceof Error ? e.message : 'Güncellenemedi' });
        }
      }
    } else if (kapsam === 'herHafta' && w.yeni <= bitis) {
      eklenecek.push(w.yeni);
    }
    yapilan += 1;
    ilerleme?.(yapilan, toplam);
  }
  if (eklenecek.length) {
    const r = await haftalaraEkle(
      durum,
      { class_id: o.class_id, teacher_id: h.teacher_id, subject: h.subject, start_time: h.start_time, end_time: h.end_time },
      eklenecek,
      sinifAd
    );
    sonuc.eklenen += r.eklenen;
    sonuc.atlanan.push(...r.atlanan);
    sonuc.ortak.uygulanan += r.ortak.uygulanan;
  }
  sonuc.ortak.eslesmeyen = [...new Set(sonuc.ortak.eslesmeyen)];
  sonuc.atlanan.sort((a, b) => a.tarih.localeCompare(b.tarih));
  return sonuc;
}

/** Dersi ve sonraki haftalardaki eşlerini iptal eder (bağlı sınıflar dahil). */
export async function seriyiIptalEt(durum: Durum, o: Oturum): Promise<TekrarSonuc> {
  const sonuc: TekrarSonuc = { islenen: 0, eklenen: 0, atlanan: [], ortak: { uygulanan: 0, eslesmeyen: [] } };
  const hepsi = [o, ...seriEsleri(durum, o, durum.ayar.bitis).values()];
  for (const s of hepsi) {
    try {
      const r = await ortakIptal(durum, s as OturumKaynak);
      sonuc.islenen += 1;
      sonuc.ortak.uygulanan += r.uygulanan;
      sonuc.ortak.eslesmeyen.push(...r.eslesmeyen);
    } catch (e) {
      sonuc.atlanan.push({ tarih: s.lesson_date, sebep: e instanceof Error ? e.message : 'İptal edilemedi' });
    }
  }
  sonuc.ortak.eslesmeyen = [...new Set(sonuc.ortak.eslesmeyen)];
  return sonuc;
}

/** Kullanıcıya gösterilecek atlanan hafta satırları */
export const atlananYaz = (a: Atlanan) => `${kisa(a.tarih)}: ${a.sebep}`;
