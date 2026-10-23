import { studyRoomsForClassLevel, type StudyEntryKey } from './academicCenterLinks';
import { isEtutSubject } from './etutSession';

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

export function buSaattekiEtutler(input: {
  room: StudyEntryKey;
  sessions: EtutOturum[];
  classes: EtutSinif[];
  today: string;
  nowMinutes: number;
}): Array<EtutOturum & { className: string }> {
  const byId = new Map(input.classes.map((c) => [c.id, c]));
  const out: Array<EtutOturum & { className: string }> = [];
  for (const s of input.sessions) {
    if (String(s.lesson_date || '').slice(0, 10) !== input.today) continue;
    if (String(s.status || '') === 'cancelled') continue;
    if (!isEtutSubject(s.subject)) continue;
    if (!etutSaatindeMi(s.start_time, s.end_time, input.nowMinutes)) continue;
    const cls = byId.get(s.class_id);
    if (!cls) continue;
    const rooms = studyRoomsForClassLevel(cls.class_level, cls.name);
    if (!rooms?.includes(input.room)) continue;
    out.push({ ...s, className: cls.name || 'Sınıf' });
  }
  out.sort((a, b) => a.className.localeCompare(b.className, 'tr') || a.start_time.localeCompare(b.start_time));
  return out;
}
