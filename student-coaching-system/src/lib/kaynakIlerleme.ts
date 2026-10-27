import type { Book, WeeklyEntry } from '../types';

export type KaynakBirim = 'sayfa' | 'test';

export type KaynakDetay = {
  subject: string;
  unit: KaynakBirim;
  total: number;
};

const KIND = 'kaynak';

export function adNorm(value: string): string {
  return value.trim().toLocaleLowerCase('tr');
}

function adEslesir(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true;
  return false;
}

export function kaynakNotuYaz(detay: KaynakDetay): string {
  return JSON.stringify({
    kind: KIND,
    subject: detay.subject.trim(),
    unit: detay.unit,
    total: Math.max(0, Math.round(detay.total))
  });
}

export function kaynakNotuOku(notes?: string | null): KaynakDetay | null {
  if (!notes) return null;
  try {
    const raw = JSON.parse(notes) as { kind?: string; subject?: string; unit?: string; total?: number };
    if (raw.kind !== KIND) return null;
    const unit: KaynakBirim = raw.unit === 'test' ? 'test' : 'sayfa';
    return {
      subject: String(raw.subject || '').trim(),
      unit,
      total: Math.max(0, Number(raw.total) || 0)
    };
  } catch {
    return null;
  }
}

export function haftalikBirim(
  kaynak: { studentId: string; name: string; subject: string; unit: KaynakBirim },
  entries: WeeklyEntry[]
): number {
  const name = adNorm(kaynak.name);
  const subject = adNorm(kaynak.subject);
  if (!name) return 0;
  let sum = 0;
  for (const entry of entries) {
    if (entry.studentId !== kaynak.studentId) continue;
    const title = adNorm(entry.bookTitle || '');
    const topic = adNorm(entry.topic || '');
    const sub = adNorm(entry.subject || '');
    const ad = adEslesir(title, name) || adEslesir(topic, name);
    const ders = Boolean(subject) && sub === subject && ad;
    if (!ad && !ders) continue;
    const n =
      kaynak.unit === 'test'
        ? Number(entry.solvedQuestions) || 0
        : Number(entry.pagesRead ?? entry.readingMinutes) || 0;
    sum += n;
  }
  return sum;
}

/** Elle girilen konum ile haftalık plandaki toplamın büyüğü. İkisi toplanmaz. */
export function gosterilenKonum(manual: number, haftalik: number): number {
  return Math.max(0, Math.round(manual) || 0, Math.round(haftalik) || 0);
}

export function ilerlemeYuzde(konum: number, toplam: number): number {
  if (!toplam || toplam <= 0) return 0;
  return Math.min(100, Math.round((konum / toplam) * 100));
}

export function kaynakSatirlari(books: Book[]): Book[] {
  return books.filter((b) => b.status === 'kaynak');
}
