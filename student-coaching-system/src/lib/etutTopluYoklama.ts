import {
  examRoomsForClassLevel,
  studyRoomsForClassLevel,
  type ExamEntryKey,
  type StudyEntryKey
} from './academicCenterLinks';
import { isEtutSubject } from './etutSession';
import { isDenemeJoinSubject } from './primary4567Zoom';

export type EtutSinif = {
  id: string;
  name: string;
  class_level?: string | null;
};

export type EtutOturum = {
  id: string;
  class_id: string;
  subject?: string | null;
  lesson_date: string;
  start_time: string;
  end_time: string;
  status?: string | null;
};

export function saatDakika(saat: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(saat || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Ders başlamadan 15 dk önce ve bittikten 20 dk sonraya kadar yoklama açık. */
export function etutSaatindeMi(start: string, end: string, simdi: number): boolean {
  const a = saatDakika(start);
  const b = saatDakika(end);
  if (a == null || b == null || b < a) return false;
  return simdi >= a - 15 && simdi <= b + 20;
}

/** Ardışık başlangıçlar bu kadar dakikadan açıksa ayrı etüt sayılır. */
const ETUT_DILIM_ARALIGI_DK = 40;

export type SinifliEtut = EtutOturum & { className: string };

export type EtutDilim = {
  sira: number;
  baslangic: string;
  bitis: string;
  oturumlar: SinifliEtut[];
};

function bugununOturumlari(input: {
  sessions: EtutOturum[];
  classes: EtutSinif[];
  today: string;
  konu: (subject?: string | null) => boolean;
  oda: (cls: EtutSinif) => boolean;
}): SinifliEtut[] {
  const byId = new Map(input.classes.map((c) => [c.id, c]));
  const out: SinifliEtut[] = [];
  for (const s of input.sessions) {
    if (String(s.lesson_date || '').slice(0, 10) !== input.today) continue;
    if (String(s.status || '') === 'cancelled') continue;
    if (!input.konu(s.subject)) continue;
    const cls = byId.get(s.class_id);
    if (!cls || !input.oda(cls)) continue;
    out.push({ ...s, className: cls.name || 'Sınıf' });
  }
  out.sort((a, b) => a.start_time.localeCompare(b.start_time) || a.className.localeCompare(b.className, 'tr'));
  return out;
}

export function bugununEtutleri(input: {
  room: StudyEntryKey;
  sessions: EtutOturum[];
  classes: EtutSinif[];
  today: string;
}): SinifliEtut[] {
  return bugununOturumlari({
    ...input,
    konu: (subject) => isEtutSubject(subject),
    oda: (cls) => Boolean(studyRoomsForClassLevel(cls.class_level, cls.name)?.includes(input.room))
  });
}

export function bugununDenemeleri(input: {
  room: ExamEntryKey;
  sessions: EtutOturum[];
  classes: EtutSinif[];
  today: string;
}): SinifliEtut[] {
  return bugununOturumlari({
    ...input,
    konu: (subject) => isDenemeJoinSubject(subject),
    oda: (cls) => Boolean(examRoomsForClassLevel(cls.class_level, cls.name)?.includes(input.room))
  });
}

/** Günün etütlerini saate göre 1. etüt, 2. etüt diye ayırır. */
export function etutDilimleri(oturumlar: SinifliEtut[]): EtutDilim[] {
  const sorted = [...oturumlar].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const gruplar: SinifliEtut[][] = [];
  let onceki: number | null = null;
  for (const s of sorted) {
    const bas = saatDakika(s.start_time);
    const sonGrup = gruplar[gruplar.length - 1];
    if (!sonGrup || bas == null || onceki == null || bas - onceki >= ETUT_DILIM_ARALIGI_DK) {
      gruplar.push([s]);
    } else {
      sonGrup.push(s);
    }
    if (bas != null) onceki = bas;
  }
  return gruplar.map((grup, i) => {
    const baslar = grup.map((s) => saatDakika(s.start_time)).filter((n): n is number => n != null);
    const bitisler = grup.map((s) => saatDakika(s.end_time)).filter((n): n is number => n != null);
    const ilk = Math.min(...baslar);
    const son = Math.max(...bitisler);
    const yaz = (dk: number) => `${String(Math.floor(dk / 60)).padStart(2, '0')}:${String(dk % 60).padStart(2, '0')}`;
    return {
      sira: i + 1,
      baslangic: Number.isFinite(ilk) ? yaz(ilk) : String(grup[0].start_time).slice(0, 5),
      bitis: Number.isFinite(son) ? yaz(son) : String(grup[0].end_time).slice(0, 5),
      oturumlar: grup
    };
  });
}

export function acikDilimSira(dilimler: EtutDilim[], simdi: number): number {
  for (const d of dilimler) {
    if (d.oturumlar.some((o) => etutSaatindeMi(o.start_time, o.end_time, simdi))) return d.sira;
  }
  for (const d of dilimler) {
    const bas = saatDakika(d.baslangic);
    if (bas != null && bas > simdi) return d.sira;
  }
  return dilimler[dilimler.length - 1]?.sira ?? 1;
}
