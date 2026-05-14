import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, format, isBefore, parseISO, startOfWeek } from 'date-fns';
import { tr } from 'date-fns/locale/tr';
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
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
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
import { WeeklyPlannerStudyModal } from './WeeklyPlannerStudyModal';
import { subjectPlannerStyle } from './subjectPlannerStyle';
import { cn } from '../../lib/utils';
import { useApp } from '../../context/AppContext';
import { formatClassLevelLabel } from '../../types';

export { subjectPlannerStyle };

const HOURS = Array.from({ length: 16 }, (_, i) => i + 8); // 08–23
const DAY_LABELS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

function padHour(h: number) {
  return `${String(h).padStart(2, '0')}:00`;
}

function hourFromTime(t: string) {
  const h = parseInt(String(t || '').split(':')[0], 10);
  return Number.isNaN(h) ? null : h;
}

/**
 * Aynı (tarih, saat) diliminde üst üste binmeden slot listesi.
 * "Kalanı günlere böl" gibi akışlarda sunucunun 409 time_conflict dönmesini engeller.
 */
function buildDistinctPlannerSlots(
  dayDates: string[],
  spanStart: string,
  spanEnd: string,
  needed: number
): { date: string; hour: number }[] {
  const out: { date: string; hour: number }[] = [];
  const used = new Set<string>();
  const inSpan = dayDates.filter((d) => d >= spanStart && d <= spanEnd);
  const pushSlots = (dates: string[]) => {
    for (const date of dates) {
      for (let hour = 8; hour <= 22 && out.length < needed; hour++) {
        const key = `${date}_${hour}`;
        if (used.has(key)) continue;
        used.add(key);
        out.push({ date, hour });
      }
    }
  };
  pushSlots(inSpan.length > 0 ? inSpan : dayDates);
  if (out.length < needed) pushSlots(dayDates);
  return out;
}

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
  /** Öğrenci kendi planında: blok tıklanınca günlük çalışma kaydı modalı */
  studentStudyLogUi?: boolean;
}

export function WeeklyPlannerCalendar({
  studentId,
  studentName,
  canEditPlan,
  canManageGoals,
  studentStudyLogUi = false,
}: WeeklyPlannerCalendarProps) {
  const { students, getTopics, getTopicsByClass } = useApp();

  const plannerStudent = useMemo(() => students.find((s) => s.id === studentId), [students, studentId]);
  const classLevel = plannerStudent?.classLevel;

  /** Öğrenci sınıfına göre konu havuzunda tanımlı dersler */
  const poolSubjects = useMemo(() => {
    if (classLevel === undefined || classLevel === null) return [] as string[];
    const tb = getTopicsByClass(classLevel);
    if (tb.isYKS) {
      const list = [...Object.keys(tb.tytSubjects), ...Object.keys(tb.aytSubjects)];
      return list.sort((a, b) => a.localeCompare(b, 'tr'));
    }
    return Object.keys(tb.regular).sort((a, b) => a.localeCompare(b, 'tr'));
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
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');

  const [modalMode, setModalMode] = useState<ModalMode>('idle');
  const [slotContext, setSlotContext] = useState<{ date: string; hour: number } | null>(null);
  const [activeEntry, setActiveEntry] = useState<WeeklyPlannerEntryRow | null>(null);
  const [studyModalEntry, setStudyModalEntry] = useState<WeeklyPlannerEntryRow | null>(null);

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

  /** Çift tıklama / yarış: aynı işlem iki kez API çağırmasın */
  const plannerMutateLock = useRef(false);
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

  const reload = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    setErr('');
    try {
      const g = await fetchCoachWeeklyGoals(studentId, weekStartStr);
      let entryFrom = weekStartStr;
      let entryTo = weekEndStr;
      for (const goal of g) {
        const { start, end } = goalEffectiveSpan(goal, weekStartStr, weekEndStr);
        if (start < entryFrom) entryFrom = start;
        if (end > entryTo) entryTo = end;
      }
      const e = await fetchWeeklyPlannerEntries(studentId, entryFrom, entryTo);
      setGoals(g);
      setEntries(e);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Yükleme hatası');
    } finally {
      setLoading(false);
    }
  }, [studentId, weekStartStr, weekEndStr]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    setNewGoalSubject('');
    setNewGoalTitle('');
  }, [studentId]);

  useEffect(() => {
    setNewGoalStart(weekStartStr);
    setNewGoalEnd(weekEndStr);
  }, [weekStartStr, weekEndStr]);

  useEffect(() => {
    const id = window.setInterval(() => void reload(), 8000);
    return () => window.clearInterval(id);
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
      const completedSum = rel.reduce((s, e) => s + Number(e.completed_quantity || 0), 0);
      const target = Number(g.target_quantity || 0);
      const remaining = Math.max(0, target - plannedSum);
      const over = plannedSum > target;
      return { goal: g, plannedSum, completedSum, target, remaining, over };
    });
  }, [goals, entries, weekStartStr, weekEndStr]);

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

  const weekStats = useMemo(() => {
    let planned = 0;
    let done = 0;
    let minutes = 0;
    for (const e of entries) {
      if (e.planner_date < weekStartStr || e.planner_date > weekEndStr) continue;
      planned += Number(e.planned_quantity || 0);
      done += Math.min(Number(e.completed_quantity || 0), Number(e.planned_quantity || 0));
      minutes += slotMinutes(e.start_time, e.end_time);
    }
    const pct = planned > 0 ? Math.round((done / planned) * 100) : 0;
    return { planned, done, minutes, pct };
  }, [entries, weekStartStr, weekEndStr]);

  const dailyChart = useMemo(() => {
    return dayDates.map((d, i) => {
      let minutes = 0;
      for (const e of entries) {
        if (e.planner_date !== d) continue;
        minutes += slotMinutes(e.start_time, e.end_time);
      }
      return { gün: DAY_LABELS[i].slice(0, 3), dakika: minutes };
    });
  }, [dayDates, entries]);

  const openCreate = (date: string, hour: number) => {
    setSlotContext({ date, hour });
    setActiveEntry(null);
    setModalMode('create');
    setFormGoalId(null);
    setFormTitle('');
    setFormSubject('');
    setFormPlannedQty(10);
  };

  const openEdit = (entry: WeeklyPlannerEntryRow) => {
    setSlotContext({ date: entry.planner_date, hour: hourFromTime(entry.start_time) ?? 8 });
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

  const handleDropOnCell = async (payload: string, date: string, hour: number) => {
    if (!canEditPlan) return;
    const nextStart = padHour(hour);
    const nextEnd = padHour(Math.min(hour + 1, 23));

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
      const slots = buildDistinctPlannerSlots(dayDates, gS, gE, maxParts);
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
            start_time: padHour(slot.hour),
            end_time: padHour(Math.min(slot.hour + 1, 23)),
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
      const start = padHour(slotContext.hour);
      const end = padHour(Math.min(slotContext.hour + 1, 23));
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
      try {
        await createWeeklyPlannerEntry({
          student_id: studentId,
          planner_date: slotContext.date,
          start_time: start,
          end_time: end,
          title,
          subject,
          planned_quantity: Math.max(0, formPlannedQty),
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
          completed_quantity: nextDone ? entry.planned_quantity : entry.completed_quantity,
        });
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
      const patch: Record<string, unknown> = {
        title: formTitle,
        subject: formSubject,
        planned_quantity: pq,
        coach_goal_id: formGoalId,
      };
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

  const removeGoal = async (id: string) => {
    if (!canManageGoals) return;
    if (!confirm('Hedef kartını silmek istiyor musunuz?')) return;
    try {
      await deleteCoachWeeklyGoal(id);
      if (goalDateEditId === id) {
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
      const newWs = shiftWeekStartStr(weekStartStr, deltaWeeks);
      try {
        await patchCoachWeeklyGoal(goalId, { week_start_date: newWs });
        setAnchor(parseISO(`${newWs}T12:00:00`));
        // reload, güncellenmiş weekStartStr ile useEffect içinde tetiklenir
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Hedef haftaya taşınamadı');
      }
    },
    [canManageGoals, weekStartStr, shiftWeekStartStr]
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

  const cellEntries = (date: string, hour: number) =>
    entries.filter((e) => e.planner_date === date && hourFromTime(e.start_time) === hour);

  const pastSlot = (dateStr: string, hour: number) => {
    const iso = `${dateStr}T${padHour(hour)}:00`;
    try {
      return isBefore(parseISO(iso), new Date());
    } catch {
      return false;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-red-500" />
            Haftalık çalışma planı
            {studentName ? <span className="text-slate-500 font-normal text-sm">— {studentName}</span> : null}
          </h3>
          <p className="text-sm text-slate-500">
            {format(parseISO(weekStartStr), 'd MMMM', { locale: tr })} –{' '}
            {format(parseISO(weekEndStr), 'd MMMM yyyy', { locale: tr })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {canManageGoals ? (
            <div
              role="region"
              aria-label="Hedefi önceki haftaya taşı"
              onDragOver={(e) => onWeekGoalDragOver(e, -1)}
              onDragLeave={onWeekGoalDragLeave}
              onDrop={(e) => void onWeekGoalDrop(e, -1)}
              className={cn(
                'flex min-h-[40px] min-w-[7.5rem] select-none items-center justify-center rounded-lg border border-dashed px-2 py-1.5 text-center text-[10px] font-semibold leading-tight transition-colors sm:min-w-[8.5rem] sm:text-[11px]',
                weekDropHighlight === -1
                  ? 'border-amber-500 bg-amber-100 text-amber-950 shadow-inner'
                  : 'border-slate-200 text-slate-500 hover:border-amber-300 hover:bg-amber-50/60'
              )}
            >
              ← Önceki haftaya bırak
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAnchor((a) => addDays(a, -7))}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setAnchor(new Date())}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50"
            >
              Bu hafta
            </button>
            <button
              type="button"
              onClick={() => setAnchor((a) => addDays(a, 7))}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          {canManageGoals ? (
            <div
              role="region"
              aria-label="Hedefi sonraki haftaya taşı"
              onDragOver={(e) => onWeekGoalDragOver(e, 1)}
              onDragLeave={onWeekGoalDragLeave}
              onDrop={(e) => void onWeekGoalDrop(e, 1)}
              className={cn(
                'flex min-h-[40px] min-w-[7.5rem] select-none items-center justify-center rounded-lg border border-dashed px-2 py-1.5 text-center text-[10px] font-semibold leading-tight transition-colors sm:min-w-[8.5rem] sm:text-[11px]',
                weekDropHighlight === 1
                  ? 'border-amber-500 bg-amber-100 text-amber-950 shadow-inner'
                  : 'border-slate-200 text-slate-500 hover:border-amber-300 hover:bg-amber-50/60'
              )}
            >
              Sonraki haftaya bırak →
            </div>
          ) : null}
        </div>
      </div>

      {err ? (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {err}
        </div>
      ) : null}

      {/* Özet */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Haftalık tamamlanma</p>
          <p className="text-2xl font-bold text-emerald-600">{weekStats.pct}%</p>
          <p className="text-xs text-slate-400 mt-1">
            {weekStats.done} / {weekStats.planned} birim
          </p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Planlanan süre</p>
          <p className="text-2xl font-bold text-slate-800">{weekStats.minutes} dk</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm sm:col-span-2">
          <p className="text-xs text-slate-500 mb-2">Günlük süre (dakika)</p>
          <div className="h-28">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyChart}>
                <XAxis dataKey="gün" tick={{ fontSize: 11 }} />
                <YAxis hide />
                <Tooltip />
                <Bar dataKey="dakika" fill="#f97316" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Koç hedefleri */}
      {canManageGoals && (
        <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/50 p-4 space-y-3">
          <p className="text-sm font-medium text-amber-900">Koç — bu hafta için hedef ekle</p>
          <p className="text-xs text-amber-800/90 leading-relaxed max-w-2xl">
            Başlangıç ve bitişi istediğiniz takvim günleri olarak seçebilirsiniz (ör. Cumartesi–gelecek hafta
            Cuma). Takvimde üst şeritte hangi günlerin bu hedefe dahil olduğu işaretlenir; plan bloklarını
            yalnızca bu aralıktaki günlere sürükleyebilirsiniz.
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
                  setNewGoalSubject(e.target.value);
                  setNewGoalTitle('');
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
                <option value="soru">soru</option>
                <option value="sayfa">sayfa</option>
                <option value="tekrar">tekrar</option>
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

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Takvim */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden transition-colors">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-900 text-xs text-slate-600 dark:text-slate-400">
            <span>
              {loading
                ? 'Yükleniyor…'
                : studentStudyLogUi
                  ? 'Bloklara tıklayı günlük kayıt gir · hedef kartını sürükleyerek yerleştir'
                  : 'Öğrenci blokları sürükleyerek taşıyabilir'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div
                className="grid"
                style={{ gridTemplateColumns: `56px repeat(7, minmax(90px,1fr))` }}
              >
                <div className="h-10 border-b border-r bg-slate-100" />
                {DAY_LABELS.map((d, i) => (
                  <div
                    key={d}
                    className="h-10 border-b border-slate-200 flex flex-col items-center justify-center bg-slate-50 text-xs font-semibold text-slate-700"
                  >
                    <span>{d.slice(0, 3)}</span>
                    <span className="text-[10px] font-normal text-slate-500">
                      {format(parseISO(dayDates[i]), 'd MMM', { locale: tr })}
                    </span>
                  </div>
                ))}

                <div className="border-r border-b border-slate-200 bg-amber-50/40 dark:bg-amber-950/20 px-1 py-0.5 text-[9px] text-amber-900/80 dark:text-amber-200/90 leading-tight">
                  Hedef süresi
                </div>
                {dayDates.map((date) => {
                  const dayGoals = goalsByDayDate[date] ?? [];
                  return (
                    <div
                      key={`goal-span-${date}`}
                      className="border-b border-slate-200 bg-amber-50/30 dark:bg-amber-950/15 px-0.5 py-0.5 min-h-[28px] flex flex-col gap-0.5"
                    >
                      {dayGoals.slice(0, 3).map((g) => {
                        const st = subjectPlannerStyle(g.subject, g.quantity_unit);
                        const sp = goalEffectiveSpan(g, weekStartStr, weekEndStr);
                        return (
                          <div
                            key={g.id}
                            title={`${g.title} (${sp.start} → ${sp.end})`}
                            className={`truncate rounded px-0.5 text-[9px] font-medium leading-tight ${st.chip}`}
                          >
                            {g.subject}
                          </div>
                        );
                      })}
                      {dayGoals.length > 3 ? (
                        <span className="text-[8px] text-amber-800/80 dark:text-amber-300/80">+{dayGoals.length - 3}</span>
                      ) : null}
                    </div>
                  );
                })}

                {HOURS.map((hour) => (
                  <React.Fragment key={hour}>
                    <div className="border-r border-b border-slate-100 text-[11px] text-slate-500 text-right pr-1 py-1 bg-white">
                      {padHour(hour)}
                    </div>
                    {dayDates.map((date) => {
                      const list = cellEntries(date, hour);
                      const isPast = pastSlot(date, hour);
                      return (
                        <div
                          key={`${date}-${hour}`}
                          className={`border-b border-slate-100 min-h-[52px] p-0.5 relative ${
                            isPast ? 'bg-slate-50/80' : 'bg-white'
                          } ${canEditPlan ? 'hover:bg-blue-50/40 cursor-pointer' : ''}`}
                          onClick={() => {
                            if (!canEditPlan) return;
                            if (list.length === 0) openCreate(date, hour);
                          }}
                          onDragOver={(e) => {
                            if (!canEditPlan) return;
                            e.preventDefault();
                          }}
                          onDrop={(e) => {
                            if (!canEditPlan) return;
                            e.preventDefault();
                            const id = e.dataTransfer.getData('text/plain');
                            if (id) void handleDropOnCell(id, date, hour);
                          }}
                        >
                          {list.map((en) => {
                            const st = subjectPlannerStyle(en.subject, goals.find((g) => g.id === en.coach_goal_id)?.quantity_unit);
                            const plannedN = Number(en.planned_quantity || 0);
                            const done =
                              en.status === 'completed' &&
                              (plannedN > 0 || Number(en.completed_quantity || 0) > 0);
                            const miss = isPast && en.status === 'planned';
                            const borderCls = done
                              ? 'border-emerald-500 ring-1 ring-emerald-200'
                              : miss
                                ? 'border-red-400 ring-1 ring-red-100'
                                : en.status === 'partial'
                                  ? 'border-amber-400 ring-1 ring-amber-100'
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
                                  if (studentStudyLogUi) {
                                    setStudyModalEntry(en);
                                  } else {
                                    openEdit(en);
                                  }
                                }}
                                className={`text-[10px] leading-tight rounded px-1 py-0.5 mb-0.5 border ${st.chip} ${borderCls} ${canEditPlan ? 'cursor-grab' : ''}`}
                              >
                                <div className="flex items-start gap-0.5">
                                  {canEditPlan ? <GripVertical className="w-3 h-3 text-slate-400 flex-shrink-0 mt-0.5" /> : null}
                                  <div className="min-w-0 flex-1">
                                    <div className="font-semibold truncate">{en.title}</div>
                                    <div className="opacity-80">
                                      {en.planned_quantity} plan / {en.completed_quantity} yap
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
          </div>
        </div>

        {/* Hedef özet */}
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">Koç hedefleri</h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
              Kartı takvim hücresine sürükleyerek plana yerleştirin (yalnızca hedefin başlangıç–bitiş
              günleri) · Üstteki &quot;Önceki / Sonraki haftaya bırak&quot; ile hedefi ve plan bloklarını
              kaydırın · Tarih aralığını karttaki kalemle istediğiniz günler olarak düzenleyin · Kalan kotayı
              hedef süresindeki günlere bölebilirsiniz
            </p>
            {goalAggregates.length === 0 ? (
              <p className="text-xs text-slate-500">
                {canManageGoals
                  ? 'Henüz hedef yok. Yukarıdan ekleyin veya öğrenci manuel görev yerleştirsin.'
                  : 'Koçunuz hedef tanımladığında burada görünür.'}
              </p>
            ) : (
              <ul className="space-y-3 text-xs">
                {goalAggregates.map(({ goal, plannedSum, target, remaining, over }) => {
                  const pct = target > 0 ? Math.min(100, Math.round((plannedSum / target) * 100)) : 0;
                  const { start, end } = goalEffectiveSpan(goal, weekStartStr, weekEndStr);
                  return (
                    <li
                      key={goal.id}
                      draggable={canEditPlan}
                      onDragStart={(e) => {
                        if (!canEditPlan) return;
                        e.dataTransfer.setData('text/plain', `goal:${goal.id}`);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      className={`rounded-xl border border-slate-100 dark:border-slate-700 p-3 bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-950 shadow-sm ${
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
                        {canManageGoals ? (
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
                              onClick={() => void removeGoal(goal.id)}
                              className="text-red-500 hover:text-red-700 p-1"
                              title="Hedefi sil"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-red-400 to-orange-400 transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-2 text-slate-600 dark:text-slate-300 space-y-0.5">
                        <div>
                          {target} {goal.quantity_unit} · Planlanan {plannedSum}
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
                        {canManageGoals && goalDateEditId === goal.id ? (
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
          onClose={() => setStudyModalEntry(null)}
          onSaved={() => void reload()}
          onEditPlanner={(en) => {
            setStudyModalEntry(null);
            openEdit(en);
          }}
        />
      ) : null}

      {/* Modal */}
      {(modalMode === 'create' || modalMode === 'edit') && slotContext && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h4 className="font-semibold text-slate-800">
                {modalMode === 'create' ? 'Yeni görev' : 'Görevi düzenle'}
              </h4>
              <button type="button" onClick={closeModal} className="text-slate-500 hover:text-slate-800">
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500">
                Zaman: {slotContext.date} {padHour(slotContext.hour)} →{' '}
                {padHour(Math.min(slotContext.hour + 1, 23))}
              </p>

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
                  {goals.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => {
                        setFormGoalId(g.id);
                        setFormSubject(g.subject);
                        setFormTitle(g.title);
                      }}
                      className={`text-xs px-2 py-1 rounded-lg border truncate max-w-[140px] ${
                        formGoalId === g.id ? 'bg-red-600 text-white border-red-600' : 'border-slate-200'
                      }`}
                    >
                      {g.subject} ({g.target_quantity} {g.quantity_unit})
                    </button>
                  ))}
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
                  value={formPlannedQty}
                  onChange={(e) => setFormPlannedQty(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                />
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

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" disabled={plannerUiBusy} onClick={closeModal} className="px-4 py-2 text-sm text-slate-600 disabled:opacity-50">
                  İptal
                </button>
                {modalMode === 'create' && canEditPlan ? (
                  <button
                    type="button"
                    disabled={plannerUiBusy}
                    onClick={() => void submitCreate()}
                    className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white font-medium disabled:opacity-50"
                  >
                    Ekle
                  </button>
                ) : null}
                {modalMode === 'edit' && canEditPlan ? (
                  <button
                    type="button"
                    disabled={plannerUiBusy}
                    onClick={() => void saveEdit()}
                    className="px-4 py-2 text-sm rounded-lg bg-slate-800 text-white font-medium disabled:opacity-50"
                  >
                    Kaydet
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
