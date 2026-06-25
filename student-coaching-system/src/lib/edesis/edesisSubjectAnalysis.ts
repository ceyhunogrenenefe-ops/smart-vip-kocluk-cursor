import type { ExamResult, ExamSubjectResult, ExamTopicResult } from '../../types';

export function isEdesisExam(r: ExamResult): boolean {
  return r.source === 'edesis';
}

export function sortExamsByDateDesc(exams: ExamResult[]): ExamResult[] {
  return exams
    .slice()
    .sort((a, b) => new Date(b.examDate).getTime() - new Date(a.examDate).getTime());
}

export function normalizeSubjectLabel(name: string): string {
  return String(name || '')
    .trim()
    .toLocaleUpperCase('tr-TR')
    .replace(/\s+/g, ' ');
}

export function collectSubjectNames(exams: ExamResult[]): string[] {
  const set = new Set<string>();
  for (const exam of exams) {
    for (const s of exam.subjects || []) {
      const n = normalizeSubjectLabel(s.name);
      if (n) set.add(n);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'tr'));
}

export type SubjectTrendPoint = { examDate: string; examLabel: string; net: number; wrong: number };

export function buildSubjectTrend(exams: ExamResult[], subjectName: string): SubjectTrendPoint[] {
  const key = normalizeSubjectLabel(subjectName);
  const sorted = sortExamsByDateDesc(exams).reverse();
  return sorted
    .map((exam) => {
      const sub = (exam.subjects || []).find((s) => normalizeSubjectLabel(s.name) === key);
      if (!sub) return null;
      return {
        examDate: exam.examDate,
        examLabel: exam.examTitle || exam.examType,
        net: sub.net,
        wrong: sub.wrong
      };
    })
    .filter(Boolean) as SubjectTrendPoint[];
}

export type SubjectSummaryRow = {
  name: string;
  examCount: number;
  avgNet: number;
  lastNet: number;
  bestNet: number;
  totalWrong: number;
  trend: number;
};

export function summarizeSubjects(exams: ExamResult[]): SubjectSummaryRow[] {
  const names = collectSubjectNames(exams);
  const sorted = sortExamsByDateDesc(exams);
  return names.map((name) => {
    const nets: number[] = [];
    let totalWrong = 0;
    for (const exam of sorted) {
      const sub = (exam.subjects || []).find((s) => normalizeSubjectLabel(s.name) === name);
      if (!sub) continue;
      nets.push(sub.net);
      totalWrong += sub.wrong;
    }
    const avgNet = nets.length ? Math.round((nets.reduce((a, b) => a + b, 0) / nets.length) * 100) / 100 : 0;
    const lastNet = nets[0] ?? 0;
    const bestNet = nets.length ? Math.max(...nets) : 0;
    const trend = nets.length >= 2 ? Math.round((nets[0] - nets[1]) * 100) / 100 : 0;
    return { name, examCount: nets.length, avgNet, lastNet, bestNet, totalWrong, trend };
  });
}

export type HataKarnesiRow = {
  subject: string;
  wrong: number;
  blank: number;
  correct: number;
  net: number;
  topics: ExamTopicResult[];
};

/** Yanlış odaklı özet — hata karnesi görünümü */
export function buildHataKarnesi(exam: ExamResult): HataKarnesiRow[] {
  return (exam.subjects || [])
    .map((s) => ({
      subject: s.name,
      wrong: s.wrong,
      blank: s.blank,
      correct: s.correct,
      net: s.net,
      topics: (s.topics || []).filter((t) => t.wrong > 0 || t.blank > 0)
    }))
    .sort((a, b) => b.wrong - a.wrong || b.blank - a.blank);
}

export type KarneRow = ExamSubjectResult & { successRate: number };

export function buildKarneTable(exam: ExamResult): KarneRow[] {
  return (exam.subjects || []).map((s) => {
    const total = s.correct + s.wrong + s.blank;
    const successRate = total > 0 ? Math.round((s.correct / total) * 100) : 0;
    return { ...s, successRate };
  });
}

export type ExamMatrixRow = {
  examId: string;
  examDate: string;
  examLabel: string;
  totalNet: number;
  cells: Record<string, { net: number; wrong: number } | null>;
};

export function buildExamSubjectMatrix(exams: ExamResult[]): { subjects: string[]; rows: ExamMatrixRow[] } {
  const subjects = collectSubjectNames(exams);
  const rows = sortExamsByDateDesc(exams).map((exam) => {
    const cells: Record<string, { net: number; wrong: number } | null> = {};
    for (const subName of subjects) {
      const sub = (exam.subjects || []).find((s) => normalizeSubjectLabel(s.name) === subName);
      cells[subName] = sub ? { net: sub.net, wrong: sub.wrong } : null;
    }
    return {
      examId: exam.id,
      examDate: exam.examDate,
      examLabel: exam.examTitle || `${exam.examType} · ${exam.examDate}`,
      totalNet: exam.totalNet,
      cells
    };
  });
  return { subjects, rows };
}

export function countExamsWithTopicBreakdown(exams: ExamResult[]): number {
  return exams.filter((e) => (e.subjects || []).some((s) => (s.topics?.length ?? 0) > 0)).length;
}

export function hasMultiSubjectData(exams: ExamResult[]): boolean {
  return exams.some((e) => (e.subjects?.length ?? 0) > 1);
}
