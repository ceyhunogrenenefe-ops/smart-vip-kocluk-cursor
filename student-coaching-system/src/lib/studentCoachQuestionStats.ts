import {
  computeCoachGoalRangeAnalytics,
  plannerFetchRangeForCoachGoals,
} from './coachGoalAnalytics';
import type { CoachWeeklyGoalRow, WeeklyPlannerEntryRow } from './weeklyPlannerApi';
import {
  fetchCoachWeeklyGoalsInRange,
  fetchWeeklyEntriesForStudentRange,
  fetchWeeklyPlannerEntries,
} from './weeklyPlannerApi';
import type { WeeklyEntry } from '../types';

export type StudentCoachQuestionStats = {
  coachTarget: number;
  solved: number;
  realizationPct: number;
  hasCoachGoals: boolean;
  rangeFrom: string;
  rangeTo: string;
};

export type StudentCoachAnalyticsBundle = {
  goals: CoachWeeklyGoalRow[];
  plannerEntries: WeeklyPlannerEntryRow[];
  weeklyEntries: WeeklyEntry[];
  stats: StudentCoachQuestionStats;
};

const cache = new Map<string, StudentCoachQuestionStats>();

function cacheKey(studentId: string, rangeFrom: string, rangeTo: string): string {
  return `${studentId}::${rangeFrom}::${rangeTo}`;
}

export function getCachedStudentCoachQuestionStats(
  studentId: string,
  rangeFrom?: string,
  rangeTo?: string
): StudentCoachQuestionStats | undefined {
  if (rangeFrom && rangeTo) return cache.get(cacheKey(studentId, rangeFrom, rangeTo));
  const prefix = `${studentId}::`;
  let latest: StudentCoachQuestionStats | undefined;
  for (const [k, v] of cache) {
    if (k.startsWith(prefix)) latest = v;
  }
  return latest;
}

export function setCachedStudentCoachQuestionStats(
  studentId: string,
  rangeFrom: string,
  rangeTo: string,
  stats: StudentCoachQuestionStats
): void {
  cache.set(cacheKey(studentId, rangeFrom, rangeTo), stats);
}

export function clearStudentCoachQuestionStatsCache(): void {
  cache.clear();
}

/** Pazartesi–Pazar (YYYY-MM-DD) */
export function currentWeekRangeYmd(): { from: string; to: string } {
  const now = new Date();
  const dow = now.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diff);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(mon), to: fmt(sun) };
}

function mergeGoals(list: CoachWeeklyGoalRow[]): CoachWeeklyGoalRow[] {
  const map = new Map<string, CoachWeeklyGoalRow>();
  for (const g of list) map.set(g.id, g);
  return [...map.values()];
}

/** Koçun verdiği hedefler (tarih aralığı; takvimden bağımsız) */
export async function loadCoachGoalsForStudentRange(
  studentId: string,
  rangeFrom: string,
  rangeTo: string
): Promise<CoachWeeklyGoalRow[]> {
  const rf = String(rangeFrom || '').slice(0, 10);
  const rt = String(rangeTo || '').slice(0, 10);
  if (!studentId || !rf || !rt || rf > rt) return [];

  let goals = await fetchCoachWeeklyGoalsInRange(studentId, rf, rt);
  const span = plannerFetchRangeForCoachGoals(goals, rf, rt);
  if (span.from < rf || span.to > rt) {
    const extra = await fetchCoachWeeklyGoalsInRange(studentId, span.from, span.to);
    goals = mergeGoals([...goals, ...extra]);
  }
  return goals;
}

/** Koç hedefi + günlük kayıt; oran takvime bağlı değil */
export async function loadStudentCoachAnalyticsBundle(
  studentId: string,
  rangeFrom: string,
  rangeTo: string
): Promise<StudentCoachAnalyticsBundle> {
  const rf = String(rangeFrom || '').slice(0, 10);
  const rt = String(rangeTo || '').slice(0, 10);
  const emptyStats: StudentCoachQuestionStats = {
    coachTarget: 0,
    solved: 0,
    realizationPct: 0,
    hasCoachGoals: false,
    rangeFrom: rf,
    rangeTo: rt,
  };

  if (!studentId || !rf || !rt || rf > rt) {
    return { goals: [], plannerEntries: [], weeklyEntries: [], stats: emptyStats };
  }

  const [goals, weekly, planner] = await Promise.all([
    loadCoachGoalsForStudentRange(studentId, rf, rt),
    fetchWeeklyEntriesForStudentRange(studentId, rf, rt),
    fetchWeeklyPlannerEntries(studentId, rf, rt),
  ]);

  const stats = computeStatsFromBundle(goals, weekly, [], rf, rt);
  setCachedStudentCoachQuestionStats(studentId, rf, rt, stats);

  return { goals, plannerEntries: planner, weeklyEntries: weekly, stats };
}

export function computeStatsFromBundle(
  goals: CoachWeeklyGoalRow[],
  weeklyEntries: WeeklyEntry[],
  plannerEntries: WeeklyPlannerEntryRow[],
  rangeFrom: string,
  rangeTo: string
): StudentCoachQuestionStats {
  const rf = rangeFrom.slice(0, 10);
  const rt = rangeTo.slice(0, 10);

  if (!goals.length) {
    return {
      coachTarget: 0,
      solved: 0,
      realizationPct: 0,
      hasCoachGoals: false,
      rangeFrom: rf,
      rangeTo: rt,
    };
  }

  const agg = computeCoachGoalRangeAnalytics(goals, weeklyEntries, rf, rt, plannerEntries);
  const stats: StudentCoachQuestionStats = {
    coachTarget: agg.questionTarget,
    solved: agg.questionCompleted,
    realizationPct: agg.questionRealizationPct,
    hasCoachGoals: agg.questionTarget > 0,
    rangeFrom: rf,
    rangeTo: rt,
  };
  return stats;
}

export async function loadStudentCoachQuestionStats(
  studentId: string,
  rangeFrom: string,
  rangeTo: string
): Promise<StudentCoachQuestionStats> {
  const rf = String(rangeFrom || '').slice(0, 10);
  const rt = String(rangeTo || '').slice(0, 10);
  const cached = getCachedStudentCoachQuestionStats(studentId, rf, rt);
  if (cached) return cached;

  const goals = await loadCoachGoalsForStudentRange(studentId, rf, rt);
  const weekly = await fetchWeeklyEntriesForStudentRange(studentId, rf, rt);
  const stats = computeStatsFromBundle(goals, weekly, [], rf, rt);
  setCachedStudentCoachQuestionStats(studentId, rf, rt, stats);
  return stats;
}

/** Koç paneli: tüm öğrenciler için koç kotası / çözülen (planlanan değil) */
export async function loadCoachQuestionStatsBatch(
  studentIds: string[],
  rangeFrom: string,
  rangeTo: string
): Promise<Record<string, StudentCoachQuestionStats>> {
  const out: Record<string, StudentCoachQuestionStats> = {};
  const ids = [...new Set(studentIds.map((id) => id.trim()).filter(Boolean))];
  await Promise.all(
    ids.map(async (sid) => {
      try {
        out[sid] = await loadStudentCoachQuestionStats(sid, rangeFrom, rangeTo);
      } catch {
        out[sid] = {
          coachTarget: 0,
          solved: 0,
          realizationPct: 0,
          hasCoachGoals: false,
          rangeFrom: rangeFrom.slice(0, 10),
          rangeTo: rangeTo.slice(0, 10),
        };
      }
    })
  );
  return out;
}
