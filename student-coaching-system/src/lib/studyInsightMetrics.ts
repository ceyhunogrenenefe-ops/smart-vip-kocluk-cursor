import type { WeeklyEntry } from '../types';
import type { CoachWeeklyGoalRow, WeeklyPlannerEntryRow } from './weeklyPlannerApi';
import {
  coachSubjectProgressInRange,
  computeCoachGoalRangeAnalytics,
  totalCoachQuestionTargetsInRange,
} from './coachGoalAnalytics';

/** Analiz aralığında koç hedefleri + haftalık plan kayıtları */
export type CoachInsightRange = {
  rangeFrom: string;
  rangeTo: string;
  goals: CoachWeeklyGoalRow[];
  plannerEntries?: WeeklyPlannerEntryRow[];
  /** Analiz için taze günlük kayıtlar (yapılan = solved) */
  weeklyEntries?: WeeklyEntry[];
};

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

/** Öğrencinin girdiği çalışma süresi (dk) — ekran süresinden ayrı */
export function effectiveStudyMinutes(e: WeeklyEntry): number {
  const m = e.studyMinutes;
  return m != null && m >= 0 ? m : 0;
}

/**
 * Süre hedefi ilerlemesi: çalışma süresi; alan hiç girilmemiş eski kayıtlarda
 * (çalışma süresi özelliği öncesi) ekran süresi — sunucudaki hesapla aynı.
 */
export function goalMinutesFromEntry(e: WeeklyEntry): number {
  if (e.studyMinutes != null && e.studyMinutes >= 0) return e.studyMinutes;
  return effectiveScreenMinutes(e);
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
  /** Bu derste girilen toplam çalışma süresi (dk) */
  studyMinutes: number;
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
  /** Öğrencinin girdiği toplam çalışma süresi (dk) */
  totalStudyMinutes: number;
  /** Çalışma süresi girilen gün sayısı */
  studyDays: number;
  totalPagesRead: number;
  activeDays: number;
  subjectRows: SubjectInsightRow[];
  /** Koç hedefi kırılımı (soru + paragraf + problem + sayfa) */
  coachGoalBreakdown?: ReturnType<typeof computeCoachGoalRangeAnalytics>;
};

export function computeStudyInsightSummary(
  entries: WeeklyEntry[],
  coachRange?: CoachInsightRange | null
): StudyInsightSummary {
  const entryTargetSum = entries.reduce((s, e) => s + e.targetQuestions, 0);
  const totalSolved = entries.reduce((s, e) => s + e.solvedQuestions, 0);
  const totalCorrect = entries.reduce((s, e) => s + e.correctAnswers, 0);
  const totalWrong = entries.reduce((s, e) => s + e.wrongAnswers, 0);
  const totalBlank = entries.reduce((s, e) => s + e.blankAnswers, 0);

  const coachEntries =
    coachRange?.weeklyEntries?.length ? coachRange.weeklyEntries : entries;

  let coachBreakdown: ReturnType<typeof computeCoachGoalRangeAnalytics> | undefined;
  if (coachRange?.goals?.length && coachRange.rangeFrom && coachRange.rangeTo) {
    coachBreakdown = computeCoachGoalRangeAnalytics(
      coachRange.goals,
      coachEntries,
      coachRange.rangeFrom,
      coachRange.rangeTo,
      coachRange.plannerEntries ?? []
    );
  }

  const coachQuota =
    coachRange?.goals?.length && coachRange.rangeFrom && coachRange.rangeTo
      ? totalCoachQuestionTargetsInRange(coachRange.goals, coachRange.rangeFrom, coachRange.rangeTo)
      : 0;

  const totalTarget = coachQuota > 0 ? coachQuota : entryTargetSum;
  const displaySolved =
    coachBreakdown && (coachQuota > 0 || coachBreakdown.questionCompleted > 0)
      ? coachBreakdown.questionCompleted
      : totalSolved;
  const realizationRate =
    totalTarget > 0 ? Math.min(999, Math.round((displaySolved / totalTarget) * 100)) : 0;
  const successRate = totalSolved > 0 ? Math.round((totalCorrect / totalSolved) * 100) : 0;

  const totalScreenMinutes = entries.reduce((s, e) => s + effectiveScreenMinutes(e), 0);
  const totalStudyMinutes = entries.reduce((s, e) => s + effectiveStudyMinutes(e), 0);
  const studyDays = new Set(
    entries.filter((e) => effectiveStudyMinutes(e) > 0).map((e) => String(e.date).slice(0, 10))
  ).size;
  const studyBySubject: Record<string, number> = {};
  for (const e of entries) {
    const m = effectiveStudyMinutes(e);
    if (m <= 0) continue;
    const sub = e.subject?.trim() || 'Diğer';
    studyBySubject[sub] = (studyBySubject[sub] || 0) + m;
  }
  const totalPagesRead = entries.reduce((s, e) => s + effectivePagesRead(e), 0);
  const activeDays = new Set(entries.map((e) => String(e.date).slice(0, 10))).size;

  let subjectRows: SubjectInsightRow[];
  if (coachBreakdown && coachRange) {
    subjectRows = coachSubjectProgressInRange(
      coachRange.goals,
      coachEntries,
      coachRange.rangeFrom,
      coachRange.rangeTo,
      coachRange.plannerEntries ?? []
    ).map((row) => ({
      subject: row.subject,
      solved: row.completed,
      target: row.target,
      correct: row.correct,
      wrong: row.wrong,
      blank: row.blank,
      successRate: row.successPct,
      realizationRate: row.realizationPct,
      studyMinutes: studyBySubject[row.subject] || 0,
    }));
  } else {
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
          studyMinutes: 0,
        };
      }
      bySub[sub].studyMinutes += effectiveStudyMinutes(e);
      bySub[sub].solved += e.solvedQuestions;
      bySub[sub].target += e.targetQuestions;
      bySub[sub].correct += e.correctAnswers;
      bySub[sub].wrong += e.wrongAnswers;
      bySub[sub].blank += e.blankAnswers;
    }
    subjectRows = Object.values(bySub).map((row) => ({
      ...row,
      successRate: row.solved > 0 ? Math.round((row.correct / row.solved) * 100) : 0,
      realizationRate: row.target > 0 ? Math.round((row.solved / row.target) * 100) : 0,
    }));
    subjectRows.sort((a, b) => b.solved - a.solved);
  }

  return {
    totalTarget,
    totalSolved: displaySolved,
    totalCorrect,
    totalWrong,
    totalBlank,
    realizationRate,
    successRate,
    totalScreenMinutes,
    totalStudyMinutes,
    studyDays,
    totalPagesRead,
    activeDays,
    subjectRows,
    coachGoalBreakdown: coachBreakdown,
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
    const study = dayEntries.reduce((s, e) => s + effectiveStudyMinutes(e), 0);
    return {
      date,
      label: new Date(date + 'T12:00:00').toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' }),
      solved,
      screenMinutes: screen,
      studyMinutes: study,
      active: dayEntries.length > 0,
    };
  });
}
