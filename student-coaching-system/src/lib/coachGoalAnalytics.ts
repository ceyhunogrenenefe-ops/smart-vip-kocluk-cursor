import { addDays, eachDayOfInterval, eachWeekOfInterval, endOfWeek, format, max as dfMax, min as dfMin, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';
import type { CoachWeeklyGoalRow, WeeklyPlannerEntryRow } from './weeklyPlannerApi';
import type { WeeklyEntry } from '../types';
import { effectivePagesRead, goalMinutesFromEntry } from './studyInsightMetrics';

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

/**
 * Toplam soru sayısına giren hedefler. Paragraf ve problem de soru çözümüdür:
 * kırılımda ayrı ders/kart olarak görünür ama toplam soru hedefine ve çözülene dahildir.
 */
export function isQuestionCoachGoal(g: CoachWeeklyGoalRow): boolean {
  const k = coachGoalUnitKind(g);
  return k === 'soru' || k === 'tekrar' || k === 'paragraf' || k === 'problem';
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

/**
 * Aynı ders+birim için tarihleri çakışan eski hedefleri eler (analiz çift sayımını önler).
 * Ardışık haftaların hedefleri (tarihleri kesişmeyen) ayrı ayrı sayılır — önceden aralık
 * birden çok haftayı kapsayınca yalnız son haftanın hedefi kalıyor, toplam eksik görünüyordu.
 * Birebir aynı kaydedilmiş kopyalar da elenir.
 */
export function dedupeCoachGoalsForAnalytics(
  goals: CoachWeeklyGoalRow[],
  rangeFrom: string,
  rangeTo: string
): CoachWeeklyGoalRow[] {
  const rf = clipYmd(rangeFrom);
  const rt = clipYmd(rangeTo);
  const inRange = goals.filter((g) => goalOverlapsRange(g, rf, rt));
  const spanOf = (g: CoachWeeklyGoalRow) => {
    const sp = goalCalendarSpanYmd(g);
    return { gs: sp?.gs ?? '', ge: sp?.ge ?? '', key: `${sp?.gs ?? ''}|${sp?.ge ?? ''}` };
  };
  const kindKey = (g: CoachWeeklyGoalRow) => `${normSubjectKey(g.subject)}::${coachGoalUnitKind(g)}`;

  // Aynı ders+birimde, bu hedefle tarihi kesişen ve daha yeni dönemli (farklı span) bir hedef varsa bu eskidir
  const superseded = (g: CoachWeeklyGoalRow) => {
    const a = spanOf(g);
    const k = kindKey(g);
    return inRange.some((h) => {
      if (h === g || kindKey(h) !== k) return false;
      const b = spanOf(h);
      if (b.key === a.key || b.key <= a.key) return false;
      return overlapInclusiveDayCount(a.gs, a.ge, b.gs, b.ge) > 0;
    });
  };

  const seenExact = new Set<string>();
  const out: CoachWeeklyGoalRow[] = [];
  const ordered = [...inRange].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  for (const g of ordered) {
    if (superseded(g)) continue;
    const exactKey = `${kindKey(g)}::${spanOf(g).key}::${String(g.title || '').trim().toLocaleLowerCase('tr-TR')}::${Number(g.target_quantity) || 0}`;
    if (seenExact.has(exactKey)) continue;
    seenExact.add(exactKey);
    out.push(g);
  }
  return out;
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
  const deduped = dedupeCoachGoalsForAnalytics(goals, rangeFrom, rangeTo);
  const done = attributeCoachGoalCompletions(deduped, entries, rangeFrom, rangeTo, plannerEntries);
  let sum = 0;
  for (const g of deduped) {
    if (!isQuestionCoachGoal(g)) continue;
    sum += done.get(g.id) ?? 0;
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
  const deduped = dedupeCoachGoalsForAnalytics(goals, analysisRangeFrom, analysisRangeTo);
  const done = attributeCoachGoalCompletions(deduped, weeklyEntries, ymdFrom, ymdTo);
  let sum = 0;
  for (const g of deduped) {
    if (!isQuestionCoachGoal(g)) continue;
    if (!goalOverlapsRange(g, ymdFrom, ymdTo)) continue;
    sum += done.get(g.id) ?? 0;
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
 * Tek plan bloğu gerçekleşen — haftalık plan ile aynı.
 * Günlük kayıt + planner.completed_quantity + status=completed birleşik (max);
 * boş linked satır yeşili ezmesin.
 */
export function effectivePlannerEntryDone(
  g: CoachWeeklyGoalRow,
  row: WeeklyPlannerEntryRow,
  weeklyEntries: WeeklyEntry[]
): number {
  const planned = Math.max(0, Number(row.planned_quantity || 0));
  const kind = coachGoalUnitKind(g);
  // Hedefin fazlası yapılabilir: planlanana kırpmıyoruz, aşım görünür kalsın.
  const clamp = (n: number) => Math.max(0, n);

  let fromWeekly = 0;
  const wid = row.weekly_entry_id;
  if (wid) {
    const linked = weeklyEntries.find((w) => w.id === wid);
    if (linked) {
      if (kind === 'sayfa') fromWeekly = effectivePagesRead(linked);
      else if (kind === 'dakika') fromWeekly = goalMinutesFromEntry(linked);
      else fromWeekly = Math.max(0, Number(linked.solvedQuestions || 0));
    }
  }

  const fromPlanner = Math.max(0, Number(row.completed_quantity || 0));
  let done = Math.max(fromWeekly, fromPlanner);

  if (String(row.status || '').toLowerCase() === 'completed' && planned > 0) {
    done = Math.max(done, planned);
  }

  return clamp(done);
}

/** Takvim hücresi: koç hedefli veya serbest blok için yapılan miktar */
export function plannerBlockDoneQuantity(
  row: WeeklyPlannerEntryRow,
  goals: CoachWeeklyGoalRow[],
  weeklyEntries: WeeklyEntry[]
): number {
  const planned = Math.max(0, Number(row.planned_quantity || 0));
  const linkedGoal = row.coach_goal_id ? goals.find((g) => g.id === row.coach_goal_id) : undefined;
  let done = linkedGoal
    ? effectivePlannerEntryDone(linkedGoal, row, weeklyEntries)
    : Math.max(0, Number(row.completed_quantity || 0));

  if (String(row.status || '').toLowerCase() === 'completed' && planned > 0) {
    done = Math.max(done, planned);
  }

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

type GoalAmountType = 'soru' | 'sayfa' | 'dakika';

function amountTypeForGoal(g: CoachWeeklyGoalRow): GoalAmountType {
  const kind = coachGoalUnitKind(g);
  if (kind === 'sayfa') return 'sayfa';
  if (kind === 'dakika') return 'dakika';
  return 'soru';
}

function entryAmountForType(e: WeeklyEntry, t: GoalAmountType): number {
  if (t === 'sayfa') return Math.max(0, effectivePagesRead(e));
  if (t === 'dakika') return Math.max(0, goalMinutesFromEntry(e));
  return Math.max(0, Number(e.solvedQuestions || 0));
}

/** Günlük kayıttan otomatik üretilen takvim bloğu (sync-weekly-entry-planner) */
function isAutoSyncedPlannerRow(row: WeeklyPlannerEntryRow): boolean {
  return String(row.id || '').startsWith('wpe-sync-');
}

export type GoalSpanResolver = (g: CoachWeeklyGoalRow) => { gs: string; ge: string } | null;

/**
 * Her hedefin gerçekleşen miktarını, günlük kayıtları hedeflere TEK KEZ
 * dağıtarak hesaplar.
 *
 * Eski davranış: her hedef, kendi dersindeki TÜM günlük kayıtları topluyordu.
 * Aynı dersten iki hedef varsa (ör. Matematik 100 soru + Matematik 50 problem)
 * tek bir kayıt ikisine birden sayılıyor, iki hedef birden yeşile dönüyordu.
 *
 * Kurallar:
 * 1. Öğrencinin takvimde bir bloğa kaydettiği çalışma (bloğa bağlı günlük kayıt)
 *    yalnız o bloğun hedefine sayılır.
 * 2. Bağsız günlük kayıtlar, aynı ders ve birim türündeki hedeflere
 *    başlangıç tarihi ve oluşturulma sırasıyla hedef dolana kadar dağıtılır.
 *    Tüm hedefler dolduysa artan son uygun hedefe yazılır; hedef aşımı görünür.
 * 3. Günlük kayda bağlanmadan elle "tamamlandı" işaretlenen bloklar ayrıca
 *    hesaplanır ve kayıt tarafıyla büyük olanı alınır. Öğrenci hem bloğu
 *    işaretleyip hem günlük kayıt girdiğinde aynı çalışma iki kez sayılmaz.
 */
export function attributeCoachGoalCompletions(
  goals: CoachWeeklyGoalRow[],
  entries: WeeklyEntry[],
  rangeFrom: string,
  rangeTo: string,
  plannerEntries: WeeklyPlannerEntryRow[] = [],
  resolveSpan?: GoalSpanResolver
): Map<string, number> {
  const rf = clipYmd(rangeFrom);
  const rt = clipYmd(rangeTo);
  const fromEntries = new Map<string, number>();
  const clipOf = new Map<string, { from: string; to: string }>();
  const goalById = new Map<string, CoachWeeklyGoalRow>();

  for (const g of goals) {
    goalById.set(g.id, g);
    fromEntries.set(g.id, 0);
    if (!rf || !rt || rf > rt) continue;
    const span = resolveSpan ? resolveSpan(g) : goalCalendarSpanYmd(g);
    if (!span) continue;
    const from = span.gs >= rf ? span.gs : rf;
    const to = span.ge <= rt ? span.ge : rt;
    if (from <= to) clipOf.set(g.id, { from, to });
  }
  const inClip = (goalId: string, ymd: string) => {
    const c = clipOf.get(goalId);
    return Boolean(c && ymd >= c.from && ymd <= c.to);
  };
  const add = (goalId: string, n: number) => {
    if (n > 0) fromEntries.set(goalId, (fromEntries.get(goalId) || 0) + n);
  };

  // 1) Öğrencinin bloğa bağladığı günlük kayıt → yalnız o hedef
  const explicitLink = new Map<string, string>();
  for (const p of plannerEntries) {
    if (!p.weekly_entry_id || !p.coach_goal_id) continue;
    if (isAutoSyncedPlannerRow(p)) continue;
    if (!goalById.has(p.coach_goal_id)) continue;
    const wid = String(p.weekly_entry_id);
    if (!explicitLink.has(wid)) explicitLink.set(wid, String(p.coach_goal_id));
  }
  const consumed = new Set<string>();
  for (const e of entries) {
    const gid = explicitLink.get(String(e.id));
    if (!gid) continue;
    const g = goalById.get(gid);
    if (!g) continue;
    const d = clipYmd(e.date);
    if (!inClip(gid, d)) continue;
    const t = amountTypeForGoal(g);
    add(gid, entryAmountForType(e, t));
    consumed.add(`${e.id}::${t}`);
  }

  // 2) Bağsız kayıtlar → aynı ders + birim türündeki hedeflere sırayla
  const groups = new Map<string, CoachWeeklyGoalRow[]>();
  for (const g of goals) {
    if (!clipOf.has(g.id)) continue;
    const key = `${normSubjectKey(g.subject)}::${amountTypeForGoal(g)}`;
    const arr = groups.get(key) || [];
    arr.push(g);
    groups.set(key, arr);
  }
  const orderedEntries = [...entries].sort((a, b) => clipYmd(a.date).localeCompare(clipYmd(b.date)));
  for (const [key, arr] of groups) {
    const sep = key.lastIndexOf('::');
    const subjectKey = key.slice(0, sep);
    const t = key.slice(sep + 2) as GoalAmountType;
    arr.sort((a, b) => {
      const sa = clipOf.get(a.id)!.from;
      const sb = clipOf.get(b.id)!.from;
      if (sa !== sb) return sa < sb ? -1 : 1;
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });
    for (const e of orderedEntries) {
      if (normSubjectKey(e.subject) !== subjectKey) continue;
      if (consumed.has(`${e.id}::${t}`)) continue;
      let amount = entryAmountForType(e, t);
      if (amount <= 0) continue;
      const d = clipYmd(e.date);
      const eligible = arr.filter((g) => inClip(g.id, d));
      if (!eligible.length) continue;
      for (const g of eligible) {
        if (amount <= 0) break;
        const target = Math.max(0, Number(g.target_quantity) || 0);
        const room = Math.max(0, target - (fromEntries.get(g.id) || 0));
        const give = Math.min(amount, room);
        if (give > 0) {
          add(g.id, give);
          amount -= give;
        }
      }
      if (amount > 0) add(eligible[eligible.length - 1].id, amount);
    }
  }

  // 3) Elle tamamlanan bloklar (otomatik senkron blokları hariç) → büyük olan
  const out = new Map<string, number>();
  for (const g of goals) {
    let manual = 0;
    if (clipOf.has(g.id)) {
      for (const p of plannerEntries) {
        if (p.coach_goal_id !== g.id || isAutoSyncedPlannerRow(p)) continue;
        if (!inClip(g.id, clipYmd(p.planner_date))) continue;
        manual += effectivePlannerEntryDone(g, p, entries);
      }
    }
    out.set(g.id, Math.max(fromEntries.get(g.id) || 0, manual));
  }
  return out;
}

/**
 * Tek hedefin gerçekleşen miktarı. Aynı öğrencinin diğer hedefleri `allGoals`
 * ile verilirse günlük kayıtlar hedefler arasında paylaştırılır (çift sayım yok).
 */
export function completedForCoachGoal(
  g: CoachWeeklyGoalRow,
  entries: WeeklyEntry[],
  rangeFrom: string,
  rangeTo: string,
  plannerEntries: WeeklyPlannerEntryRow[] = [],
  allGoals?: CoachWeeklyGoalRow[]
): number {
  if (!goalOverlapsRange(g, rangeFrom, rangeTo)) return 0;
  const pool = allGoals && allGoals.some((x) => x.id === g.id) ? allGoals : [g];
  return attributeCoachGoalCompletions(pool, entries, rangeFrom, rangeTo, plannerEntries).get(g.id) ?? 0;
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
  /** Süre (dakika) hedefleri: çalışma süresinden */
  dakika: CoachGoalProgressBucket;
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

  const doneByGoal = attributeCoachGoalCompletions(activeGoals, entries, rf, rt, plannerEntries);
  for (const g of activeGoals) {
    const kind = coachGoalUnitKind(g);
    const t = coachTargetInAnalysisRange(g, rf, rt);
    const p = plannedForCoachGoal(g, plannerEntries, rf, rt);
    const c = doneByGoal.get(g.id) ?? 0;
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
  const paragrafB = finalize('paragraf');
  const problemB = finalize('problem');
  // Toplam soru: soru + tekrar + paragraf + problem (kartlarda ayrıca ayrı gösterilir)
  const qBuckets = [soruB, tekrarB, paragrafB, problemB];
  let questionTarget = qBuckets.reduce((a, b) => a + b.target, 0);
  const questionPlanned = qBuckets.reduce((a, b) => a + b.planned, 0);
  const questionCompleted = qBuckets.reduce((a, b) => a + b.completed, 0);
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
    paragraf: paragrafB,
    problem: problemB,
    sayfa: finalize('sayfa'),
    dakika: finalize('dakika'),
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

  const doneByGoal = attributeCoachGoalCompletions(activeGoals, entries, rf, rt, plannerEntries);
  for (const g of activeGoals) {
    const sub = String(g.subject || '').trim() || 'Diğer';
    const kind = coachGoalUnitKind(g);
    const prev = bySubject.get(sub) || { kind, target: 0, completed: 0 };
    prev.target += coachTargetInAnalysisRange(g, rf, rt);
    prev.completed += doneByGoal.get(g.id) ?? 0;
    bySubject.set(sub, prev);
  }

  const entryStats: Record<string, { correct: number; wrong: number; blank: number; solved: number }> =
    {};
  const countedEntryForSubject = new Set<string>();
  for (const g of activeGoals) {
    const clip = goalClipRangeYmd(g, rf, rt);
    if (!clip) continue;
    const sub = String(g.subject || '').trim() || 'Diğer';
    for (const e of entries) {
      const statKey = `${sub}::${e.id}`;
      if (countedEntryForSubject.has(statKey)) continue;
      const d = clipYmd(e.date);
      if (d < clip.clipFrom || d > clip.clipTo) continue;
      if (normSubjectKey(e.subject) !== normSubjectKey(g.subject)) continue;
      countedEntryForSubject.add(statKey);
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
