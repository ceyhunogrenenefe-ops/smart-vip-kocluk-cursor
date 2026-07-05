import { sortSubjectsWithStudyTracks } from './studyTrackSubjects';
import { isEtutSubject } from './etutSession';

type TopicsByClass = {
  regular: Record<string, string[]>;
  tytSubjects: Record<string, string[]>;
  aytSubjects: Record<string, string[]>;
  isYKS: boolean;
};

/** Öğrenci sınıfına göre konu havuzundaki ders listesi (Etüt hariç) */
export function listEtutReportSubjects(classLevel: number | string | undefined | null, tb: TopicsByClass): string[] {
  if (classLevel === undefined || classLevel === null || classLevel === '') return [];
  let list: string[] = [];
  if (tb.isYKS) {
    list = [...Object.keys(tb.tytSubjects), ...Object.keys(tb.aytSubjects), ...Object.keys(tb.regular)];
  } else {
    list = Object.keys(tb.regular);
  }
  return sortSubjectsWithStudyTracks(list.filter((s) => !isEtutSubject(s)));
}

export type EtutReportLine = {
  key: string;
  subject: string;
  topic: string;
  correct: number | '';
  wrong: number | '';
  blank: number | '';
};

export function etutLineKey(subject: string, topic: string) {
  return `${subject}::${topic}`;
}

export function solvedFromLine(line: EtutReportLine): number {
  const c = line.correct === '' ? 0 : line.correct;
  const w = line.wrong === '' ? 0 : line.wrong;
  const b = line.blank === '' ? 0 : line.blank;
  return c + w + b;
}
