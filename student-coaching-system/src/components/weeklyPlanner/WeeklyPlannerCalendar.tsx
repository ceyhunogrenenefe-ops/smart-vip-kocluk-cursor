import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  patchWeeklyPlannerEntry,
} from '../../lib/weeklyPlannerApi';
import { WeeklyPlannerStudyModal } from './WeeklyPlannerStudyModal';
import { subjectPlannerStyle } from './subjectPlannerStyle';

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

  const [formGoalId, setFormGoalId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formPlannedQty, setFormPlannedQty] = useState(10);

  const reload = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    setErr('');
    try {
      const [g, e] = await Promise.all([
        fetchCoachWeeklyGoals(studentId, weekStartStr),
        fetchWeeklyPlannerEntries(studentId, weekStartStr, weekEndStr),
      ]);
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
      const rel = entries.filter(
        (e) =>
          e.coach_goal_id === g.id &&
          e.planner_date >= weekStartStr &&
          e.planner_date <= weekEndStr
      );
      const plannedSum = rel.reduce((s, e) => s + Number(e.planned_quantity || 0), 0);
      const completedSum = rel.reduce((s, e) => s + Number(e.completed_quantity || 0), 0);
      const target = Number(g.target_quantity || 0);
      const remaining = Math.max(0, target - plannedSum);
      const over = plannedSum > target;
      return { goal: g, plannedSum, completedSum, target, remaining, over };
    });
  }, [goals, entries, weekStartStr, weekEndStr]);

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
      const goalId = payload.slice('goal:'.length).trim();
      const g = goals.find((x) => x.id === goalId);
      if (!g) return;
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
      return;
    }

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
  };

  const splitGoalAcrossPresetDays = async (goal: CoachWeeklyGoalRow) => {
    if (!canEditPlan) return;
    const agg = goalAggregates.find((a) => a.goal.id === goal.id);
    const remaining = agg?.remaining ?? 0;
    if (remaining <= 0) {
      alert('Bölünecek kota kalmadı.');
      return;
    }
    const parts = 4;
    const base = Math.floor(remaining / parts);
    let extra = remaining % parts;
    const dayIx = [6, 1, 3, 4];
    const hour = 19;
    try {
      for (let i = 0; i < parts; i++) {
        const q = base + (extra > 0 ? 1 : 0);
        if (extra > 0) extra -= 1;
        if (q <= 0) continue;
        const date = dayDates[dayIx[i]];
        await createWeeklyPlannerEntry({
          student_id: studentId,
          planner_date: date,
          start_time: padHour(hour),
          end_time: padHour(Math.min(hour + 1, 23)),
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
  };

  const submitCreate = async () => {
    if (!slotContext || !studentId) return;
    const start = padHour(slotContext.hour);
    const end = padHour(Math.min(slotContext.hour + 1, 23));
    const g = goals.find((x) => x.id === formGoalId);
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
  };

  const toggleComplete = async (entry: WeeklyPlannerEntryRow) => {
    if (!canEditPlan) return;
    const nextDone = entry.status === 'completed' ? false : true;
    try {
      await patchWeeklyPlannerEntry(entry.id, {
        status: nextDone ? 'completed' : 'planned',
        completed_quantity: nextDone ? entry.planned_quantity : entry.completed_quantity,
      });
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Güncellenemedi');
    }
  };

  const saveEdit = async () => {
    if (!activeEntry) return;
    try {
      await patchWeeklyPlannerEntry(activeEntry.id, {
        title: formTitle,
        subject: formSubject,
        planned_quantity: formPlannedQty,
        coach_goal_id: formGoalId,
      });
      closeModal();
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Güncellenemedi');
    }
  };

  const removeEntry = async () => {
    if (!activeEntry) return;
    if (!confirm('Bu planı silmek istiyor musunuz?')) return;
    try {
      await deleteWeeklyPlannerEntry(activeEntry.id);
      closeModal();
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Silinemedi');
    }
  };

  const addCoachGoal = async () => {
    if (!canManageGoals || !studentId) return;
    const subject = newGoalSubject.trim();
    const title = newGoalTitle.trim() || subject || 'Hedef';
    if (!subject) {
      alert('Ders/konu alanı boş.');
      return;
    }
    try {
      await createCoachWeeklyGoal({
        student_id: studentId,
        subject,
        title,
        target_quantity: Math.max(0, newGoalQty),
        week_start_date: weekStartStr,
        quantity_unit: newGoalUnit.trim() || 'soru',
        goal_start_date: newGoalStart.trim() || weekStartStr,
        goal_end_date: newGoalEnd.trim() || weekEndStr,
      });
      setNewGoalSubject('');
      setNewGoalTitle('');
      setNewGoalQty(100);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Hedef eklenemedi');
    }
  };

  const removeGoal = async (id: string) => {
    if (!canManageGoals) return;
    if (!confirm('Hedef kartını silmek istiyor musunuz?')) return;
    try {
      await deleteCoachWeeklyGoal(id);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Silinemedi');
    }
  };

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
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-xs text-slate-600 block mb-1">Ders</label>
              <input
                value={newGoalSubject}
                onChange={(e) => setNewGoalSubject(e.target.value)}
                placeholder="Örn: Fizik"
                className="px-3 py-2 border rounded-lg text-sm w-36"
              />
            </div>
            <div>
              <label className="text-xs text-slate-600 block mb-1">Başlık</label>
              <input
                value={newGoalTitle}
                onChange={(e) => setNewGoalTitle(e.target.value)}
                placeholder="TYT soru çözümü"
                className="px-3 py-2 border rounded-lg text-sm w-44"
              />
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
                onChange={(e) => setNewGoalStart(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm w-[148px]"
              />
            </div>
            <div>
              <label className="text-xs text-slate-600 block mb-1">Bitiş</label>
              <input
                type="date"
                value={newGoalEnd}
                onChange={(e) => setNewGoalEnd(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm w-[148px]"
              />
            </div>
            <button
              type="button"
              onClick={() => void addCoachGoal()}
              className="inline-flex items-center gap-1 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600"
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
                            const done = en.status === 'completed';
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
              Kartı takvime sürükleyin · İsteğe bağlı otomatik günlere böl
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
                  const start = goal.goal_start_date || goal.week_start_date;
                  const end = goal.goal_end_date || weekEndStr;
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
                          <button
                            type="button"
                            onClick={() => void removeGoal(goal.id)}
                            className="text-red-500 hover:text-red-700 p-1 flex-shrink-0"
                            title="Hedefi sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
                        <div className="text-[11px] text-slate-500">
                          {start} → {end}
                        </div>
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
                          onClick={() => void splitGoalAcrossPresetDays(goal)}
                          className="mt-2 w-full text-[11px] py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
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
                  disabled={Boolean(formGoalId)}
                />
              </div>
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
                    onClick={() => void toggleComplete(activeEntry)}
                    className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {activeEntry.status === 'completed' ? 'Tamamlanmadı yap' : 'Tamamlandı'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeEntry()}
                    className="inline-flex items-center gap-1 px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                    Sil
                  </button>
                </div>
              ) : null}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-sm text-slate-600">
                  İptal
                </button>
                {modalMode === 'create' && canEditPlan ? (
                  <button
                    type="button"
                    onClick={() => void submitCreate()}
                    className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white font-medium"
                  >
                    Yerleştir
                  </button>
                ) : null}
                {modalMode === 'edit' && canEditPlan ? (
                  <button
                    type="button"
                    onClick={() => void saveEdit()}
                    className="px-4 py-2 text-sm rounded-lg bg-slate-800 text-white font-medium"
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
