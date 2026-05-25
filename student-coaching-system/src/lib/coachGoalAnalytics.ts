import { addDays, eachDayOfInterval, eachWeekOfInterval, endOfWeek, format, max as dfMax, min as dfMin, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';
import type { CoachWeeklyGoalRow, WeeklyPlannerEntryRow } from './weeklyPlannerApi';
import type { WeeklyEntry } from '../types';
import { effectivePagesRead, effectiveScreenMinutes } from './studyInsightMetrics';

function clipYmd(s: string): string {
  return String(s || '').trim().slice(0, 10);
}

export type CoachGoalUnitKind = 'soru' | 'paragraf' | 'problem' | 'sayfa' | 'dakika' | 'tekrar' | 'other';

const KIND_LABELS: Record<CoachGoalUnitKind, string> = {
  soru: 'Soru',
  paragraf: 'Paragraf',
  problem: 'Problem',
  sayfa: 'Kitap / sayfa',
  dakika: 'Süre (dk)',
  tekrar: 'Tekrar',
  other: 'Diğer'
};

/** Koç hedef birimi + ders adına göre analiz kategorisi */
export function coachGoalUnitKind(g: CoachWeeklyGoalRow): CoachGoalUnitKind {
  const u = String(g.quantity_unit || '')
    .trim()
    .toLowerCase();
  const sub = String(g.subject || '').trim();
  if (u === 'paragraf' || u === 'paragraflar' || sub === 'Paragraf Çözme') return 'paragraf';
  if (u === 'problem' || u === 'problemler' || sub === 'Problem Çözme') return 'problem';
  if (u === 'sayfa' || u === 'kitap' || sub === 'Kitap Okuma') return 'sayfa';
  if (u === 'dakika' || u === 'dk' || u === 'dak') return 'dakika';
  if (u === 'tekrar') return 'tekrar';
  if (u === 'soru' || u === 'sorular' || u === 'adet' || u === '') return 'soru';
  return 'other';
}

export function isQuestionCoachGoal(g: CoachWeeklyGoalRow): boolean {
  const k = coachGoalUnitKind(g);
  return k === 'soru' || k === 'tekrar';
}

export function goalCalendarSpanYmd(g: CoachWeeklyGoalRow): { gs: string; ge: string } | null {
  const gs = clipYmd(g.goal_start_date || '');
  const ge = clipYmd(g.goal_end_date || '');
  if (gs && ge) {
    return gs <= ge ? { gs, ge } : { gs: ge, ge: gs };
  }
  const ws = clipYmd(g.week_start_date || '');
  if (!ws) return null;
  const end = addDays(parseISO(`${ws}T12:00:00`), 6);
  return { gs: ws, ge: format(end, 'yyyy-MM-dd') };
}

export function overlapInclusiveDayCount(a0: string, a1: string, b0: string, b1: string): number {
  const x0 = clipYmd(a0);
  const x1 = clipYmd(a1);
  const y0 = clipYmd(b0);
  const y1 = clipYmd(b1);
  if (!x0 || !x1 || !y0 || !y1) return 0;
  const s = x0 >= y0 ? x0 : y0;
  const e = x1 <= y1 ? x1 : y1;
  if (s > e) return 0;
  const start = parseISO(`${s}T12:00:00`);
  const end = parseISO(`${e}T12:00:00`);
  return eachDayOfInterval({ start, end }).length;
}

function spanInclusiveDayCount(gs: string, ge: string): number {
  return Math.max(1, overlapInclusiveDayCount(gs, ge, gs, ge));
}

/** Hedefin analiz aralığıyla kesişen gün sayısı > 0 */
export function goalOverlapsRange(g: CoachWeeklyGoalRow, rangeFrom: string, rangeTo: string): boolean {
  const span = goalCalendarSpanYmd(g);
  if (!span) return false;
  const rf = clipYmd(rangeFrom);
  const rt = clipYmd(rangeTo);
  if (!rf || !rt || rf > rt) return false;
  return overlapInclusiveDayCount(span.gs, span.ge, rf, rt) > 0;
}

/**
 * Koç hedefi: hedef gün sayısına yayılıp analiz aralığındaki günlerle oransal kota.
 * Örn. 100 soru / 7 gün hedef, analiz 3 gün → ~43 soru hedefi.
 */
export function proratedTargetInRange(g: CoachWeeklyGoalRow, rangeFrom: string, rangeTo: string): number {
  const T = Number(g.target_quantity);
  if (!Number.isFinite(T) || T <= 0) return 0;
  const span = goalCalendarSpanYmd(g);
  if (!span) return 0;
  const rf = clipYmd(rangeFrom);
  const rt = clipYmd(rangeTo);
  if (!rf || !rt || rf > rt) return 0;
  const spanDays = spanInclusiveDayCount(span.gs, span.ge);
  const inRange = overlapInclusiveDayCount(span.gs, span.ge, rf, rt);
  if (inRange <= 0) return 0;
  return (T * inRange) / spanDays;
}

export function proratedQuestionTargetInRange(g: CoachWeeklyGoalRow, rangeFrom: string, rangeTo: string): number {
  if (!isQuestionCoachGoal(g)) return 0;
  return proratedTargetInRange(g, rangeFrom, rangeTo);
}

/** Aynı ders+birim için çakışan eski haftalık hedefleri tek kayda indirger (analiz çift sayımını önler). */
export function dedupeCoachGoalsForAnalytics(
  goals: CoachWeeklyGoalRow[],
  rangeFrom: string,
  rangeTo: string
): CoachWeeklyGoalRow[] {
  const rf = clipYmd(rangeFrom);
  const rt = clipYmd(rangeTo);
  const byKey = new Map<string, CoachWeeklyGoalRow>();
  for (const g of goals) {
    if (!goalOverlapsRange(g, rf, rt)) continue;
    const key = `${normSubjectKey(g.subject)}::${coachGoalUnitKind(g)}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, g);
      continue;
    }
    const prevStart = goalCalendarSpanYmd(prev)?.gs ?? '';
    const nextStart = goalCalendarSpanYmd(g)?.gs ?? '';
    const prevT = Number(prev.target_quantity) || 0;
    const nextT = Number(g.target_quantity) || 0;
    const pick =
      nextStart > prevStart ||
      (nextStart === prevStart && nextT > prevT) ||
      (nextStart === prevStart && nextT === prevT && String(g.created_at) > String(prev.created_at))
        ? g
        : prev;
    byKey.set(key, pick);
  }
  return [...byKey.values()];
}

/**
 * Koç kotası: haftalık plandaki target_quantity (305 gibi).
 * Planlanan/yapılan ayrıca seçili tarih aralığına kırpılır.
 */
export function coachTargetInAnalysisRange(g: CoachWeeklyGoalRow, rangeFrom: string, rangeTo: string): number {
  if (!goalOverlapsRange(g, rangeFrom, rangeTo)) return 0;
  const t = Number(g.target_quantity);
  return Number.isFinite(t) && t > 0 ? t : 0;
}

export function totalCoachQuestionTargetsInRange(
  goals: CoachWeeklyGoalRow[],
  rangeFrom: string,
  rangeTo: string
): number {
  const deduped = dedupeCoachGoalsForAnalytics(goals, rangeFrom, rangeTo);
  let sum = 0;
  for (const g of deduped) {
    if (!isQuestionCoachGoal(g)) continue;
    sum += coachTargetInAnalysisRange(g, rangeFrom, rangeTo);
  }
  return Math.round(sum);
}

/** Seçili aralıkta tamamlanan soru (planlayıcı + günlük kayıt) */
export function totalCoachQuestionCompletedInRange(
  goals: CoachWeeklyGoalRow[],
  entries: WeeklyEntry[],
  rangeFrom: string,
  rangeTo: string,
  plannerEntries: WeeklyPlannerEntryRow[] = []
): number {
  let sum = 0;
  for (const g of dedupeCoachGoalsForAnalytics(goals, rangeFrom, rangeTo)) {
    if (!isQuestionCoachGoal(g)) continue;
    sum += completedForCoachGoal(g, entries, rangeFrom, rangeTo, plannerEntries);
  }
  return Math.round(sum);
}

/** Haftalık grafik: koç hedefi dersinde, gün dilimindeki çözülen (takvim şart değil) */
export function coachQuestionCompletedInYmdRange(
  goals: CoachWeeklyGoalRow[],
  _plannerEntries: WeeklyPlannerEntryRow[],
  weeklyEntries: WeeklyEntry[],
  ymdFrom: string,
  ymdTo: string,
  analysisRangeFrom: string,
  analysisRangeTo: string
): number {
  let sum = 0;
  for (const g of dedupeCoachGoalsForAnalytics(goals, analysisRangeFrom, analysisRangeTo)) {
    if (!isQuestionCoachGoal(g)) continue;
    sum += completedForCoachGoal(g, weeklyEntries, ymdFrom, ymdTo);
  }
  return Math.round(sum);
}

/** Hedef takvimi ∩ analiz aralığı (YYYY-MM-DD) */
export function goalClipRangeYmd(
  g: CoachWeeklyGoalRow,
  rangeFrom: string,
  rangeTo: string
): { clipFrom: string; clipTo: string } | null {
  const span = goalCalendarSpanYmd(g);
  if (!span) return null;
  const rf = clipYmd(rangeFrom);
  const rt = clipYmd(rangeTo);
  const clipFrom = span.gs >= rf ? span.gs : rf;
  const clipTo = span.ge <= rt ? span.ge : rt;
  if (clipFrom > clipTo) return null;
  return { clipFrom, clipTo };
}

function entriesForSubjectInRange(
  entries: WeeklyEntry[],
  subject: string,
  rangeFrom: string,
  rangeTo: string
): WeeklyEntry[] {
  const sub = normSubjectKey(subject);
  const rf = clipYmd(rangeFrom);
  const rt = clipYmd(rangeTo);
  return entries.filter((e) => {
    const d = clipYmd(e.date);
    if (!d || d < rf || d > rt) return false;
    return normSubjectKey(e.subject) === sub;
  });
}

function normSubjectKey(s: string | null | undefined): string {
  return String(s ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR');
}

/** Analiz için planlayıcı API: koç hedef süreleri ∪ seçili tarih aralığı */
export function plannerFetchRangeForCoachGoals(
  goals: CoachWeeklyGoalRow[],
  analysisFrom: string,
  analysisTo: string
): { from: string; to: string } {
  let from = clipYmd(analysisFrom);
  let to = clipYmd(analysisTo);
  for (const g of goals) {
    if (!goalOverlapsRange(g, from, to)) continue;
    const span = goalCalendarSpanYmd(g);
    if (!span) continue;
    if (span.gs < from) from = span.gs;
    if (span.ge > to) to = span.ge;
  }
  return { from, to };
}

/**
 * Tek plan bloğu gerçekleşen — haftalık plan ile aynı:
 * Yalnızca öğrencinin kaydettiği günlük çalışma (weekly_entry); eski completed_quantity sayılmaz.
 */
export function effectivePlannerEntryDone(
  g: CoachWeeklyGoalRow,
  row: WeeklyPlannerEntryRow,
  weeklyEntries: WeeklyEntry[]
): number {
  const wid = row.weekly_entry_id;
  if (!wid) return 0;

  const linked = weeklyEntries.find((w) => w.id === wid);
  if (!linked) return 0;

  const planned = Math.max(0, Number(row.planned_quantity || 0));
  const kind = coachGoalUnitKind(g);
  let done = 0;
  if (kind === 'sayfa') done = effectivePagesRead(linked);
  else if (kind === 'dakika') done = effectiveScreenMinutes(linked);
  else done = Math.max(0, Number(linked.solvedQuestions || 0));

  if (planned > 0) return Math.min(done, planned);
  return done;
}

/** Yalnızca seçili analiz aralığı ∩ hedef takvimi içindeki plan blokları */
function plannerRowsForGoalInAnalysisClip(
  g: CoachWeeklyGoalRow,
  plannerEntries: WeeklyPlannerEntryRow[],
  analysisRangeFrom: string,
  analysisRangeTo: string
): WeeklyPlannerEntryRow[] {
  const clip = goalClipRangeYmd(g, analysisRangeFrom, analysisRangeTo);
  if (!clip) return [];
  return plannerEntries.filter((e) => {
    if (e.coach_goal_id !== g.id) return false;
    const d = clipYmd(e.planner_date);
    return d >= clip.clipFrom && d <= clip.clipTo;
  });
}

function completedFromPlannerForGoal(
  g: CoachWeeklyGoalRow,
  plannerEntries: WeeklyPlannerEntryRow[],
  weeklyEntries: WeeklyEntry[],
  analysisRangeFrom: string,
  analysisRangeTo: string
): number {
  return plannerRowsForGoalInAnalysisClip(g, plannerEntries, analysisRangeFrom, analysisRangeTo).reduce(
    (s, e) => s + effectivePlannerEntryDone(g, e, weeklyEntries),
    0
  );
}

/** Koç hedefinin dersi + tarih aralığındaki günlük kayıt (takvim şart değil) */
function completedFromEntriesForGoal(
  g: CoachWeeklyGoalRow,
  entries: WeeklyEntry[],
  rangeFrom: string,
  rangeTo: string
): number {
  const clip = goalClipRangeYmd(g, rangeFrom, rangeTo);
  if (!clip) return 0;
  const { clipFrom, clipTo } = clip;
  const rel = entriesForSubjectInRange(entries, g.subject, clipFrom, clipTo);
  const kind = coachGoalUnitKind(g);
  if (kind === 'sayfa') return rel.reduce((s, e) => s + effectivePagesRead(e), 0);
  if (kind === 'dakika') return rel.reduce((s, e) => s + effectiveScreenMinutes(e), 0);
  return rel.reduce((s, e) => s + (e.solvedQuestions || 0), 0);
}

function plannedFromPlannerForGoal(
  g: CoachWeeklyGoalRow,
  plannerEntries: WeeklyPlannerEntryRow[],
  analysisRangeFrom: string,
  analysisRangeTo: string
): number {
  return plannerRowsForGoalInAnalysisClip(g, plannerEntries, analysisRangeFrom, analysisRangeTo).reduce(
    (s, e) => s + Math.max(0, Number(e.planned_quantity || 0)),
    0
  );
}

/**
 * Koç hedefi gerçekleşen — koçun verdiği ders + hedef tarihleri içindeki günlük kayıt.
 * Öğrenci takvime blok koymuş olmasa da sayılır.
 */
export function completedForCoachGoal(
  g: CoachWeeklyGoalRow,
  entries: WeeklyEntry[],
  rangeFrom: string,
  rangeTo: string,
  _plannerEntries: WeeklyPlannerEntryRow[] = []
): number {
  if (!goalOverlapsRange(g, rangeFrom, rangeTo)) return 0;
  return completedFromEntriesForGoal(g, entries, rangeFrom, rangeTo);
}

/** Seçili aralıkta öğrencinin planladığı miktar (planlanan toplam) */
export function plannedForCoachGoal(
  g: CoachWeeklyGoalRow,
  plannerEntries: WeeklyPlannerEntryRow[],
  rangeFrom: string,
  rangeTo: string
): number {
  return plannedFromPlannerForGoal(g, plannerEntries, rangeFrom, rangeTo);
}

/** Koçun verdiği toplam hedef (haftalık plandaki target_quantity ile aynı) */
export function fullCoachGoalTarget(g: CoachWeeklyGoalRow): number {
  const t = Number(g.target_quantity);
  return Number.isFinite(t) && t > 0 ? t : 0;
}

export type CoachGoalProgressBucket = {
  kind: CoachGoalUnitKind;
  label: string;
  /** Koçun verdiği kota (target_quantity) */
  target: number;
  /** Takvime planlanan (analizde kullanılmıyor; uyumluluk) */
  planned: number;
  /** Koç hedefi dersinde, aralıktaki günlük kayıt */
  completed: number;
  realizationPct: number;
  goalCount: number;
};

export type CoachGoalRangeAnalytics = {
  buckets: CoachGoalProgressBucket[];
  soru: CoachGoalProgressBucket;
  paragraf: CoachGoalProgressBucket;
  problem: CoachGoalProgressBucket;
  sayfa: CoachGoalProgressBucket;
  questionRealizationPct: number;
  questionTarget: number;
  questionPlanned: number;
  questionCompleted: number;
};

function emptyBucket(kind: CoachGoalUnitKind): CoachGoalProgressBucket {
  return {
    kind,
    label: KIND_LABELS[kind],
    target: 0,
    planned: 0,
    completed: 0,
    realizationPct: 0,
    goalCount: 0,
  };
}

function pct(completed: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(999, Math.round((completed / target) * 100));
}

export function computeCoachGoalRangeAnalytics(
  goals: CoachWeeklyGoalRow[],
  entries: WeeklyEntry[],
  rangeFrom: string,
  rangeTo: string,
  plannerEntries: WeeklyPlannerEntryRow[] = []
): CoachGoalRangeAnalytics {
  const rf = clipYmd(rangeFrom);
  const rt = clipYmd(rangeTo);
  const activeGoals = dedupeCoachGoalsForAnalytics(goals, rf, rt);
  const acc: Record<
    CoachGoalUnitKind,
    { target: number; planned: number; completed: number; goalCount: number }
  > = {
    soru: { target: 0, planned: 0, completed: 0, goalCount: 0 },
    paragraf: { target: 0, planned: 0, completed: 0, goalCount: 0 },
    problem: { target: 0, planned: 0, completed: 0, goalCount: 0 },
    sayfa: { target: 0, planned: 0, completed: 0, goalCount: 0 },
    dakika: { target: 0, planned: 0, completed: 0, goalCount: 0 },
    tekrar: { target: 0, planned: 0, completed: 0, goalCount: 0 },
    other: { target: 0, planned: 0, completed: 0, goalCount: 0 },
  };

  for (const g of activeGoals) {
    const kind = coachGoalUnitKind(g);
    const t = coachTargetInAnalysisRange(g, rf, rt);
    const p = plannedForCoachGoal(g, plannerEntries, rf, rt);
    const c = completedForCoachGoal(g, entries, rf, rt, plannerEntries);
    acc[kind].target += t;
    acc[kind].planned += p;
    acc[kind].completed += c;
    acc[kind].goalCount += 1;
  }

  const finalize = (kind: CoachGoalUnitKind): CoachGoalProgressBucket => ({
    kind,
    label: KIND_LABELS[kind],
    target: Math.round(acc[kind].target),
    planned: Math.round(acc[kind].planned),
    completed: Math.round(acc[kind].completed),
    realizationPct: pct(acc[kind].completed, acc[kind].target),
    goalCount: acc[kind].goalCount,
  });

  const soruB = finalize('soru');
  const tekrarB = finalize('tekrar');
  let questionTarget = soruB.target + tekrarB.target;
  const questionPlanned = soruB.planned + tekrarB.planned;
  const questionCompleted = soruB.completed + tekrarB.completed;
  const quotaTarget = totalCoachQuestionTargetsInRange(activeGoals, rf, rt);
  if (quotaTarget > 0) questionTarget = quotaTarget;

  const buckets: CoachGoalProgressBucket[] = (
    ['soru', 'paragraf', 'problem', 'sayfa', 'tekrar', 'dakika', 'other'] as CoachGoalUnitKind[]
  )
    .map(finalize)
    .filter((b) => b.target > 0 || b.planned > 0 || b.completed > 0 || b.goalCount > 0);

  return {
    buckets,
    soru: soruB,
    paragraf: finalize('paragraf'),
    problem: finalize('problem'),
    sayfa: finalize('sayfa'),
    questionTarget,
    questionPlanned,
    questionCompleted,
    questionRealizationPct: pct(questionCompleted, questionTarget),
  };
}

/** Ders bazlı: koç kotası (soru birimi, çift sayım yok) */
export function coachSubjectProratedTargetsInRange(
  goals: CoachWeeklyGoalRow[],
  rangeFrom: string,
  rangeTo: string
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of dedupeCoachGoalsForAnalytics(goals, rangeFrom, rangeTo)) {
    const sub = String(g.subject || '').trim() || 'Diğer';
    const v = isQuestionCoachGoal(g) ? coachTargetInAnalysisRange(g, rangeFrom, rangeTo) : 0;
    if (v <= 0) continue;
    out[sub] = (out[sub] || 0) + v;
  }
  for (const k of Object.keys(out)) {
    out[k] = Math.round(out[k]);
  }
  return out;
}

export type SubjectCoachProgressRow = {
  subject: string;
  kind: CoachGoalUnitKind;
  unitLabel: string;
  target: number;
  completed: number;
  realizationPct: number;
  correct: number;
  wrong: number;
  blank: number;
  successPct: number;
};

/** Ders bazlı hedef / gerçekleşme (koç kotası + birime göre tamamlanan) */
export function coachSubjectProgressInRange(
  goals: CoachWeeklyGoalRow[],
  entries: WeeklyEntry[],
  rangeFrom: string,
  rangeTo: string,
  plannerEntries: WeeklyPlannerEntryRow[] = []
): SubjectCoachProgressRow[] {
  const rf = clipYmd(rangeFrom);
  const rt = clipYmd(rangeTo);
  const activeGoals = dedupeCoachGoalsForAnalytics(goals, rf, rt);
  const bySubject = new Map<
    string,
    { kind: CoachGoalUnitKind; target: number; completed: number }
  >();

  for (const g of activeGoals) {
    const sub = String(g.subject || '').trim() || 'Diğer';
    const kind = coachGoalUnitKind(g);
    const prev = bySubject.get(sub) || { kind, target: 0, completed: 0 };
    prev.target += coachTargetInAnalysisRange(g, rf, rt);
    prev.completed += completedForCoachGoal(g, entries, rf, rt, plannerEntries);
    bySubject.set(sub, prev);
  }

  const entryStats: Record<string, { correct: number; wrong: number; blank: number; solved: number }> =
    {};
  for (const g of activeGoals) {
    const clip = goalClipRangeYmd(g, rf, rt);
    if (!clip) continue;
    const sub = String(g.subject || '').trim() || 'Diğer';
    for (const e of entries) {
      const d = clipYmd(e.date);
      if (d < clip.clipFrom || d > clip.clipTo) continue;
      if (normSubjectKey(e.subject) !== normSubjectKey(g.subject)) continue;
      if (!entryStats[sub]) entryStats[sub] = { correct: 0, wrong: 0, blank: 0, solved: 0 };
      entryStats[sub].correct += e.correctAnswers || 0;
      entryStats[sub].wrong += e.wrongAnswers || 0;
      entryStats[sub].blank += e.blankAnswers || 0;
      entryStats[sub].solved += e.solvedQuestions || 0;
    }
  }

  return [...bySubject.entries()]
    .map(([subject, row]) => {
      const st = entryStats[subject] || { correct: 0, wrong: 0, blank: 0, solved: 0 };
      const target = Math.round(row.target);
      const completed = Math.round(row.completed);
      return {
        subject,
        kind: row.kind,
        unitLabel: KIND_LABELS[row.kind],
        target,
        completed,
        realizationPct: pct(completed, target),
        correct: st.correct,
        wrong: st.wrong,
        blank: st.blank,
        successPct: st.solved > 0 ? Math.round((st.correct / st.solved) * 100) : 0
      };
    })
    .sort((a, b) => b.completed - a.completed);
}

export type WeekBucket = { weekStart: string; weekEnd: string; label: string };

export function eachCalendarWeekInRange(rangeFrom: string, rangeTo: string): WeekBucket[] {
  const rf = clipYmd(rangeFrom);
  const rt = clipYmd(rangeTo);
  if (!rf || !rt || rf > rt) return [];
  const rangeStart = parseISO(`${rf}T12:00:00`);
  const rangeEnd = parseISO(`${rt}T12:00:00`);
  const weekStarts = eachWeekOfInterval({ start: rangeStart, end: rangeEnd }, { weekStartsOn: 1 });
  const buckets: WeekBucket[] = [];
  for (const ws of weekStarts) {
    const weDate = endOfWeek(ws, { weekStartsOn: 1 });
    const wStart = format(dfMax([ws, rangeStart]), 'yyyy-MM-dd');
    const wEnd = format(dfMin([weDate, rangeEnd]), 'yyyy-MM-dd');
    if (wStart > wEnd) continue;
    const label = `${format(parseISO(`${wStart}T12:00:00`), 'd MMM', { locale: tr })} – ${format(parseISO(`${wEnd}T12:00:00`), 'd MMM', { locale: tr })}`;
    buckets.push({ weekStart: wStart, weekEnd: wEnd, label });
  }
  return buckets;
}

/** Bir hafta diliminde (analiz aralığına kırpılmış) koç soru hedefi toplamı */
export function weekCoachQuestionTarget(
  goals: CoachWeeklyGoalRow[],
  weekStart: string,
  weekEnd: string,
  analysisRangeFrom: string,
  analysisRangeTo: string
): number {
  const rf = clipYmd(analysisRangeFrom);
  const rt = clipYmd(analysisRangeTo);
  const ws = clipYmd(weekStart);
  const we = clipYmd(weekEnd);
  const clipS = ws >= rf ? ws : rf;
  const clipE = we <= rt ? we : rt;
  if (clipS > clipE) return 0;
  let sum = 0;
  for (const g of goals) {
    sum += proratedQuestionTargetInRange(g, clipS, clipE);
  }
  return Math.round(sum);
}

/** Haftalık paragraf / problem / sayfa hedefi (oransal) */
export function weekCoachTargetByKind(
  goals: CoachWeeklyGoalRow[],
  kind: CoachGoalUnitKind,
  weekStart: string,
  weekEnd: string,
  analysisRangeFrom: string,
  analysisRangeTo: string
): number {
  const rf = clipYmd(analysisRangeFrom);
  const rt = clipYmd(analysisRangeTo);
  const ws = clipYmd(weekStart);
  const we = clipYmd(weekEnd);
  const clipS = ws >= rf ? ws : rf;
  const clipE = we <= rt ? we : rt;
  if (clipS > clipE) return 0;
  let sum = 0;
  for (const g of goals) {
    if (coachGoalUnitKind(g) !== kind) continue;
    sum += proratedTargetInRange(g, clipS, clipE);
  }
  return Math.round(sum);
}

export function entriesSolvedInYmdRange(entries: WeeklyEntry[], ymdFrom: string, ymdTo: string): number {
  const a = clipYmd(ymdFrom);
  const b = clipYmd(ymdTo);
  return entries.reduce((s, e) => {
    const d = clipYmd(e.date);
    if (d >= a && d <= b) return s + (e.solvedQuestions || 0);
    return s;
  }, 0);
}

export function entriesPagesInYmdRange(entries: WeeklyEntry[], ymdFrom: string, ymdTo: string): number {
  const a = clipYmd(ymdFrom);
  const b = clipYmd(ymdTo);
  return entries.reduce((s, e) => {
    const d = clipYmd(e.date);
    if (d >= a && d <= b) return s + effectivePagesRead(e);
    return s;
  }, 0);
}
