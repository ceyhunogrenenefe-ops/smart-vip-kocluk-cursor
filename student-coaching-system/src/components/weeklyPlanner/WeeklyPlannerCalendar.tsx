import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, format, isBefore, parseISO, startOfWeek } from 'date-fns';
import { tr } from 'date-fns/locale/tr';
import { IconTapButton } from '../ui/IconTapButton';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  GripVertical,
  BookOpen,
  CalendarRange,
  Pencil,
  Clock,
  Target,
  FileDown,
  MessageCircle,
  Loader2,
} from 'lucide-react';
import type { CoachWeeklyGoalRow, WeeklyPlannerEntryRow } from '../../lib/weeklyPlannerApi';
import {
  createCoachWeeklyGoal,
  createWeeklyPlannerEntry,
  deleteCoachWeeklyGoal,
  deleteWeeklyPlannerEntry,
  fetchCoachWeeklyGoals,
  fetchWeeklyPlannerEntries,
  patchCoachWeeklyGoal,
  patchWeeklyPlannerEntry,
} from '../../lib/weeklyPlannerApi';
import { COACH_GOAL_QUANTITY_UNITS } from '../../lib/coachGoalUnits';
import { effectivePlannerEntryDone, completedForCoachGoal } from '../../lib/coachGoalAnalytics';
import { defaultGoalUnitForSubject, sortSubjectsWithStudyTracks } from '../../lib/studyTrackSubjects';
import {
  isTopicMarkedCompleted,
  resolveTopicLabelForTracking
} from '../../lib/topicProgressSync';
import { WeeklyPlannerStudyModal } from './WeeklyPlannerStudyModal';
import { EtutPlannerEntryModal } from '../etut/EtutPlannerEntryModal';
import { isEtutSubject } from '../../lib/etutSession';
import { DailyScreenTimeChart } from './DailyScreenTimeChart';
import { fetchScreenTimeLogs } from '../../lib/screenTimeApi';
import { mergeScreenTimeByDate } from '../../lib/mergeScreenTimeByDate';
import { subjectPlannerStyle } from './subjectPlannerStyle';
import { cn } from '../../lib/utils';
import { useMobileAppShell } from '../../hooks/useMobileAppShell';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { formatClassLevelLabel } from '../../types';
import { formatWhatsAppPhone, sendWhatsAppOutbound, sendWhatsAppOutboundDocument, blobToBase64 } from '../../lib/whatsappOutbound';
import { getGatewaySessionUserId } from '../../lib/session';
import {
  buildParentWeeklyGoalsMessage,
  buildParentWeeklyPlanPdfCaption,
  buildWeeklyPlannerPdfBlob,
  downloadWeeklyPlannerPdf,
} from '../../lib/pdfWeeklyPlanner';
import {
  addMinutesToTimeHhmm,
  buildDistinctPlannerSlots,
  buildPlannerTimeSlots,
  entryMatchesPlannerSlot,
  loadPlannerGridStepMinutes,
  plannerGridRowMinHeight,
  savePlannerGridStepMinutes,
  timeToMinutes,
  type PlannerGridStepMinutes,
  type PlannerTimeSlot,
} from '../../lib/weeklyPlannerTimeSlots';

export { subjectPlannerStyle };

const DAY_LABELS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

/** Hedef kartında gösterilecek okunaklı aralık (ör. tek gün Cumartesi veya 6–8 Şubat) */
function formatGoalRangeLabel(startYmd: string, endYmd: string) {
  try {
    const s = parseISO(startYmd);
    const e = parseISO(endYmd);
    if (startYmd === endYmd) {
      return format(s, 'd MMMM yyyy, EEEE', { locale: tr });
    }
    return `${format(s, 'd MMM', { locale: tr })} – ${format(e, 'd MMM yyyy', { locale: tr })}`;
  } catch {
    return `${startYmd} → ${endYmd}`;
  }
}

/** Takvim / kota için: hedefin etkin başlangıç–bitiş (tarih yoksa kayıtlı haftanın Pzt–Paz aralığı) */
function goalEffectiveSpan(goal: CoachWeeklyGoalRow, weekFallbackStart: string, weekFallbackEnd: string) {
  const ws = (goal.week_start_date || weekFallbackStart).slice(0, 10);
  let start = (goal.goal_start_date || ws).slice(0, 10);
  const rawEnd = goal.goal_end_date != null ? String(goal.goal_end_date).trim() : '';
  let end = rawEnd.slice(0, 10);
  if (!end) {
    try {
      end = format(addDays(parseISO(`${ws}T12:00:00`), 6), 'yyyy-MM-dd');
    } catch {
      end = weekFallbackEnd;
    }
  }
  if (start > end) {
    const t = start;
    start = end;
    end = t;
  }
  return { start, end };
}

function slotMinutes(start: string, end: string) {
  const [sh, sm] = start.split(':').map((x) => parseInt(x, 10));
  const [eh, em] = end.split(':').map((x) => parseInt(x, 10));
  const a = sh * 60 + (sm || 0);
  const b = eh * 60 + (em || 0);
  return Math.max(0, b - a);
}

type ModalMode = 'idle' | 'create' | 'edit';

interface WeeklyPlannerCalendarProps {
  studentId: string;
  studentName?: string;
  canEditPlan: boolean;
  canManageGoals: boolean;
  /** Koç atanmamış öğrenci — tüm hedefleri kendisi yönetir */
  selfCoachingMode?: boolean;
  /** Atanmış koç var — koç hedefleri salt okunur, öğrenci ek hedef ekleyebilir */
  hasAssignedCoach?: boolean;
  /** Öğrenci kendi planında: blok tıklanınca günlük çalışma kaydı modalı */
  studentStudyLogUi?: boolean;
  /** Öğrenci veya koç: blok tıklanınca çalışma kaydı (soru / sayfa / süre) */
  studyLogOnClick?: boolean;
}

export function WeeklyPlannerCalendar({
  studentId,
  studentName,
  canEditPlan,
  canManageGoals,
  selfCoachingMode = false,
  hasAssignedCoach = false,
  studentStudyLogUi = false,
  studyLogOnClick = false,
}: WeeklyPlannerCalendarProps) {
  const {
    students,
    institution,
    getTopics,
    getTopicsByClass,
    markTopicCompleted,
    getStudentTopicProgress,
    refreshTopicProgress,
    weeklyEntries,
  } = useApp();
  const { effectiveUser } = useAuth();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [parentShareBusy, setParentShareBusy] = useState(false);
  const [parentPdfShareBusy, setParentPdfShareBusy] = useState(false);
  const [parentShareNotice, setParentShareNotice] = useState('');
  const [parentShareWaUrl, setParentShareWaUrl] = useState<string | null>(null);

  const studentWeeklyEntries = useMemo(
    () => weeklyEntries.filter((e) => e.studentId === studentId),
    [weeklyEntries, studentId]
  );

  const plannerStudent = useMemo(() => students.find((s) => s.id === studentId), [students, studentId]);
  const classLevel = plannerStudent?.classLevel;

  /** Öğrenci: koçsuz modda tüm hedefler; koçlu modda yalnızca kendi hedefleri (coach_id null) */
  const canEditGoal = useCallback(
    (goal: CoachWeeklyGoalRow) => {
      if (!canManageGoals) return false;
      if (!studentStudyLogUi) return true;
      if (selfCoachingMode) return true;
      return !goal.coach_id;
    },
    [canManageGoals, studentStudyLogUi, selfCoachingMode]
  );

  const goalsSectionTitle =
    studentStudyLogUi || selfCoachingMode ? 'Haftalık hedeflerin' : 'Koç hedefleri';

  /** Öğrenci sınıfına göre konu havuzunda tanımlı dersler */
  const poolSubjects = useMemo(() => {
    if (classLevel === undefined || classLevel === null) return [] as string[];
    const tb = getTopicsByClass(classLevel);
    if (tb.isYKS) {
      const list = [
        ...Object.keys(tb.tytSubjects),
        ...Object.keys(tb.aytSubjects),
        ...Object.keys(tb.regular)
      ];
      return sortSubjectsWithStudyTracks(list);
    }
    return sortSubjectsWithStudyTracks(Object.keys(tb.regular));
  }, [classLevel, getTopicsByClass]);

  const [anchor, setAnchor] = useState(() => new Date());
  const weekStartStr = useMemo(
    () => format(startOfWeek(anchor, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    [anchor]
  );
  const weekEndStr = useMemo(
    () => format(addDays(parseISO(weekStartStr), 6), 'yyyy-MM-dd'),
    [weekStartStr]
  );

  const [goals, setGoals] = useState<CoachWeeklyGoalRow[]>([]);
  const [entries, setEntries] = useState<WeeklyPlannerEntryRow[]>([]);
  const [screenTimeByDate, setScreenTimeByDate] = useState<Map<string, number>>(() => new Map());
  const [screenTimeLoading, setScreenTimeLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');

  const [modalMode, setModalMode] = useState<ModalMode>('idle');
  const [slotContext, setSlotContext] = useState<{ date: string; startTime: string; endTime: string } | null>(null);
  const [activeEntry, setActiveEntry] = useState<WeeklyPlannerEntryRow | null>(null);
  const [studyModalEntry, setStudyModalEntry] = useState<WeeklyPlannerEntryRow | null>(null);
  const [etutPlannerEntry, setEtutPlannerEntry] = useState<WeeklyPlannerEntryRow | null>(null);

  const [newGoalSubject, setNewGoalSubject] = useState('');
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalQty, setNewGoalQty] = useState(100);
  const [newGoalUnit, setNewGoalUnit] = useState('soru');
  const [newGoalStart, setNewGoalStart] = useState('');
  const [newGoalEnd, setNewGoalEnd] = useState('');

  const newGoalTopicOptions = useMemo(() => {
    if (classLevel === undefined || classLevel === null || !newGoalSubject) return [];
    return getTopics(newGoalSubject, classLevel);
  }, [classLevel, newGoalSubject, getTopics]);

  const [formGoalId, setFormGoalId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formPlannedQty, setFormPlannedQty] = useState(10);

  const modalTopicOptions = useMemo(() => {
    if (classLevel === undefined || classLevel === null || !formSubject.trim()) return [];
    return getTopics(formSubject.trim(), classLevel);
  }, [classLevel, formSubject, getTopics]);

  /** Havuzda olmayan eski kayıtları düzenlerken seçenek listesinde tut */
  const modalSubjectOptions = useMemo(() => {
    const sub = formSubject.trim();
    if (sub && !poolSubjects.includes(sub)) return [sub, ...poolSubjects];
    return poolSubjects;
  }, [poolSubjects, formSubject]);

  const modalTopicSelectOptions = useMemo(() => {
    const t = formTitle.trim();
    const raw = modalTopicOptions;
    if (t && !raw.includes(t)) return [t, ...raw];
    return raw;
  }, [modalTopicOptions, formTitle]);

  const [goalDateEditId, setGoalDateEditId] = useState<string | null>(null);
  const [goalDateEditStart, setGoalDateEditStart] = useState('');
  const [goalDateEditEnd, setGoalDateEditEnd] = useState('');
  const [goalDateSaving, setGoalDateSaving] = useState(false);
  /** Hedef kartını önceki/sonraki hafta şeridine sürüklerken vurgu */
  const [weekDropHighlight, setWeekDropHighlight] = useState<-1 | 0 | 1>(0);
  /** Öğrenci mobil: haftalık grid yerine günlük liste */
  const [isCompactMobile, setIsCompactMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false
  );
  const [mobileDayIdx, setMobileDayIdx] = useState(0);
  const [mobileCreateSlotIdx, setMobileCreateSlotIdx] = useState(0);
  const [gridSlotMinutes, setGridSlotMinutes] = useState<PlannerGridStepMinutes>(() => loadPlannerGridStepMinutes());
  const [formStartTime, setFormStartTime] = useState('09:00');
  const [formEndTime, setFormEndTime] = useState('10:00');

  const timeSlots = useMemo(
    () => buildPlannerTimeSlots({ stepMinutes: gridSlotMinutes }),
    [gridSlotMinutes]
  );
  const gridRowMinH = useMemo(() => plannerGridRowMinHeight(gridSlotMinutes), [gridSlotMinutes]);

  const mobileAppShell = useMobileAppShell();
  const vibrantMobileChrome = studentStudyLogUi || mobileAppShell;

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsCompactMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  /** Çift tıklama / yarış: aynı işlem iki kez API çağırmasın */
  const plannerMutateLock = useRef(false);
  const reloadSeq = useRef(0);
  const [plannerUiBusy, setPlannerUiBusy] = useState(false);
  const runPlannerMutation = useCallback(async (fn: () => Promise<void>) => {
    if (plannerMutateLock.current) return;
    plannerMutateLock.current = true;
    setPlannerUiBusy(true);
    try {
      await fn();
    } finally {
      plannerMutateLock.current = false;
      setPlannerUiBusy(false);
    }
  }, []);

  const loadScreenTimeForWeek = useCallback(
    async (seq: number) => {
      setScreenTimeLoading(true);
      try {
        const weeklyRows = studentWeeklyEntries
          .filter((e) => e.date >= weekStartStr && e.date <= weekEndStr)
          .map((e) => ({
            student_id: studentId,
            date: e.date,
            screen_time_minutes: e.screenTimeMinutes ?? null,
          }));
        const st = await fetchScreenTimeLogs(studentId, weekStartStr, weekEndStr);
        if (seq !== reloadSeq.current) return;
        const dedicated = new Map<string, number>();
        for (const row of st) {
          dedicated.set(String(row.log_date).slice(0, 10), Number(row.screen_minutes) || 0);
        }
        setScreenTimeByDate(mergeScreenTimeByDate(dedicated, weeklyRows));
      } catch {
        if (seq === reloadSeq.current) setScreenTimeByDate(new Map());
      } finally {
        if (seq === reloadSeq.current) setScreenTimeLoading(false);
      }
    },
    [studentId, weekStartStr, weekEndStr, studentWeeklyEntries]
  );

  const reload = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!studentId) return;
      const seq = ++reloadSeq.current;
      if (!opts?.silent) setLoading(true);
      setErr('');
      try {
        const [g, eWeek] = await Promise.all([
          fetchCoachWeeklyGoals(studentId, weekStartStr),
          fetchWeeklyPlannerEntries(studentId, weekStartStr, weekEndStr),
        ]);
        if (seq !== reloadSeq.current) return;

        let entryFrom = weekStartStr;
        let entryTo = weekEndStr;
        for (const goal of g) {
          const { start, end } = goalEffectiveSpan(goal, weekStartStr, weekEndStr);
          if (start < entryFrom) entryFrom = start;
          if (end > entryTo) entryTo = end;
        }

        setGoals(g);
        setEntries(eWeek);
        if (!opts?.silent) setLoading(false);

        if (entryFrom < weekStartStr || entryTo > weekEndStr) {
          const eExtended = await fetchWeeklyPlannerEntries(studentId, entryFrom, entryTo);
          if (seq !== reloadSeq.current) return;
          setEntries(eExtended);
        }

        void loadScreenTimeForWeek(seq);
      } catch (e) {
        if (seq !== reloadSeq.current) return;
        setErr(e instanceof Error ? e.message : 'Yükleme hatası');
        if (!opts?.silent) setLoading(false);
      }
    },
    [studentId, weekStartStr, weekEndStr, loadScreenTimeForWeek]
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onEtutSaved = (ev: Event) => {
      const detail = (ev as CustomEvent<{ studentId?: string }>).detail;
      if (detail?.studentId && detail.studentId !== studentId) return;
      void reload({ silent: true });
    };
    window.addEventListener('coaching:etut-report-saved', onEtutSaved);
    return () => window.removeEventListener('coaching:etut-report-saved', onEtutSaved);
  }, [studentId, reload]);

  useEffect(() => {
    setNewGoalSubject('');
    setNewGoalTitle('');
  }, [studentId]);

  useEffect(() => {
    setNewGoalStart(weekStartStr);
    setNewGoalEnd(weekEndStr);
  }, [weekStartStr, weekEndStr]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void reload({ silent: true });
    };
    const id = window.setInterval(tick, 45000);
    const onVis = () => {
      if (document.visibilityState === 'visible') void reload({ silent: true });
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [reload]);

  const dayDates = useMemo(
    () => DAY_LABELS.map((_, i) => format(addDays(parseISO(weekStartStr), i), 'yyyy-MM-dd')),
    [weekStartStr]
  );

  const goalAggregates = useMemo(() => {
    return goals.map((g) => {
      const { start: gStart, end: gEnd } = goalEffectiveSpan(g, weekStartStr, weekEndStr);
      const rel = entries.filter(
        (e) => e.coach_goal_id === g.id && e.planner_date >= gStart && e.planner_date <= gEnd
      );
      const plannedSum = rel.reduce((s, e) => s + Number(e.planned_quantity || 0), 0);
      const completedSum = completedForCoachGoal(g, studentWeeklyEntries, gStart, gEnd, entries);
      const target = Number(g.target_quantity || 0);
      const remaining = Math.max(0, target - plannedSum);
      const over = plannedSum > target;
      return { goal: g, plannedSum, completedSum, target, remaining, over };
    });
  }, [goals, entries, weekStartStr, weekEndStr, studentWeeklyEntries]);

  /** Modalda gösterilecek kalan kota — düzenlemede mevcut hücrenin miktarı geri sayılır. */
  const modalGoalQuota = useMemo(() => {
    return goalAggregates.map((row) => {
      const editingBonus =
        activeEntry?.coach_goal_id === row.goal.id ? Number(activeEntry.planned_quantity || 0) : 0;
      return {
        ...row,
        available: row.remaining + editingBonus,
      };
    });
  }, [goalAggregates, activeEntry]);

  const selectedGoalAvailable = useMemo(() => {
    if (!formGoalId) return null;
    return modalGoalQuota.find((r) => r.goal.id === formGoalId)?.available ?? 0;
  }, [formGoalId, modalGoalQuota]);

  const goalsByDayDate = useMemo(() => {
    const out: Record<string, CoachWeeklyGoalRow[]> = {};
    for (const d of dayDates) {
      out[d] = goals.filter((g) => {
        const { start, end } = goalEffectiveSpan(g, weekStartStr, weekEndStr);
        return d >= start && d <= end;
      });
    }
    return out;
  }, [goals, dayDates, weekStartStr, weekEndStr]);

  useEffect(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const idx = dayDates.indexOf(today);
    setMobileDayIdx(idx >= 0 ? idx : 0);
  }, [weekStartStr, dayDates]);

  const showMobileDayView = mobileAppShell || (studentStudyLogUi && isCompactMobile);
  const showCoachParentShare = !studentStudyLogUi && canManageGoals;
  const canExportPdf = Boolean(canEditPlan && studentId);

  const exportPlannerPdf = useCallback(async () => {
    if (!studentId) return;
    setPdfBusy(true);
    try {
      const prevWeekStart = format(addDays(parseISO(weekStartStr), -7), 'yyyy-MM-dd');
      const prevWeekEnd = format(addDays(parseISO(prevWeekStart), 6), 'yyyy-MM-dd');
      const prevWeekEntries = await fetchWeeklyPlannerEntries(studentId, prevWeekStart, prevWeekEnd);
      await downloadWeeklyPlannerPdf({
        studentName: studentName || plannerStudent?.name || 'Öğrenci',
        weekStart: weekStartStr,
        weekEnd: weekEndStr,
        dayDates,
        goals,
        entries,
        institutionName: institution?.name,
        logoUrl: institution?.logo ?? null,
        prevWeekStart,
        prevWeekEnd,
        prevWeekEntries,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'PDF oluşturulamadı');
    } finally {
      setPdfBusy(false);
    }
  }, [
    studentId,
    studentName,
    plannerStudent?.name,
    weekStartStr,
    weekEndStr,
    dayDates,
    goals,
    entries,
    institution?.name,
    institution?.logo,
  ]);

  const shareWeeklyGoalsWithParent = useCallback(async () => {
    setParentShareNotice('');
    setParentShareWaUrl(null);
    const st = plannerStudent;
    const coachUserId = getGatewaySessionUserId(effectiveUser?.id);
    if (!st || !coachUserId) return;
    const parentPhone = formatWhatsAppPhone(st.parentPhone || '');
    if (!parentPhone) {
      setParentShareNotice('Bu öğrenci için veli telefonu tanımlı değil.');
      return;
    }
    const message = buildParentWeeklyGoalsMessage({
      studentName: st.name,
      weekStart: weekStartStr,
      weekEnd: weekEndStr,
      goals,
      entries,
    });
    setParentShareBusy(true);
    try {
      const result = await sendWhatsAppOutbound({
        coachUserId,
        targetPhone: parentPhone,
        message,
      });
      setParentShareNotice(result.notice);
      setParentShareWaUrl(result.waUrl ?? null);
    } catch (e) {
      setParentShareNotice(e instanceof Error ? e.message : 'Mesaj gönderilemedi');
    } finally {
      setParentShareBusy(false);
    }
  }, [plannerStudent, effectiveUser?.id, weekStartStr, weekEndStr, goals, entries]);

  const shareWeeklyPdfWithParent = useCallback(async () => {
    setParentShareNotice('');
    setParentShareWaUrl(null);
    const st = plannerStudent;
    const coachUserId = getGatewaySessionUserId(effectiveUser?.id);
    if (!st || !coachUserId || !studentId) return;
    const parentPhone = formatWhatsAppPhone(st.parentPhone || '');
    if (!parentPhone) {
      setParentShareNotice('Bu öğrenci için veli telefonu tanımlı değil.');
      return;
    }
    setParentPdfShareBusy(true);
    try {
      const prevWeekStart = format(addDays(parseISO(weekStartStr), -7), 'yyyy-MM-dd');
      const prevWeekEnd = format(addDays(parseISO(prevWeekStart), 6), 'yyyy-MM-dd');
      const prevWeekEntries = await fetchWeeklyPlannerEntries(studentId, prevWeekStart, prevWeekEnd);
      const { blob, filename } = await buildWeeklyPlannerPdfBlob({
        studentName: studentName || st.name || 'Öğrenci',
        weekStart: weekStartStr,
        weekEnd: weekEndStr,
        dayDates,
        goals,
        entries,
        institutionName: institution?.name,
        logoUrl: institution?.logo ?? null,
        compactForShare: true,
        prevWeekStart,
        prevWeekEnd,
        prevWeekEntries,
      });
      const caption = buildParentWeeklyPlanPdfCaption({
        studentName: st.name,
        weekStart: weekStartStr,
        weekEnd: weekEndStr,
      });
      const result = await sendWhatsAppOutboundDocument({
        coachUserId,
        targetPhone: parentPhone,
        studentId: studentId || undefined,
        studentName: st.name || studentName || '',
        pdfTitle: 'Haftalık çalışma planı',
        filename,
        base64: await blobToBase64(blob),
        caption,
      });
      setParentShareNotice(result.notice);
    } catch (e) {
      setParentShareNotice(e instanceof Error ? e.message : 'PDF gönderilemedi');
    } finally {
      setParentPdfShareBusy(false);
    }
  }, [
    plannerStudent,
    effectiveUser?.id,
    studentId,
    studentName,
    weekStartStr,
    weekEndStr,
    dayDates,
    goals,
    entries,
    institution?.name,
    institution?.logo,
  ]);

  const mobileDayDate = dayDates[Math.min(mobileDayIdx, Math.max(dayDates.length - 1, 0))] ?? weekStartStr;
  const mobileDayGoals = goalsByDayDate[mobileDayDate] ?? [];

  useEffect(() => {
    if (!showMobileDayView) return;
    const now = new Date();
    const isToday = mobileDayDate === format(now, 'yyyy-MM-dd');
    const fromClock = isToday ? Math.max(8 * 60, Math.min(22 * 60, now.getHours() * 60 + now.getMinutes())) : 9 * 60;
    const freeIdx = timeSlots.findIndex(
      (slot) =>
        slot.startMinutes >= fromClock &&
        entries.filter((e) => e.planner_date === mobileDayDate && entryMatchesPlannerSlot(e.start_time, slot))
          .length === 0
    );
    const fallbackIdx = timeSlots.findIndex(
      (slot) =>
        entries.filter((e) => e.planner_date === mobileDayDate && entryMatchesPlannerSlot(e.start_time, slot))
          .length === 0
    );
    setMobileCreateSlotIdx(freeIdx >= 0 ? freeIdx : Math.max(0, fallbackIdx));
  }, [mobileDayDate, showMobileDayView, entries, timeSlots]);

  const weekStats = useMemo(() => {
    let planned = 0;
    let done = 0;
    let minutes = 0;
    for (const e of entries) {
      if (e.planner_date < weekStartStr || e.planner_date > weekEndStr) continue;
      planned += Number(e.planned_quantity || 0);
      const linkedGoal = e.coach_goal_id ? goals.find((g) => g.id === e.coach_goal_id) : undefined;
      if (linkedGoal) {
        done += effectivePlannerEntryDone(linkedGoal, e, studentWeeklyEntries);
      } else {
        done += Math.min(Number(e.completed_quantity || 0), Number(e.planned_quantity || 0));
      }
      minutes += slotMinutes(e.start_time, e.end_time);
    }
    const pct = planned > 0 ? Math.round((done / planned) * 100) : 0;
    return { planned, done, minutes, pct };
  }, [entries, weekStartStr, weekEndStr, goals, studentWeeklyEntries]);

  const openCreate = (date: string, slot: PlannerTimeSlot) => {
    setSlotContext({ date, startTime: slot.start, endTime: slot.end });
    setFormStartTime(slot.start);
    setFormEndTime(slot.end);
    setActiveEntry(null);
    setModalMode('create');
    setFormGoalId(null);
    setFormTitle('');
    setFormSubject('');
    setFormPlannedQty(10);
  };

  const openEdit = (entry: WeeklyPlannerEntryRow) => {
    const start = String(entry.start_time || '09:00').slice(0, 5);
    const end = String(entry.end_time || addMinutesToTimeHhmm(start, gridSlotMinutes)).slice(0, 5);
    setSlotContext({ date: entry.planner_date, startTime: start, endTime: end });
    setFormStartTime(start);
    setFormEndTime(end);
    setActiveEntry(entry);
    setModalMode('edit');
    setFormGoalId(entry.coach_goal_id);
    setFormTitle(entry.title);
    setFormSubject(entry.subject);
    setFormPlannedQty(Number(entry.planned_quantity || 0));
  };

  const closeModal = () => {
    setModalMode('idle');
    setSlotContext(null);
    setActiveEntry(null);
  };

  const handleDropOnCell = async (payload: string, date: string, slot: PlannerTimeSlot) => {
    if (!canEditPlan) return;
    const nextStart = slot.start;
    const nextEnd = slot.end;

    if (payload.startsWith('goal:')) {
      await runPlannerMutation(async () => {
        const goalId = payload.slice('goal:'.length).trim();
        const g = goals.find((x) => x.id === goalId);
        if (!g) return;
        const { start: spanS, end: spanE } = goalEffectiveSpan(g, weekStartStr, weekEndStr);
        if (date < spanS || date > spanE) {
          alert(
            `Bu hedef yalnızca ${spanS} – ${spanE} aralığındaki günlere yerleştirilebilir. Tarih aralığını karttaki kalemle güncelleyebilirsiniz.`
          );
          return;
        }
        const agg = goalAggregates.find((a) => a.goal.id === goalId);
        const remaining = Math.max(0, agg?.remaining ?? 0);
        const chunk = Math.min(remaining, 50);
        if (chunk <= 0) {
          alert('Bu hedef için planlanabilir kota kalmadı.');
          return;
        }
        try {
          await createWeeklyPlannerEntry({
            student_id: studentId,
            planner_date: date,
            start_time: nextStart,
            end_time: nextEnd,
            title: g.title,
            subject: g.subject,
            planned_quantity: chunk,
            coach_goal_id: goalId,
            status: 'planned',
            completed_quantity: 0,
          });
          await reload();
        } catch (e) {
          alert(e instanceof Error ? e.message : 'Yerleştirilemedi (çakışma olabilir)');
        }
      });
      return;
    }

    await runPlannerMutation(async () => {
      try {
        await patchWeeklyPlannerEntry(payload, {
          planner_date: date,
          start_time: nextStart,
          end_time: nextEnd,
        });
        await reload();
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Taşınamadı (çakışma olabilir)');
      }
    });
  };

  const splitGoalAcrossPresetDays = async (goal: CoachWeeklyGoalRow) => {
    if (!canEditPlan) return;
    await runPlannerMutation(async () => {
      const agg = goalAggregates.find((a) => a.goal.id === goal.id);
      const remaining = agg?.remaining ?? 0;
      if (remaining <= 0) {
        alert('Bölünecek kota kalmadı.');
        return;
      }
      const maxParts = 4;
      const { start: gS, end: gE } = goalEffectiveSpan(goal, weekStartStr, weekEndStr);
      const slots = buildDistinctPlannerSlots(dayDates, gS, gE, maxParts, gridSlotMinutes);
      if (slots.length === 0) {
        alert('Takvimde boş zaman dilimi bulunamadı. Bazı blokları silip tekrar deneyin.');
        return;
      }
      const n = Math.min(maxParts, slots.length);
      const base = Math.floor(remaining / n);
      let extra = remaining % n;
      try {
        for (let i = 0; i < n; i++) {
          const q = base + (extra > 0 ? 1 : 0);
          if (extra > 0) extra -= 1;
          if (q <= 0) continue;
          const slot = slots[i];
          if (!slot) break;
          await createWeeklyPlannerEntry({
            student_id: studentId,
            planner_date: slot.date,
            start_time: slot.startTime,
            end_time: slot.endTime,
            title: goal.title,
            subject: goal.subject,
            planned_quantity: q,
            coach_goal_id: goal.id,
            status: 'planned',
            completed_quantity: 0,
          });
        }
        await reload();
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Bölünemedi');
      }
    });
  };

  const submitCreate = async () => {
    if (!slotContext || !studentId) return;
    await runPlannerMutation(async () => {
      const start = formStartTime.slice(0, 5);
      const end = formEndTime.slice(0, 5);
      if (!start || !end || (timeToMinutes(end) ?? 0) <= (timeToMinutes(start) ?? 0)) {
        alert('Bitiş saati başlangıçtan sonra olmalı.');
        return;
      }
      const g = goals.find((x) => x.id === formGoalId);
      if (
        !formGoalId &&
        modalTopicSelectOptions.length > 0 &&
        !formTitle.trim()
      ) {
        alert('Konu seçin.');
        return;
      }
      const title =
        formTitle.trim() ||
        (g ? `${g.title} (${g.quantity_unit})` : formSubject ? `${formSubject} çalışması` : 'Görev');
      const subject = (g?.subject || formSubject || 'Genel').trim() || 'Genel';
      if (formGoalId) {
        const available = modalGoalQuota.find((r) => r.goal.id === formGoalId)?.available ?? 0;
        const qty = Math.max(0, Math.round(Number(formPlannedQty)));
        if (qty <= 0) {
          alert('Planlanan miktar 0 olamaz.');
          return;
        }
        if (qty > available) {
          alert(`Bu hedef için en fazla ${available} ${g?.quantity_unit || 'birim'} planlayabilirsiniz.`);
          return;
        }
      }
      try {
        await createWeeklyPlannerEntry({
          student_id: studentId,
          planner_date: slotContext.date,
          start_time: start,
          end_time: end,
          title,
          subject,
          planned_quantity: Math.max(0, Math.round(Number(formPlannedQty))),
          coach_goal_id: formGoalId,
          status: 'planned',
          completed_quantity: 0,
        });
        closeModal();
        await reload();
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Kayıt eklenemedi');
      }
    });
  };

  const toggleComplete = async (entry: WeeklyPlannerEntryRow) => {
    if (!canEditPlan) return;
    const plannedN = Number(entry.planned_quantity || 0);
    const nextDone = entry.status === 'completed' ? false : true;
    if (nextDone && plannedN <= 0) {
      alert('Planlanan miktar 0 iken tamamlandı işaretlenemez. Önce hedefi girin.');
      return;
    }
    await runPlannerMutation(async () => {
      try {
        await patchWeeklyPlannerEntry(entry.id, {
          status: nextDone ? 'completed' : 'planned',
          ...(nextDone ? {} : { completed_quantity: 0 }),
        });
        if (nextDone) {
          const sub = entry.subject?.trim() || 'Genel';
          const top = entry.title?.trim() || sub;
          const sid = entry.student_id;
          const pool = classLevel != null ? getTopics(sub, classLevel) : [];
          const resolvedTop = resolveTopicLabelForTracking(top, pool);
          const already = isTopicMarkedCompleted(
            getStudentTopicProgress(sid),
            sid,
            sub,
            resolvedTop
          );
          if (!already && resolvedTop) {
            await markTopicCompleted(sid, sub, resolvedTop, entry.weekly_entry_id || entry.id);
          }
        }
        await reload();
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Güncellenemedi');
      }
    });
  };

  const saveEdit = async () => {
    if (!activeEntry) return;
    await runPlannerMutation(async () => {
      if (
        !formGoalId &&
        modalTopicSelectOptions.length > 0 &&
        !formTitle.trim()
      ) {
        alert('Konu seçin.');
        return;
      }
      const pq = Math.max(0, Math.round(Number(formPlannedQty)));
      if (formGoalId) {
        const g = goals.find((x) => x.id === formGoalId);
        const available = modalGoalQuota.find((r) => r.goal.id === formGoalId)?.available ?? 0;
        if (pq > available) {
          alert(`Bu hedef için en fazla ${available} ${g?.quantity_unit || 'birim'} planlayabilirsiniz.`);
          return;
        }
      }
      const patch: Record<string, unknown> = {
        title: formTitle,
        subject: formSubject,
        planned_quantity: pq,
        coach_goal_id: formGoalId,
      };
      const origStart = String(activeEntry.start_time || '').slice(0, 5);
      const origEnd = String(activeEntry.end_time || '').slice(0, 5);
      const nextStart = formStartTime.slice(0, 5);
      const nextEnd = formEndTime.slice(0, 5);
      if (nextStart !== origStart || nextEnd !== origEnd) {
        if ((timeToMinutes(nextEnd) ?? 0) <= (timeToMinutes(nextStart) ?? 0)) {
          alert('Bitiş saati başlangıçtan sonra olmalı.');
          return;
        }
        patch.start_time = nextStart;
        patch.end_time = nextEnd;
      }
      if (pq <= 0 && activeEntry.status === 'completed') {
        patch.status = 'planned';
        patch.completed_quantity = 0;
      }
      try {
        await patchWeeklyPlannerEntry(activeEntry.id, patch);
        closeModal();
        await reload();
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Güncellenemedi');
      }
    });
  };

  const removeEntry = async () => {
    if (!activeEntry) return;
    if (!confirm('Bu planı silmek istiyor musunuz?')) return;
    await runPlannerMutation(async () => {
      try {
        await deleteWeeklyPlannerEntry(activeEntry.id);
        closeModal();
        await reload();
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Silinemedi');
      }
    });
  };

  const addCoachGoal = async () => {
    if (!canManageGoals || !studentId) return;
    await runPlannerMutation(async () => {
      const subject = newGoalSubject.trim();
      const title = newGoalTitle.trim() || subject || 'Hedef';
      if (!subject) {
        alert('Ders seçin.');
        return;
      }
      if (newGoalTopicOptions.length > 0 && !newGoalTitle.trim()) {
        alert('Konu seçin.');
        return;
      }
      try {
        const gs = newGoalStart.trim() || weekStartStr;
        const ge = newGoalEnd.trim() || gs;
        await createCoachWeeklyGoal({
          student_id: studentId,
          subject,
          title,
          target_quantity: Math.max(0, newGoalQty),
          week_start_date: weekStartStr,
          quantity_unit: newGoalUnit.trim() || 'soru',
          goal_start_date: gs,
          goal_end_date: ge,
        });
        setNewGoalSubject('');
        setNewGoalTitle('');
        setNewGoalQty(100);
        setNewGoalStart(weekStartStr);
        setNewGoalEnd(weekEndStr);
        await reload();
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Hedef eklenemedi');
      }
    });
  };

  const removeGoal = async (goal: CoachWeeklyGoalRow) => {
    if (!canEditGoal(goal)) return;
    if (!confirm('Hedef kartını silmek istiyor musunuz?')) return;
    try {
      await deleteCoachWeeklyGoal(goal.id);
      if (goalDateEditId === goal.id) {
        setGoalDateEditId(null);
        setGoalDateEditStart('');
        setGoalDateEditEnd('');
      }
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Silinemedi');
    }
  };

  const openGoalDateEdit = (goal: CoachWeeklyGoalRow) => {
    if (!canEditGoal(goal)) return;
    setGoalDateEditId(goal.id);
    setGoalDateEditStart((goal.goal_start_date || weekStartStr).trim());
    setGoalDateEditEnd((goal.goal_end_date || weekEndStr).trim());
  };

  const cancelGoalDateEdit = () => {
    setGoalDateEditId(null);
    setGoalDateEditStart('');
    setGoalDateEditEnd('');
  };

  const saveGoalDateEdit = async () => {
    if (!goalDateEditId || !canManageGoals) return;
    const editingGoal = goals.find((g) => g.id === goalDateEditId);
    if (editingGoal && !canEditGoal(editingGoal)) return;
    setGoalDateSaving(true);
    try {
      const gs = goalDateEditStart.trim() || weekStartStr;
      const ge = goalDateEditEnd.trim() || gs;
      await patchCoachWeeklyGoal(goalDateEditId, {
        goal_start_date: gs,
        goal_end_date: ge,
      });
      cancelGoalDateEdit();
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Tarihler güncellenemedi');
    } finally {
      setGoalDateSaving(false);
    }
  };

  const shiftWeekStartStr = useCallback((ws: string, deltaWeeks: number) => {
    return format(addDays(parseISO(ws), 7 * deltaWeeks), 'yyyy-MM-dd');
  }, []);

  const moveGoalToAdjacentWeek = useCallback(
    async (goalId: string, deltaWeeks: -1 | 1) => {
      if (!canManageGoals) return;
      const goal = goals.find((g) => g.id === goalId);
      if (goal && !canEditGoal(goal)) return;
      const newWs = shiftWeekStartStr(weekStartStr, deltaWeeks);
      try {
        await patchCoachWeeklyGoal(goalId, { week_start_date: newWs });
        setAnchor(parseISO(`${newWs}T12:00:00`));
        // reload, güncellenmiş weekStartStr ile useEffect içinde tetiklenir
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Hedef haftaya taşınamadı');
      }
    },
    [canManageGoals, canEditGoal, goals, weekStartStr, shiftWeekStartStr]
  );

  const onWeekGoalDragOver = useCallback(
    (e: React.DragEvent, zone: -1 | 1) => {
      if (!canManageGoals) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setWeekDropHighlight(zone);
    },
    [canManageGoals]
  );

  const onWeekGoalDragLeave = useCallback((e: React.DragEvent) => {
    const rel = e.relatedTarget as Node | null;
    if (rel && e.currentTarget.contains(rel)) return;
    setWeekDropHighlight(0);
  }, []);

  const onWeekGoalDrop = useCallback(
    async (e: React.DragEvent, delta: -1 | 1) => {
      e.preventDefault();
      setWeekDropHighlight(0);
      if (!canManageGoals) return;
      const raw = e.dataTransfer.getData('text/plain');
      if (!raw.startsWith('goal:')) return;
      const gid = raw.slice('goal:'.length).trim();
      if (!gid) return;
      await moveGoalToAdjacentWeek(gid, delta);
    },
    [canManageGoals, moveGoalToAdjacentWeek]
  );

  const entriesByCellKey = useMemo(() => {
    const map = new Map<string, WeeklyPlannerEntryRow[]>();
    for (const e of entries) {
      const em = timeToMinutes(e.start_time);
      if (em == null) continue;
      const slot = timeSlots.find((s) => em >= s.startMinutes && em < s.endMinutes);
      if (!slot) continue;
      const key = `${e.planner_date}:${slot.start}`;
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [entries, timeSlots]);

  const openPlannerBlock = useCallback(
    (en: WeeklyPlannerEntryRow) => {
      if (!canEditPlan) return;
      if (studyLogOnClick && isEtutSubject(en.subject)) {
        setEtutPlannerEntry(en);
        return;
      }
      if (studyLogOnClick) setStudyModalEntry(en);
      else openEdit(en);
    },
    [canEditPlan, studyLogOnClick]
  );

  const cellEntries = useCallback(
    (date: string, slot: PlannerTimeSlot) => entriesByCellKey.get(`${date}:${slot.start}`) ?? [],
    [entriesByCellKey]
  );

  const pastSlot = (dateStr: string, slotStart: string) => {
    const iso = `${dateStr}T${slotStart}:00`;
    try {
      return isBefore(parseISO(iso), new Date());
    } catch {
      return false;
    }
  };

  const todayYmd = format(new Date(), 'yyyy-MM-dd');
  const columnMeta = dayDates.map((d, i) => ({
    isToday: d === todayYmd,
    isWeekend: i >= 5,
  }));

  const dayHeaderClass = (i: number) =>
    cn(
      'relative h-[52px] border-b px-2 flex flex-col items-center justify-center text-center transition-colors duration-300',
      columnMeta[i]?.isToday
        ? studentStudyLogUi
          ? 'border-indigo-300/90 bg-gradient-to-b from-indigo-100 via-violet-100 to-fuchsia-100/85 shadow-[inset_0_-3px_0_0_rgb(139,92,246,0.4)] ring-1 ring-indigo-200/50 dark:border-indigo-700 dark:from-indigo-950/55 dark:via-violet-950/45 dark:to-fuchsia-950/35 dark:ring-indigo-800/40'
          : 'border-indigo-200/90 bg-gradient-to-b from-indigo-50 via-indigo-50/80 to-violet-50/60 shadow-[inset_0_-2px_0_0_rgb(129,140,248,0.45)] dark:border-indigo-900/70 dark:from-indigo-950/50 dark:via-indigo-950/30 dark:to-slate-900'
        : columnMeta[i]?.isWeekend
          ? studentStudyLogUi
            ? 'border-orange-200/70 bg-gradient-to-br from-amber-50 via-orange-50/95 to-rose-50/80 dark:border-orange-900/45 dark:from-amber-950/35 dark:via-orange-950/25 dark:to-rose-950/20'
            : 'border-slate-200/80 bg-slate-50/90 dark:bg-slate-900/65 dark:border-slate-700/80'
          : studentStudyLogUi
            ? 'border-violet-100/90 bg-gradient-to-b from-white via-violet-50/40 to-indigo-50/25 dark:border-slate-700 dark:from-slate-900 dark:via-violet-950/15 dark:to-slate-900/95'
            : 'border-slate-200/80 bg-gradient-to-b from-white to-slate-50/80 dark:border-slate-700 dark:from-slate-900 dark:to-slate-900/95'
    );

  return (
    <div className={cn('space-y-4 sm:space-y-8', studentStudyLogUi && 'motion-safe:animate-in fade-in duration-500')}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch lg:justify-between">
        <div
          className={cn(
            'relative overflow-hidden rounded-2xl border p-5 lg:min-w-0 lg:flex-1 lg:p-6',
            studentStudyLogUi
              ? 'border-violet-200/90 bg-gradient-to-br from-violet-50 via-white to-amber-50/90 shadow-[0_16px_48px_-20px_rgb(139,92,246,0.35)] ring-1 ring-violet-100/80 dark:border-violet-900/50 dark:from-violet-950/40 dark:via-slate-900 dark:to-amber-950/25 dark:ring-violet-900/30'
              : 'border-slate-200/90 bg-white shadow-[0_12px_40px_-18px_rgb(15,23,42,0.25)] dark:border-slate-700 dark:bg-slate-900'
          )}
        >
          <div
            className={cn(
              'pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full blur-2xl',
              studentStudyLogUi
                ? 'bg-gradient-to-br from-fuchsia-400/20 via-violet-400/15 to-amber-300/20 dark:from-fuchsia-600/15 dark:via-violet-600/12 dark:to-amber-500/10'
                : 'bg-gradient-to-br from-indigo-400/12 to-violet-500/12 dark:from-indigo-500/8 dark:to-violet-600/10'
            )}
            aria-hidden
          />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-xl',
                    studentStudyLogUi
                      ? 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/25 dark:from-violet-600 dark:to-indigo-700'
                      : 'bg-indigo-100 dark:bg-indigo-950/80'
                  )}
                >
                  <BookOpen className={cn('h-[18px] w-[18px]', studentStudyLogUi && 'text-white')} />
                </span>
                <span className="text-xs font-bold uppercase tracking-widest opacity-90">
                  {studentStudyLogUi ? 'Senin haftan' : 'Takvim'}
                </span>
              </div>
              <h3 className="mt-2 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-2xl">
                {studentStudyLogUi ? 'Çalışma takvimin' : 'Haftalık çalışma planı'}
                {studentName ? (
                  <span className="mt-1 block text-sm font-medium text-slate-500 dark:text-slate-400 sm:mt-0 sm:inline sm:ml-2">
                    · {studentName}
                  </span>
                ) : null}
              </h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                <span className="inline-flex flex-wrap items-center gap-x-1 font-medium text-slate-800 dark:text-slate-200">
                  <span>{format(parseISO(weekStartStr), 'd MMMM', { locale: tr })}</span>
                  <span className="text-slate-400">—</span>
                  <span>{format(parseISO(weekEndStr), 'd MMMM yyyy', { locale: tr })}</span>
                </span>
              </p>
              {studentStudyLogUi ? (
                <p className="mt-2 max-w-md text-xs leading-relaxed text-violet-900/85 dark:text-violet-200/80">
                  Küçük adımlar büyük sonuçlar getirir — bugün için bir blok seç, tamamladıkça yeşile dönsün.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {canManageGoals ? (
                <div
                  role="region"
                  aria-label="Hedefi önceki haftaya taşı"
                  onDragOver={(e) => onWeekGoalDragOver(e, -1)}
                  onDragLeave={onWeekGoalDragLeave}
                  onDrop={(e) => void onWeekGoalDrop(e, -1)}
                  className={cn(
                    'flex min-h-[42px] min-w-[7.5rem] select-none items-center justify-center rounded-xl border border-dashed px-2.5 py-2 text-center text-[10px] font-semibold leading-tight transition-all sm:min-w-[8.75rem] sm:text-[11px]',
                    weekDropHighlight === -1
                      ? 'border-amber-500 bg-amber-100 text-amber-950 shadow-md ring-2 ring-amber-400/30'
                      : 'border-slate-200/90 text-slate-500 hover:border-amber-300/80 hover:bg-amber-50/70 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-amber-950/20'
                  )}
                >
                  ← Önceki haftaya bırak
                </div>
              ) : null}
              <div
                className={cn(
                  'relative z-10 flex items-center gap-1 rounded-xl border p-1 shadow-inner',
                  studentStudyLogUi
                    ? 'border-violet-200/80 bg-white/90 backdrop-blur-sm dark:border-violet-800/60 dark:bg-violet-950/40'
                    : 'border-slate-200/90 bg-slate-50/80 dark:border-slate-600 dark:bg-slate-800/50'
                )}
              >
                <IconTapButton
                  onClick={() => setAnchor((a) => addDays(a, -7))}
                  className={cn(
                    studentStudyLogUi
                      ? 'text-violet-700 hover:bg-violet-100/90 dark:text-violet-300 dark:hover:bg-violet-900/50'
                      : 'text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white'
                  )}
                  aria-label="Önceki hafta"
                >
                  <ChevronLeft className="h-5 w-5" />
                </IconTapButton>
                <button
                  type="button"
                  onClick={() => setAnchor(new Date())}
                  className={cn(
                    'min-h-[44px] touch-manipulation rounded-lg px-3 py-2 text-xs font-semibold transition hover:shadow-sm',
                    studentStudyLogUi
                      ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/25 hover:from-violet-500 hover:to-indigo-500 dark:shadow-none'
                      : 'text-slate-700 hover:bg-white dark:text-slate-200 dark:hover:bg-slate-700'
                  )}
                >
                  Bu hafta
                </button>
                <IconTapButton
                  onClick={() => setAnchor((a) => addDays(a, 7))}
                  className={cn(
                    studentStudyLogUi
                      ? 'text-violet-700 hover:bg-violet-100/90 dark:text-violet-300 dark:hover:bg-violet-900/50'
                      : 'text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white'
                  )}
                  aria-label="Sonraki hafta"
                >
                  <ChevronRight className="h-5 w-5" />
                </IconTapButton>
              </div>
              {canManageGoals ? (
                <div
                  role="region"
                  aria-label="Hedefi sonraki haftaya taşı"
                  onDragOver={(e) => onWeekGoalDragOver(e, 1)}
                  onDragLeave={onWeekGoalDragLeave}
                  onDrop={(e) => void onWeekGoalDrop(e, 1)}
                  className={cn(
                    'flex min-h-[42px] min-w-[7.5rem] select-none items-center justify-center rounded-xl border border-dashed px-2.5 py-2 text-center text-[10px] font-semibold leading-tight transition-all sm:min-w-[8.75rem] sm:text-[11px]',
                    weekDropHighlight === 1
                      ? 'border-amber-500 bg-amber-100 text-amber-950 shadow-md ring-2 ring-amber-400/30'
                      : 'border-slate-200/90 text-slate-500 hover:border-amber-300/80 hover:bg-amber-50/70 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-amber-950/20'
                  )}
                >
                  Sonraki haftaya bırak →
                </div>
              ) : null}
              {canEditPlan ? (
                <label className="inline-flex min-h-[42px] flex-col justify-center gap-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                  Takvim dilimi
                  <select
                    value={gridSlotMinutes}
                    onChange={(e) => {
                      const v = Number(e.target.value) as PlannerGridStepMinutes;
                      setGridSlotMinutes(v);
                      savePlannerGridStepMinutes(v);
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                    title="Haftalık takvimde görünen saat aralığı"
                  >
                    <option value={60}>1 saat</option>
                    <option value={30}>30 dk</option>
                    <option value={15}>15 dk</option>
                    <option value={10}>10 dk</option>
                  </select>
                </label>
              ) : null}
              {canExportPdf ? (
                <button
                  type="button"
                  disabled={pdfBusy}
                  onClick={() => void exportPlannerPdf()}
                  className={cn(
                    'inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:opacity-50',
                    studentStudyLogUi
                      ? 'border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'
                  )}
                >
                  {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                  PDF indir
                </button>
              ) : null}
              {showCoachParentShare ? (
                <>
                  <button
                    type="button"
                    disabled={parentShareBusy || parentPdfShareBusy}
                    onClick={() => void shareWeeklyGoalsWithParent()}
                    className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
                  >
                    {parentShareBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MessageCircle className="h-4 w-4" />
                    )}
                    Veliye metin gönder
                  </button>
                  <button
                    type="button"
                    disabled={parentPdfShareBusy || parentShareBusy || pdfBusy}
                    onClick={() => void shareWeeklyPdfWithParent()}
                    className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-900 transition hover:bg-teal-100 disabled:opacity-50 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-100"
                  >
                    {parentPdfShareBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileDown className="h-4 w-4" />
                    )}
                    Veliye PDF gönder
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {showCoachParentShare && parentShareNotice ? (
        <div
          role="status"
          className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 whitespace-pre-wrap"
        >
          {parentShareNotice}
          {parentShareWaUrl ? (
            <p className="mt-2">
              <a
                href={parentShareWaUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium underline text-emerald-800"
              >
                WhatsApp bağlantısını aç
              </a>
            </p>
          ) : null}
        </div>
      ) : null}

      {err ? (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {err}
        </div>
      ) : null}

      {/* Özet */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
        <div className="group relative overflow-hidden rounded-2xl border border-emerald-100/90 bg-gradient-to-br from-emerald-50/95 via-white to-teal-50/50 p-5 shadow-sm transition hover:shadow-md dark:border-emerald-900/40 dark:from-emerald-950/35 dark:via-slate-900 dark:to-slate-900">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-400/10 blur-2xl transition group-hover:bg-emerald-400/20" aria-hidden />
          <div className="relative flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 shadow-sm dark:bg-emerald-950/80 dark:text-emerald-300">
              <Target className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700/90 dark:text-emerald-400/90">
                Haftalık tamamlanma
              </p>
              <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {weekStats.pct}%
              </p>
              <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                {weekStats.done} / {weekStats.planned} birim
              </p>
            </div>
          </div>
        </div>
        <div className="group relative overflow-hidden rounded-2xl border border-indigo-100/90 bg-gradient-to-br from-indigo-50/90 via-white to-violet-50/40 p-5 shadow-sm transition hover:shadow-md dark:border-indigo-900/40 dark:from-indigo-950/30 dark:via-slate-900 dark:to-slate-900">
          <div className="absolute -bottom-8 -right-4 h-28 w-28 rounded-full bg-violet-400/10 blur-2xl" aria-hidden />
          <div className="relative flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 shadow-sm dark:bg-indigo-950/80 dark:text-indigo-300">
              <Clock className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700/90 dark:text-indigo-400/90">
                Planlanan süre
              </p>
              <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
                {weekStats.minutes}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-400">dakika</p>
            </div>
          </div>
        </div>
        <DailyScreenTimeChart
          weekStartStr={weekStartStr}
          byDate={screenTimeByDate}
          loading={screenTimeLoading || loading}
        />
      </div>

      {/* Koç hedefleri */}
      {canManageGoals && (
        <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/50 p-4 space-y-3">
          <p className="text-sm font-medium text-amber-900">
            {studentStudyLogUi || selfCoachingMode
              ? 'Bu hafta için hedef ekle'
              : 'Koç — bu hafta için hedef ekle'}
          </p>
          <p className="text-xs text-amber-800/90 leading-relaxed max-w-2xl">
            {studentStudyLogUi || selfCoachingMode
              ? 'Ders ve konu seçerek haftalık hedefini oluştur; kartı takvime sürükleyerek plana yerleştir. Tamamladıkça ilerlemen otomatik güncellenir.'
              : 'Başlangıç ve bitişi istediğiniz takvim günleri olarak seçebilirsiniz (ör. Cumartesi–gelecek hafta Cuma). Takvimde üst şeritte hangi günlerin bu hedefe dahil olduğu işaretlenir; plan bloklarını yalnızca bu aralıktaki günlere sürükleyebilirsiniz.'}
          </p>
          {plannerStudent && classLevel !== undefined && classLevel !== null ? (
            <p className="text-[11px] text-amber-950/80">
              Öğrenci sınıfı:{' '}
              <span className="font-semibold">{formatClassLevelLabel(classLevel)}</span> — ders ve konular konu
              havuzundan gelir.
            </p>
          ) : (
            <p className="text-[11px] text-amber-900">
              Öğrenci kartı veya sınıf bilgisi bulunamadı; havuz listesi kullanılamıyor.
            </p>
          )}
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-xs text-slate-600 block mb-1">Ders</label>
              <select
                value={newGoalSubject}
                onChange={(e) => {
                  const sub = e.target.value;
                  setNewGoalSubject(sub);
                  setNewGoalTitle('');
                  if (sub) setNewGoalUnit(defaultGoalUnitForSubject(sub));
                }}
                className="px-3 py-2 border rounded-lg text-sm min-w-[180px] max-w-[260px] bg-white dark:bg-slate-900"
              >
                <option value="">Ders seçin</option>
                {poolSubjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-600 block mb-1">Konu</label>
              <select
                value={newGoalTitle}
                onChange={(e) => setNewGoalTitle(e.target.value)}
                disabled={!newGoalSubject || newGoalTopicOptions.length === 0}
                className="px-3 py-2 border rounded-lg text-sm min-w-[200px] max-w-[280px] bg-white dark:bg-slate-900 disabled:opacity-60"
              >
                <option value="">
                  {newGoalTopicOptions.length === 0 && newGoalSubject
                    ? 'Bu ders için konu yok'
                    : 'Konu seçin'}
                </option>
                {newGoalTopicOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-600 block mb-1">Miktar</label>
              <input
                type="number"
                min={0}
                value={newGoalQty}
                onChange={(e) => setNewGoalQty(Number(e.target.value))}
                className="px-3 py-2 border rounded-lg text-sm w-24"
              />
            </div>
            <div>
              <label className="text-xs text-slate-600 block mb-1">Birim</label>
              <select
                value={newGoalUnit}
                onChange={(e) => setNewGoalUnit(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm"
              >
                {COACH_GOAL_QUANTITY_UNITS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-600 block mb-1">Başlangıç</label>
              <input
                type="date"
                value={newGoalStart}
                onChange={(e) => {
                  const v = e.target.value;
                  setNewGoalStart(v);
                  if (v && newGoalEnd && newGoalEnd < v) setNewGoalEnd(v);
                }}
                className="px-3 py-2 border rounded-lg text-sm w-[148px]"
              />
            </div>
            <div>
              <label className="text-xs text-slate-600 block mb-1">Bitiş</label>
              <input
                type="date"
                value={newGoalEnd}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v && newGoalStart && v < newGoalStart) {
                    setNewGoalEnd(newGoalStart);
                  } else {
                    setNewGoalEnd(v);
                  }
                }}
                className="px-3 py-2 border rounded-lg text-sm w-[148px]"
              />
            </div>
            <button
              type="button"
              disabled={plannerUiBusy}
              onClick={() => void addCoachGoal()}
              className="inline-flex items-center gap-1 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Hedefi kaydet
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* Takvim */}
        <div
          className={cn(
            'overflow-hidden rounded-2xl border bg-white dark:bg-slate-900',
            vibrantMobileChrome
              ? 'border-violet-200/90 shadow-[0_24px_56px_-28px_rgb(139,92,246,0.38)] ring-2 ring-violet-100/70 dark:border-violet-900/55 dark:shadow-[0_20px_50px_-24px_rgb(0,0,0,0.5)] dark:ring-violet-900/40'
              : 'border-slate-200/95 shadow-[0_20px_50px_-24px_rgb(15,23,42,0.18)] ring-1 ring-slate-100/90 dark:border-slate-700 dark:shadow-none dark:ring-slate-800/80'
          )}
        >
          <div
            className={cn(
              'flex flex-col gap-2 border-b px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between',
              vibrantMobileChrome
                ? 'border-violet-100/90 bg-gradient-to-r from-violet-100/90 via-fuchsia-50/80 to-amber-50/70 dark:border-violet-900/50 dark:from-violet-950/45 dark:via-fuchsia-950/25 dark:to-amber-950/20'
                : 'border-slate-100 bg-gradient-to-r from-indigo-50/85 via-white to-violet-50/40 dark:border-slate-800 dark:from-indigo-950/30 dark:via-slate-900 dark:to-violet-950/20'
            )}
          >
            <span className="flex items-start gap-2.5 text-xs font-medium leading-relaxed text-slate-700 dark:text-slate-300">
              <span
                className={cn(
                  'mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full',
                  studentStudyLogUi
                    ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-[0_0_14px_rgb(167,139,250,0.55)]'
                    : 'bg-emerald-500 shadow-[0_0_12px_rgb(52,211,153,0.45)] dark:shadow-emerald-500/30'
                )}
                aria-hidden
              />
              {loading
                ? 'Yükleniyor…'
                : studentStudyLogUi
                  ? showMobileDayView
                    ? 'Gün seç · Göreve dokun → çalışma kaydı'
                    : 'Bloka tıkla → çalışma kaydı ve “Konuyu bitirdim” ile Konu Takibi güncellenir'
                  : 'Blokları sürükleyerek taşı · Boş saate tıklayarak yeni görev ekle'}
            </span>
          </div>
          <div
            className={cn(
              showMobileDayView ? '' : 'overflow-x-auto',
              vibrantMobileChrome
                ? 'bg-gradient-to-b from-violet-50/50 via-white to-amber-50/30 dark:from-slate-950 dark:via-slate-950 dark:to-violet-950/20'
                : 'bg-slate-50/40 dark:bg-slate-950/40'
            )}
          >
            {showMobileDayView ? (
              <div className="space-y-3 p-3 sm:p-4">
                <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                  {dayDates.map((date, i) => (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setMobileDayIdx(i)}
                      className={cn(
                        'min-w-[3.1rem] shrink-0 rounded-xl border px-2 py-2 text-center transition',
                        mobileDayIdx === i
                          ? 'border-indigo-600 bg-indigo-600 text-white shadow-md'
                          : 'border-slate-200 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200',
                        columnMeta[i]?.isToday && mobileDayIdx !== i && 'ring-2 ring-indigo-300/80'
                      )}
                    >
                      <div className="text-[9px] font-bold uppercase tracking-wide opacity-90">
                        {DAY_LABELS[i].slice(0, 3)}
                      </div>
                      <div className="text-base font-bold tabular-nums leading-none">
                        {format(parseISO(date), 'd', { locale: tr })}
                      </div>
                    </button>
                  ))}
                </div>

                {mobileDayGoals.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {mobileDayGoals.map((g) => {
                      const st = subjectPlannerStyle(g.subject, g.quantity_unit);
                      return (
                        <span
                          key={g.id}
                          className={cn(
                            'rounded-lg px-2 py-1 text-[10px] font-semibold shadow-sm ring-1 ring-slate-900/5',
                            st.chip
                          )}
                        >
                          {g.subject}: {g.title}
                        </span>
                      );
                    })}
                  </div>
                ) : null}

                <ul className="space-y-1.5">
                  {timeSlots.map((slot, slotIdx) => {
                    const slotList = cellEntries(mobileDayDate, slot);
                    const isPast = pastSlot(mobileDayDate, slot.start);
                    return (
                      <li key={`${slot.start}-${slot.end}`} className="flex gap-2">
                        <div
                          className={cn(
                            'w-[3.75rem] shrink-0 pt-2.5 text-right font-mono text-[10px] font-semibold tabular-nums leading-tight',
                            isPast ? 'text-slate-400' : 'text-slate-600 dark:text-slate-400'
                          )}
                        >
                          {slot.label}
                        </div>
                        <div className="min-w-0 flex-1 space-y-1.5">
                          {slotList.length === 0 ? (
                            canEditPlan ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setMobileCreateSlotIdx(slotIdx);
                                  openCreate(mobileDayDate, slot);
                                }}
                                className={cn(
                                  'flex w-full items-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-left text-xs touch-manipulation active:scale-[0.99]',
                                  mobileCreateSlotIdx === slotIdx
                                    ? 'border-violet-400 bg-violet-50 text-violet-900 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-100'
                                    : 'border-slate-200 bg-white/70 text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400'
                                )}
                              >
                                <Plus className="h-3.5 w-3.5 shrink-0" />
                                Bu saate görev ekle
                              </button>
                            ) : (
                              <div className="rounded-xl border border-dashed border-slate-200/80 px-3 py-2.5 text-xs text-slate-400 dark:border-slate-700">
                                Boş
                              </div>
                            )
                          ) : (
                            slotList.map((en) => {
                              const linkedGoal = goals.find((g) => g.id === en.coach_goal_id);
                              const st = subjectPlannerStyle(en.subject, linkedGoal?.quantity_unit);
                              const plannedN = Number(en.planned_quantity || 0);
                              const doneQty = linkedGoal
                                ? effectivePlannerEntryDone(linkedGoal, en, studentWeeklyEntries)
                                : Math.min(
                                    Number(en.completed_quantity || 0),
                                    plannedN > 0 ? plannedN : Number(en.completed_quantity || 0)
                                  );
                              const isRealized = doneQty > 0;
                              const miss = isPast && !isRealized && en.status === 'planned';
                              const borderCls = isRealized
                                ? 'border-emerald-500 ring-1 ring-emerald-200 bg-emerald-50/95 dark:bg-emerald-950/45'
                                : plannedN > 0
                                  ? 'border-orange-500 ring-1 ring-orange-200 bg-orange-50/95 dark:bg-orange-950/35'
                                  : miss
                                    ? 'border-red-400 ring-1 ring-red-100'
                                    : 'border-slate-200';
                              return (
                                <button
                                  key={en.id}
                                  type="button"
                                  disabled={!canEditPlan}
                                  onClick={() => {
                                    if (!canEditPlan) return;
                                    openPlannerBlock(en);
                                  }}
                                  className={cn(
                                    'w-full rounded-xl border px-3 py-3 text-left shadow-sm transition active:scale-[0.99]',
                                    st.chip,
                                    borderCls,
                                    canEditPlan ? 'touch-manipulation' : 'opacity-80'
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                                        {en.title}
                                      </p>
                                      <p className="mt-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                                        {en.subject}
                                      </p>
                                    </div>
                                    <span className="shrink-0 rounded-lg bg-white/70 px-2 py-1 text-[10px] font-bold tabular-nums text-slate-700 dark:bg-slate-950/40 dark:text-slate-200">
                                      {doneQty}/{plannedN || '–'}
                                    </span>
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {canEditPlan ? (
                  <div className="sticky bottom-0 z-10 space-y-2 rounded-xl border border-violet-200/90 bg-white/95 p-3 shadow-lg backdrop-blur-sm dark:border-violet-800/60 dark:bg-slate-900/95">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Yeni görev — saat seç</p>
                    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
                      {timeSlots.map((slot, slotIdx) => {
                        const taken = cellEntries(mobileDayDate, slot).length > 0;
                        return (
                          <button
                            key={`${slot.start}-${slot.end}`}
                            type="button"
                            onClick={() => setMobileCreateSlotIdx(slotIdx)}
                            className={cn(
                              'min-w-[3.4rem] shrink-0 rounded-lg border px-2 py-2 text-center font-mono text-[10px] font-bold tabular-nums touch-manipulation',
                              mobileCreateSlotIdx === slotIdx
                                ? 'border-violet-600 bg-violet-600 text-white shadow-md'
                                : taken
                                  ? 'border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500'
                                  : 'border-slate-200 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200'
                            )}
                          >
                            {slot.start.slice(0, 5)}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const slot = timeSlots[mobileCreateSlotIdx] ?? timeSlots[0];
                        if (slot) openCreate(mobileDayDate, slot);
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3.5 text-sm font-semibold text-white touch-manipulation active:bg-violet-700"
                    >
                      <Plus className="h-4 w-4" />
                      {(timeSlots[mobileCreateSlotIdx] ?? timeSlots[0])?.label ?? ''} — Görev ekle
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
            <div className="min-w-[760px] p-3 sm:p-4">
              <div
                className={cn(
                  'grid overflow-hidden rounded-xl border shadow-inner',
                  studentStudyLogUi
                    ? 'border-violet-100/90 bg-white/95 ring-1 ring-violet-100/60 dark:border-violet-900/40 dark:bg-slate-900/95 dark:ring-violet-900/25'
                    : 'border-slate-200/90 bg-white dark:border-slate-700 dark:bg-slate-900'
                )}
                style={{ gridTemplateColumns: `64px repeat(7, minmax(92px,1fr))` }}
              >
                <div className="sticky left-0 z-20 h-[52px] border-b border-r border-slate-200/95 bg-gradient-to-br from-slate-100 via-slate-50 to-white dark:border-slate-700 dark:from-slate-800 dark:via-slate-900 dark:to-slate-900" />
                {DAY_LABELS.map((d, i) => (
                  <div key={d} className={dayHeaderClass(i)}>
                    {columnMeta[i]?.isToday ? (
                      <span className="absolute top-1.5 right-1.5 hidden rounded-full bg-indigo-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-md sm:inline-flex dark:bg-indigo-500">
                        Bugün
                      </span>
                    ) : null}
                    <span className="hidden text-[13px] font-bold text-slate-800 dark:text-slate-100 sm:inline">{d}</span>
                    <span className="text-[12px] font-bold text-slate-800 dark:text-slate-100 sm:hidden">{d.slice(0, 3)}</span>
                    <span className="mt-0.5 inline-flex items-center rounded-md bg-white/85 px-1.5 py-0 text-[11px] font-semibold tabular-nums text-slate-600 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-800/90 dark:text-slate-400 dark:ring-slate-600/80">
                      {format(parseISO(dayDates[i]), 'd MMM', { locale: tr })}
                    </span>
                  </div>
                ))}

                <div className="sticky left-0 z-10 border-r border-b border-slate-200/90 bg-gradient-to-br from-amber-50 to-amber-100/70 px-2 py-2 text-[10px] font-bold uppercase leading-tight tracking-wide text-amber-900 dark:border-slate-700 dark:from-amber-950/50 dark:to-amber-950/25 dark:text-amber-200/95">
                  Hedef süresi
                </div>
                {dayDates.map((date, colIdx) => {
                  const dayGoals = goalsByDayDate[date] ?? [];
                  return (
                    <div
                      key={`goal-span-${date}`}
                      className={cn(
                        'border-b border-slate-200/90 px-1 py-1.5 min-h-[34px] flex flex-col gap-1',
                        columnMeta[colIdx]?.isToday
                          ? 'bg-indigo-50/45 dark:bg-indigo-950/25'
                          : columnMeta[colIdx]?.isWeekend
                            ? 'bg-slate-50/95 dark:bg-slate-900/75'
                            : 'bg-gradient-to-b from-amber-50/40 to-transparent dark:from-amber-950/20'
                      )}
                    >
                      {dayGoals.slice(0, 3).map((g) => {
                        const st = subjectPlannerStyle(g.subject, g.quantity_unit);
                        const sp = goalEffectiveSpan(g, weekStartStr, weekEndStr);
                        return (
                          <div
                            key={g.id}
                            title={`${g.title} (${sp.start} → ${sp.end})`}
                            className={cn(
                              'truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-tight shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10',
                              st.chip
                            )}
                          >
                            {g.subject}
                          </div>
                        );
                      })}
                      {dayGoals.length > 3 ? (
                        <span className="pl-0.5 text-[9px] font-bold text-amber-900/85 dark:text-amber-400/95">
                          +{dayGoals.length - 3} hedef
                        </span>
                      ) : null}
                    </div>
                  );
                })}

                {timeSlots.map((slot) => (
                  <React.Fragment key={`${slot.start}-${slot.end}`}>
                    <div className="sticky left-0 z-10 border-r border-b border-slate-100 bg-slate-50/98 py-1.5 pr-2 text-right text-[10px] font-medium tabular-nums tracking-tight text-slate-500 dark:border-slate-800 dark:bg-slate-900/98 dark:text-slate-400">
                      <span className="font-mono">{slot.label}</span>
                    </div>
                    {dayDates.map((date, colIdx) => {
                      const list = cellEntries(date, slot);
                      const isPast = pastSlot(date, slot.start);
                      return (
                        <div
                          key={`${date}-${slot.start}`}
                          style={{ minHeight: gridRowMinH }}
                          className={cn(
                            'border-b border-slate-100 p-1 relative transition-[background-color,box-shadow] duration-150 dark:border-slate-800/85',
                            columnMeta[colIdx]?.isToday
                              ? isPast
                                ? 'bg-indigo-50/35 dark:bg-indigo-950/18'
                                : 'bg-[linear-gradient(180deg,rgb(238,242,255,0.5)_0%,transparent_85%)] dark:bg-indigo-950/12'
                              : columnMeta[colIdx]?.isWeekend
                                ? isPast
                                  ? 'bg-slate-100/75 dark:bg-slate-900/72'
                                  : 'bg-slate-50/50 dark:bg-slate-900/45'
                                : isPast
                                  ? 'bg-slate-50/85 dark:bg-slate-950/82'
                                  : 'bg-white dark:bg-slate-950',
                            canEditPlan &&
                              (studentStudyLogUi
                                ? 'hover:bg-gradient-to-br hover:from-violet-50 hover:to-fuchsia-50/80 hover:shadow-[inset_0_0_0_2px_rgb(167,139,250,0.45)] cursor-pointer dark:hover:from-violet-950/40 dark:hover:to-fuchsia-950/25 dark:hover:shadow-[inset_0_0_0_1px_rgb(139,92,246,0.35)]'
                                : 'hover:bg-violet-50/60 hover:shadow-[inset_0_0_0_1px_rgb(167,139,250,0.35)] cursor-pointer dark:hover:bg-violet-950/35 dark:hover:shadow-[inset_0_0_0_1px_rgb(139,92,246,0.25)]')
                          )}
                          onClick={() => {
                            if (!canEditPlan) return;
                            if (list.length === 0) openCreate(date, slot);
                          }}
                          onDragOver={(e) => {
                            if (!canEditPlan) return;
                            e.preventDefault();
                          }}
                          onDrop={(e) => {
                            if (!canEditPlan) return;
                            e.preventDefault();
                            const id = e.dataTransfer.getData('text/plain');
                            if (id) void handleDropOnCell(id, date, slot);
                          }}
                        >
                          {list.map((en) => {
                            const linkedGoal = goals.find((g) => g.id === en.coach_goal_id);
                            const st = subjectPlannerStyle(en.subject, linkedGoal?.quantity_unit);
                            const plannedN = Number(en.planned_quantity || 0);
                            const doneQty = linkedGoal
                              ? effectivePlannerEntryDone(linkedGoal, en, studentWeeklyEntries)
                              : Math.min(
                                  Number(en.completed_quantity || 0),
                                  plannedN > 0 ? plannedN : Number(en.completed_quantity || 0)
                                );
                            const isRealized = doneQty > 0;
                            const hasPlan = plannedN > 0;
                            const miss = isPast && !isRealized && en.status === 'planned';
                            const borderCls = isRealized
                              ? 'border-emerald-500 ring-1 ring-emerald-200 bg-emerald-50/95 dark:bg-emerald-950/45 dark:ring-emerald-900/50'
                              : hasPlan
                                ? 'border-orange-500 ring-1 ring-orange-200 bg-orange-50/95 dark:bg-orange-950/35 dark:ring-orange-900/45'
                                : miss
                                  ? 'border-red-400 ring-1 ring-red-100 dark:ring-red-900/35'
                                  : st.chip.replace('bg-', 'border-').split(' ')[1] || 'border-slate-300';
                            return (
                              <div
                                key={en.id}
                                draggable={canEditPlan}
                                onDragStart={(e) => {
                                  e.stopPropagation();
                                  e.dataTransfer.setData('text/plain', en.id);
                                  e.dataTransfer.effectAllowed = 'move';
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!canEditPlan) return;
                                  openPlannerBlock(en);
                                }}
                                className={cn(
                                  'text-[11px] leading-snug rounded-lg px-2 py-1.5 mb-1 border shadow-sm backdrop-blur-[1px] transition hover:brightness-[1.03] dark:hover:brightness-110',
                                  st.chip,
                                  borderCls,
                                  canEditPlan ? 'cursor-grab active:cursor-grabbing' : ''
                                )}
                              >
                                <div className="flex items-start gap-1">
                                  {canEditPlan ? <GripVertical className="w-3.5 h-3.5 text-slate-400/90 flex-shrink-0 mt-0.5" /> : null}
                                  <div className="min-w-0 flex-1">
                                    <div className="font-bold truncate text-slate-900/95 dark:text-slate-100">{en.title}</div>
                                    <div className="mt-0.5 text-[10px] font-medium opacity-85">
                                      {plannedN} plan · {doneQty} yap
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
            )}
          </div>
        </div>

        {/* Hedef özet */}
        <div className="space-y-3 xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-2xl border border-slate-200/95 bg-white/95 p-5 shadow-[0_16px_40px_-28px_rgb(15,23,42,0.35)] backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">{goalsSectionTitle}</h4>
            <p className="mb-2 hidden flex-wrap gap-2 text-[10px] text-slate-500 dark:text-slate-400 sm:flex">
              <span className="inline-flex items-center gap-1 rounded-md border border-orange-300 bg-orange-50 px-1.5 py-0.5 text-orange-900 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200">
                Turuncu: planlandı
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                Yeşil: yapıldı
              </span>
            </p>
            <p className="mb-3 hidden text-[11px] text-slate-500 dark:text-slate-400 sm:block">
              Kartı takvim hücresine sürükleyerek plana yerleştirin (yalnızca hedefin başlangıç–bitiş
              günleri) · Üstteki &quot;Önceki / Sonraki haftaya bırak&quot; ile hedefi ve plan bloklarını
              kaydırın · Tarih aralığını karttaki kalemle istediğiniz günler olarak düzenleyin · Kalan kotayı
              hedef süresindeki günlere bölebilirsiniz
            </p>
            {goalAggregates.length === 0 ? (
              <p className="text-xs text-slate-500">
                {canManageGoals
                  ? selfCoachingMode
                    ? 'Henüz hedef yok. Yukarıdan haftalık hedeflerini ekleyebilir veya takvime manuel görev yerleştirebilirsin.'
                    : studentStudyLogUi && hasAssignedCoach
                      ? 'Koçun henüz hedef tanımlamadı. Yukarıdan kendi hedeflerini ekleyebilir veya takvime manuel görev yerleştirebilirsin.'
                      : 'Henüz hedef yok. Yukarıdan ekleyin veya öğrenci manuel görev yerleştirsin.'
                  : 'Koçunuz hedef tanımladığında burada görünür.'}
              </p>
            ) : (
              <ul className="space-y-3 text-xs">
                {goalAggregates.map(({ goal, plannedSum, completedSum, target, remaining, over }) => {
                  const pct = target > 0 ? Math.min(100, Math.round((plannedSum / target) * 100)) : 0;
                  const donePct = target > 0 ? Math.min(100, Math.round((completedSum / target) * 100)) : 0;
                  const { start, end } = goalEffectiveSpan(goal, weekStartStr, weekEndStr);
                  const cardTone =
                    completedSum > 0
                      ? 'border-emerald-200/90 bg-gradient-to-br from-emerald-50/90 to-white dark:border-emerald-900/50 dark:from-emerald-950/35 dark:to-slate-950'
                      : plannedSum > 0
                        ? 'border-orange-200/90 bg-gradient-to-br from-orange-50/90 to-white dark:border-orange-900/45 dark:from-orange-950/30 dark:to-slate-950'
                        : 'border-slate-100 dark:border-slate-700 bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-950';
                  return (
                    <li
                      key={goal.id}
                      draggable={canEditPlan}
                      onDragStart={(e) => {
                        if (!canEditPlan) return;
                        e.dataTransfer.setData('text/plain', `goal:${goal.id}`);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      className={`rounded-xl border p-3 shadow-sm ${cardTone} ${
                        canEditPlan ? 'cursor-grab active:cursor-grabbing' : ''
                      }`}
                    >
                      <div className="flex justify-between gap-2 items-start">
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
                            {goal.subject}
                          </p>
                          <span className="font-semibold text-slate-800 dark:text-slate-100 leading-snug block truncate">
                            {goal.title}
                          </span>
                        </div>
                        {canEditGoal(goal) ? (
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                goalDateEditId === goal.id ? cancelGoalDateEdit() : openGoalDateEdit(goal)
                              }
                              className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="Hedef tarih aralığını düzenle"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeGoal(goal)}
                              className="text-red-500 hover:text-red-700 p-1"
                              title="Hedefi sil"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : goal.coach_id ? (
                          <span className="text-[10px] text-slate-400 flex-shrink-0">Koç hedefi</span>
                        ) : null}
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden relative">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-orange-400 to-amber-400 transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300"
                          style={{ width: `${donePct}%` }}
                        />
                      </div>
                      <div className="mt-2 text-slate-600 dark:text-slate-300 space-y-0.5">
                        <div>
                          {target} {goal.quantity_unit} · Planlanan {plannedSum} · Yapılan {completedSum}
                        </div>
                        <div className="font-medium text-slate-800 dark:text-slate-100">
                          Kalan kota: {over ? `0 (aşım ${plannedSum - target})` : remaining}
                        </div>
                        <div className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50/90 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800/80">
                          <CalendarRange className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Hedef süresi
                            </p>
                            <p className="text-[12px] font-medium text-slate-800 dark:text-slate-100 leading-snug">
                              {formatGoalRangeLabel(start, end)}
                            </p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 font-mono">
                              {start} — {end}
                            </p>
                          </div>
                        </div>
                        {canEditGoal(goal) && goalDateEditId === goal.id ? (
                          <div className="mt-2 space-y-2 rounded-lg border border-amber-200 bg-amber-50/80 p-2 dark:border-amber-900/50 dark:bg-amber-950/30">
                            <p className="text-[10px] text-amber-900 dark:text-amber-200/90">
                              İstediğiniz takvim günlerini seçin; bitiş boşsa başlangıç günü kullanılır.
                            </p>
                            <div className="flex flex-wrap gap-2 items-end">
                              <div>
                                <label className="text-[10px] text-slate-600 dark:text-slate-400 block mb-0.5">
                                  Başlangıç
                                </label>
                                <input
                                  type="date"
                                  value={goalDateEditStart}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setGoalDateEditStart(v);
                                    if (v && goalDateEditEnd && goalDateEditEnd < v) setGoalDateEditEnd(v);
                                  }}
                                  className="px-2 py-1 border rounded text-[11px] w-[132px] dark:bg-slate-900 dark:border-slate-600"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-600 dark:text-slate-400 block mb-0.5">
                                  Bitiş
                                </label>
                                <input
                                  type="date"
                                  value={goalDateEditEnd}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    if (v && goalDateEditStart && v < goalDateEditStart) {
                                      setGoalDateEditEnd(goalDateEditStart);
                                    } else setGoalDateEditEnd(v);
                                  }}
                                  className="px-2 py-1 border rounded text-[11px] w-[132px] dark:bg-slate-900 dark:border-slate-600"
                                />
                              </div>
                            </div>
                            <div className="flex gap-2 justify-end">
                              <button
                                type="button"
                                onClick={cancelGoalDateEdit}
                                className="text-[11px] px-2 py-1 rounded border border-slate-200 dark:border-slate-600 hover:bg-white dark:hover:bg-slate-800"
                              >
                                İptal
                              </button>
                              <button
                                type="button"
                                disabled={goalDateSaving}
                                onClick={() => void saveGoalDateEdit()}
                                className="text-[11px] px-2 py-1 rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                              >
                                {goalDateSaving ? 'Kaydediliyor…' : 'Kaydet'}
                              </button>
                            </div>
                          </div>
                        ) : null}
                        {over ? (
                          <div className="text-amber-700 dark:text-amber-400 flex items-center gap-1 mt-1">
                            <AlertTriangle className="w-3 h-3" />
                            Plan toplamı hedefi aştı
                          </div>
                        ) : null}
                      </div>
                      {canEditPlan && remaining > 0 ? (
                        <button
                          type="button"
                          disabled={plannerUiBusy}
                          onClick={() => void splitGoalAcrossPresetDays(goal)}
                          className="mt-2 w-full text-[11px] py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                        >
                          Kalanı günlere böl (ör. Pz-Sa-Pe-Cu)
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {studyModalEntry ? (
        <WeeklyPlannerStudyModal
          plannerEntry={studyModalEntry}
          quantityUnit={goals.find((g) => g.id === studyModalEntry.coach_goal_id)?.quantity_unit}
          onClose={() => setStudyModalEntry(null)}
          onSaved={async () => {
            await reload();
            await refreshTopicProgress();
          }}
          onEditPlanner={(en) => {
            setStudyModalEntry(null);
            openEdit(en);
          }}
        />
      ) : null}

      {etutPlannerEntry ? (
        <EtutPlannerEntryModal
          entry={etutPlannerEntry}
          studentId={studentId}
          classLevel={classLevel}
          institutionId={plannerStudent?.institutionId || institution?.id || null}
          onStudyLog={() => {
            setStudyModalEntry(etutPlannerEntry);
            setEtutPlannerEntry(null);
          }}
          onClose={() => setEtutPlannerEntry(null)}
        />
      ) : null}

      {/* Modal */}
      {(modalMode === 'create' || modalMode === 'edit') && slotContext && (
        <div className="fixed inset-0 z-[220] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="flex max-h-[min(92dvh,900px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl dark:bg-slate-900">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800">
              <h4 className="font-semibold text-slate-800 dark:text-slate-100">
                {modalMode === 'create' ? 'Yeni görev' : 'Görevi düzenle'}
              </h4>
              <button type="button" onClick={closeModal} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Gün</label>
                <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {format(parseISO(`${slotContext.date}T12:00:00`), 'd MMMM yyyy, EEEE', { locale: tr })}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="formStartTime" className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    Başlangıç
                  </label>
                  <input
                    id="formStartTime"
                    type="time"
                    step={gridSlotMinutes >= 60 ? 3600 : gridSlotMinutes * 60}
                    value={formStartTime}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFormStartTime(v);
                      if ((timeToMinutes(formEndTime) ?? 0) <= (timeToMinutes(v) ?? 0)) {
                        setFormEndTime(addMinutesToTimeHhmm(v, gridSlotMinutes));
                      }
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="formEndTime" className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    Bitiş
                  </label>
                  <input
                    id="formEndTime"
                    type="time"
                    step={gridSlotMinutes >= 60 ? 3600 : gridSlotMinutes * 60}
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[10, 20, 30, 40, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setFormEndTime(addMinutesToTimeHhmm(formStartTime, mins))}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
                  >
                    +{mins} dk
                  </button>
                ))}
              </div>

              <div>
                <p className="text-xs font-medium text-slate-600 mb-2">Koç hedefinden bağla</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormGoalId(null);
                    }}
                    className={`text-xs px-2 py-1 rounded-lg border ${
                      formGoalId == null ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200'
                    }`}
                  >
                    Manuel
                  </button>
                  {modalGoalQuota.map(({ goal: g, available, target }) => {
                    const depleted = available <= 0;
                    return (
                    <button
                      key={g.id}
                      type="button"
                      disabled={depleted && modalMode === 'create'}
                      onClick={() => {
                        if (depleted && modalMode === 'create') return;
                        const chunk = Math.min(Math.max(available, 0), 50) || Math.max(available, 0);
                        setFormGoalId(g.id);
                        setFormSubject(g.subject);
                        setFormTitle(g.title);
                        setFormPlannedQty(chunk > 0 ? chunk : 10);
                      }}
                      className={`text-xs px-2 py-1 rounded-lg border truncate max-w-[160px] ${
                        formGoalId === g.id ? 'bg-red-600 text-white border-red-600' : 'border-slate-200'
                      } ${depleted && modalMode === 'create' ? 'opacity-40 cursor-not-allowed' : ''}`}
                      title={
                        depleted
                          ? 'Bu hedef için planlanabilir kota kalmadı'
                          : `${g.title} — hedef ${target}, kalan ${available} ${g.quantity_unit}`
                      }
                    >
                      {g.subject} ({available} {g.quantity_unit})
                    </button>
                    );
                  })}
                </div>
              </div>

              {formGoalId ? (
                <>
                  <div>
                    <label className="text-xs text-slate-600">Ders</label>
                    <input
                      value={formSubject}
                      readOnly
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">Konu</label>
                    <input
                      value={formTitle}
                      readOnly
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-slate-50"
                    />
                  </div>
                </>
              ) : poolSubjects.length > 0 &&
                classLevel !== undefined &&
                classLevel !== null ? (
                <>
                  <p className="text-[11px] text-slate-500">
                    Ders ve konu, öğrencinin sınıfına göre konu havuzundan (
                    {formatClassLevelLabel(classLevel)}).
                  </p>
                  <div>
                    <label className="text-xs text-slate-600">Ders</label>
                    <select
                      value={formSubject}
                      onChange={(e) => {
                        setFormSubject(e.target.value);
                        setFormTitle('');
                      }}
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-white"
                    >
                      <option value="">Ders seçin</option>
                      {modalSubjectOptions.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">Konu</label>
                    <select
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      disabled={!formSubject.trim() || modalTopicSelectOptions.length === 0}
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-white disabled:opacity-60"
                    >
                      <option value="">
                        {modalTopicSelectOptions.length === 0 && formSubject.trim()
                          ? 'Bu ders için konu yok'
                          : 'Konu seçin'}
                      </option>
                      {modalTopicSelectOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-xs text-slate-600">Başlık</label>
                    <input
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">Ders / alan</label>
                    <input
                      value={formSubject}
                      onChange={(e) => setFormSubject(e.target.value)}
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="text-xs text-slate-600">Planlanan miktar (soru/sayfa vb.)</label>
                <input
                  type="number"
                  min={0}
                  max={formGoalId && selectedGoalAvailable != null ? selectedGoalAvailable : undefined}
                  value={formPlannedQty}
                  onChange={(e) => setFormPlannedQty(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                />
                {formGoalId && selectedGoalAvailable != null ? (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Kalan kota: <strong>{selectedGoalAvailable}</strong>{' '}
                    {goals.find((g) => g.id === formGoalId)?.quantity_unit || 'birim'}
                  </p>
                ) : null}
              </div>

              {modalMode === 'edit' && activeEntry && canEditPlan ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={plannerUiBusy || (Number(activeEntry.planned_quantity || 0) <= 0 && activeEntry.status !== 'completed')}
                    onClick={() => void toggleComplete(activeEntry)}
                    className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {activeEntry.status === 'completed' ? 'Tamamlanmadı yap' : 'Tamamlandı'}
                  </button>
                  <button
                    type="button"
                    disabled={plannerUiBusy}
                    onClick={() => void removeEntry()}
                    className="inline-flex items-center gap-1 px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    Sil
                  </button>
                </div>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-slate-100 bg-white p-4 pb-safe dark:border-slate-800 dark:bg-slate-900">
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={plannerUiBusy}
                  onClick={closeModal}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300"
                >
                  İptal
                </button>
                {modalMode === 'create' && canEditPlan ? (
                  <button
                    type="button"
                    disabled={plannerUiBusy}
                    onClick={() => void submitCreate()}
                    className="flex-[1.4] rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {plannerUiBusy ? 'Kaydediliyor…' : 'Kaydet'}
                  </button>
                ) : null}
                {modalMode === 'edit' && canEditPlan ? (
                  <button
                    type="button"
                    disabled={plannerUiBusy}
                    onClick={() => void saveEdit()}
                    className="flex-[1.4] rounded-xl bg-slate-800 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
                  >
                    {plannerUiBusy ? 'Kaydediliyor…' : 'Kaydet'}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
