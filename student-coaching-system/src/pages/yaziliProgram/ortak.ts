/**
 * Ortak program (bağlı sınıflar): tarih aralığında birlikte düzenlenen sınıflar.
 * Bir sınıfta taşınan / eklenen / iptal edilen ders, bağlı sınıflardaki eşine de uygulanır.
 * Eş ders: aynı gün, aynı başlangıç-bitiş saati, aynı ders adı (ve varsa aynı öğretmen).
 */
import { oturumIptal, oturumOlustur, oturumTasi, type OturumHedef, type OturumKaynak } from './oturumIslem';
import type { Durum } from './YaziliProgramPage';

export type Bag = { siniflar: string[]; baslangic: string; bitis: string };

const dersAnahtari = (s: string) => String(s || '').trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ');

export function bagliSiniflar(durum: Durum, classId: string, tarih: string): string[] {
  const out = new Set<string>();
  for (const b of durum.ayar.baglar || []) {
    if (!b.siniflar.includes(classId) || tarih < b.baslangic || tarih > b.bitis) continue;
    for (const c of b.siniflar) if (c !== classId) out.add(c);
  }
  return [...out];
}

/** Sınıfın bağlı olduğu tüm gruplar (çizelge başlığında göstermek için) */
export function siniftakiBaglar(durum: Durum, classId: string): Bag[] {
  return (durum.ayar.baglar || []).filter((b) => b.siniflar.includes(classId));
}

function esiniBul(durum: Durum, sinifId: string, o: OturumKaynak): OturumKaynak | null {
  const adaylar = (durum.sessions as Array<OturumKaynak & { id?: string }>).filter(
    (s) =>
      s.id &&
      s.class_id === sinifId &&
      s.lesson_date === o.lesson_date &&
      s.start_time === o.start_time &&
      s.end_time === o.end_time &&
      dersAnahtari(s.subject) === dersAnahtari(o.subject)
  );
  return adaylar.find((s) => (s.teacher_id || '') === (o.teacher_id || '')) || adaylar[0] || null;
}

export type OrtakSonuc = { uygulanan: number; eslesmeyen: string[] };

/** Dersi taşır / düzenler; bağlı sınıflardaki eşlerine de uygular. */
export async function ortakTasi(durum: Durum, o: OturumKaynak, h: OturumHedef): Promise<OrtakSonuc> {
  const esler = bagliSiniflar(durum, o.class_id, o.lesson_date).map((c) => ({ c, es: esiniBul(durum, c, o) }));
  await oturumTasi(o, h);
  const sonuc: OrtakSonuc = { uygulanan: 0, eslesmeyen: [] };
  for (const { c, es } of esler) {
    if (!es) {
      sonuc.eslesmeyen.push(c);
      continue;
    }
    await oturumTasi(es, h);
    sonuc.uygulanan += 1;
  }
  return sonuc;
}

/** Dersi iptal eder; bağlı sınıflardaki eşlerini de iptal eder. */
export async function ortakIptal(durum: Durum, o: OturumKaynak): Promise<OrtakSonuc> {
  const esler = bagliSiniflar(durum, o.class_id, o.lesson_date).map((c) => ({ c, es: esiniBul(durum, c, o) }));
  await oturumIptal(o.id);
  const sonuc: OrtakSonuc = { uygulanan: 0, eslesmeyen: [] };
  for (const { c, es } of esler) {
    if (!es) {
      sonuc.eslesmeyen.push(c);
      continue;
    }
    await oturumIptal(es.id);
    sonuc.uygulanan += 1;
  }
  return sonuc;
}

/** Yeni ders ekler; bağlı sınıflara da aynı dersi ekler (ortak ders: aynı öğretmen, saat, ders). */
export async function ortakOlustur(
  durum: Durum,
  p: { class_id: string; teacher_id: string; subject: string; lesson_date: string; start_time: string; end_time: string }
): Promise<OrtakSonuc> {
  await oturumOlustur(p);
  const sonuc: OrtakSonuc = { uygulanan: 0, eslesmeyen: [] };
  for (const c of bagliSiniflar(durum, p.class_id, p.lesson_date)) {
    await oturumOlustur({ ...p, class_id: c });
    sonuc.uygulanan += 1;
  }
  return sonuc;
}

/** Kullanıcıya gösterilecek kısa ek not */
export function ortakNotu(s: OrtakSonuc, sinifAd: Map<string, string>): string {
  const parca: string[] = [];
  if (s.uygulanan) parca.push(`bağlı ${s.uygulanan} sınıfa da uygulandı`);
  if (s.eslesmeyen.length) {
    parca.push(`${s.eslesmeyen.map((c) => sinifAd.get(c) || 'sınıf').join(', ')} için eş ders bulunamadı; orayı ayrıca kontrol edin`);
  }
  return parca.length ? ` (${parca.join('; ')})` : '';
}
