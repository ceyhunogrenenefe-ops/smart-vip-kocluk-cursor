import { addDays, eachDayOfInterval, eachWeekOfInterval, endOfWeek, format, max as dfMax, min as dfMin, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';
import type { CoachWeeklyGoalRow } from './weeklyPlannerApi';
import type { WeeklyEntry } from '../types';

function clipYmd(s: string): string {
  return String(s || '').trim().slice(0, 10);
}

export function isQuestionCoachGoal(g: CoachWeeklyGoalRow): boolean {
  const u = String(g.quantity_unit || 'soru').toLowerCase();
  return u === 'soru' || u === 'sorular' || u === '' || u === 'adet';
}

/** Koç hedefinin etkin [başlangıç, bitiş] günleri (YYYY-MM-DD, dahil) */
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

/** [a0,a1] ∩ [b0,b1] kesişimindeki tam gün sayısı (uçlar dahil) */
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

/**
 * Analiz aralığı [rangeFrom, rangeTo] içinde hedefe düşen soru kotası (tam hedef günleri üzerinden oransal).
 */
export function proratedQuestionTargetInRange(g: CoachWeeklyGoalRow, rangeFrom: string, rangeTo: string): number {
  if (!isQuestionCoachGoal(g)) return 0;
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

export function totalCoachQuestionTargetsInRange(
  goals: CoachWeeklyGoalRow[],
  rangeFrom: string,
  rangeTo: string
): number {
  let sum = 0;
  for (const g of goals) {
    sum += proratedQuestionTargetInRange(g, rangeFrom, rangeTo);
  }
  return Math.round(sum);
}

/** Ders bazlı: aynı aralıkta oransal koç hedefi (soru birimi) */
export function coachSubjectProratedTargetsInRange(
  goals: CoachWeeklyGoalRow[],
  rangeFrom: string,
  rangeTo: string
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of goals) {
    const sub = String(g.subject || '').trim() || 'Diğer';
    const v = proratedQuestionTargetInRange(g, rangeFrom, rangeTo);
    if (v <= 0) continue;
    out[sub] = (out[sub] || 0) + v;
  }
  for (const k of Object.keys(out)) {
    out[k] = Math.round(out[k]);
  }
  return out;
}

export type WeekBucket = { weekStart: string; weekEnd: string; label: string };

/** Pazartesi başlangıçlı ISO haftaları; aralıkla kesişen haftalar (uçlar analiz aralığına kırpılır) */
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
    if (!isQuestionCoachGoal(g)) continue;
    const T = Number(g.target_quantity);
    if (!Number.isFinite(T) || T <= 0) continue;
    const span = goalCalendarSpanYmd(g);
    if (!span) continue;
    const spanDays = spanInclusiveDayCount(span.gs, span.ge);
    const inWeek = overlapInclusiveDayCount(span.gs, span.ge, clipS, clipE);
    if (inWeek <= 0) continue;
    sum += (T * inWeek) / spanDays;
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
