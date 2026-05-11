import type { WeeklyEntry } from '../types';

/** Okunan sayfa: önce pages_read (UI), yoksa legacy reading_minutes */
export function effectivePagesRead(e: WeeklyEntry): number {
  const p = (e as WeeklyEntry & { pagesRead?: number }).pagesRead;
  if (p != null && p >= 0) return p;
  return e.readingMinutes ?? 0;
}

export function effectiveScreenMinutes(e: WeeklyEntry): number {
  const m = (e as WeeklyEntry & { screenTimeMinutes?: number }).screenTimeMinutes;
  return m != null && m >= 0 ? m : 0;
}

export function filterEntriesSince(entries: WeeklyEntry[], days: number): WeeklyEntry[] {
  if (days <= 0) return entries;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days - 1));
  cutoff.setHours(0, 0, 0, 0);
  return entries.filter((e) => {
    const t = new Date(e.date).getTime();
    return !Number.isNaN(t) && t >= cutoff.getTime();
  });
}

export type SubjectInsightRow = {
  subject: string;
  solved: number;
  target: number;
  correct: number;
  wrong: number;
  blank: number;
  successRate: number;
  realizationRate: number;
};

export type StudyInsightSummary = {
  totalTarget: number;
  totalSolved: number;
  totalCorrect: number;
  totalWrong: number;
  totalBlank: number;
  realizationRate: number;
  successRate: number;
  totalScreenMinutes: number;
  totalPagesRead: number;
  activeDays: number;
  subjectRows: SubjectInsightRow[];
};

export function computeStudyInsightSummary(entries: WeeklyEntry[]): StudyInsightSummary {
  const totalTarget = entries.reduce((s, e) => s + e.targetQuestions, 0);
  const totalSolved = entries.reduce((s, e) => s + e.solvedQuestions, 0);
  const totalCorrect = entries.reduce((s, e) => s + e.correctAnswers, 0);
  const totalWrong = entries.reduce((s, e) => s + e.wrongAnswers, 0);
  const totalBlank = entries.reduce((s, e) => s + e.blankAnswers, 0);
  const realizationRate = totalTarget > 0 ? Math.round((totalSolved / totalTarget) * 100) : 0;
  const successRate = totalSolved > 0 ? Math.round((totalCorrect / totalSolved) * 100) : 0;

  const totalScreenMinutes = entries.reduce((s, e) => s + effectiveScreenMinutes(e), 0);
  const totalPagesRead = entries.reduce((s, e) => s + effectivePagesRead(e), 0);
  const activeDays = new Set(entries.map((e) => String(e.date).slice(0, 10))).size;

  const bySub: Record<string, SubjectInsightRow> = {};
  for (const e of entries) {
    const sub = e.subject?.trim() || 'Diğer';
    if (!bySub[sub]) {
      bySub[sub] = {
        subject: sub,
        solved: 0,
        target: 0,
        correct: 0,
        wrong: 0,
        blank: 0,
        successRate: 0,
        realizationRate: 0,
      };
    }
    bySub[sub].solved += e.solvedQuestions;
    bySub[sub].target += e.targetQuestions;
    bySub[sub].correct += e.correctAnswers;
    bySub[sub].wrong += e.wrongAnswers;
    bySub[sub].blank += e.blankAnswers;
  }
  const subjectRows = Object.values(bySub).map((row) => ({
    ...row,
    successRate: row.solved > 0 ? Math.round((row.correct / row.solved) * 100) : 0,
    realizationRate: row.target > 0 ? Math.round((row.solved / row.target) * 100) : 0,
  }));
  subjectRows.sort((a, b) => b.solved - a.solved);

  return {
    totalTarget,
    totalSolved,
    totalCorrect,
    totalWrong,
    totalBlank,
    realizationRate,
    successRate,
    totalScreenMinutes,
    totalPagesRead,
    activeDays,
    subjectRows,
  };
}

export function formatDurationFromMinutes(totalMin: number): string {
  if (totalMin <= 0) return '—';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m} dk`;
  return `${h} sa ${m} dk`;
}

/** Son `dayCount` gün için günlük çözülen soru (grafik) */
export function dailySolvedSeries(entries: WeeklyEntry[], dayCount: number) {
  const days: string[] = [];
  for (let i = dayCount - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days.map((date) => {
    const dayEntries = entries.filter((e) => String(e.date).slice(0, 10) === date);
    const solved = dayEntries.reduce((s, e) => s + e.solvedQuestions, 0);
    const screen = dayEntries.reduce((s, e) => s + effectiveScreenMinutes(e), 0);
    return {
      date,
      label: new Date(date + 'T12:00:00').toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' }),
      solved,
      screenMinutes: screen,
      active: dayEntries.length > 0,
    };
  });
}
