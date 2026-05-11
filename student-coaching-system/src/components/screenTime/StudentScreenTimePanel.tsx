import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, format, parseISO, startOfWeek } from 'date-fns';
import { tr } from 'date-fns/locale/tr';
import { ChevronLeft, ChevronRight, MonitorSmartphone, Save } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { fetchScreenTimeLogs, upsertScreenTimeLog } from '../../lib/screenTimeApi';

interface StudentScreenTimePanelProps {
  studentId: string;
}

export function StudentScreenTimePanel({ studentId }: StudentScreenTimePanelProps) {
  const [anchor, setAnchor] = useState(() => new Date());
  const weekStartStr = useMemo(
    () => format(startOfWeek(anchor, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    [anchor]
  );
  const weekEndStr = useMemo(
    () => format(addDays(parseISO(weekStartStr), 6), 'yyyy-MM-dd'),
    [weekStartStr]
  );

  const [logs, setLogs] = useState<{ log_date: string; screen_minutes: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [draftDate, setDraftDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [draftMins, setDraftMins] = useState(60);

  const reload = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    setErr('');
    try {
      const rows = await fetchScreenTimeLogs(studentId, weekStartStr, weekEndStr);
      setLogs(rows.map((r) => ({ log_date: r.log_date, screen_minutes: r.screen_minutes })));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ekran süresi yüklenemedi');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [studentId, weekStartStr, weekEndStr]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const byDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of logs) m.set(r.log_date, r.screen_minutes);
    return m;
  }, [logs]);

  const chartData = useMemo(() => {
    const labels = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
    return Array.from({ length: 7 }, (_, i) => {
      const d = format(addDays(parseISO(weekStartStr), i), 'yyyy-MM-dd');
      return {
        gün: labels[i],
        dk: byDate.get(d) ?? 0,
      };
    });
  }, [weekStartStr, byDate]);

  const weekTotal = useMemo(() => logs.reduce((s, r) => s + r.screen_minutes, 0), [logs]);
  const daysWithData = useMemo(() => logs.filter((r) => r.screen_minutes > 0).length, [logs]);
  const dailyAvg = daysWithData > 0 ? Math.round(weekTotal / daysWithData) : 0;

  const saveToday = async () => {
    if (!studentId) return;
    try {
      await upsertScreenTimeLog({
        student_id: studentId,
        log_date: draftDate,
        screen_minutes: Math.max(0, Math.min(1440, Math.floor(draftMins))),
      });
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Kaydedilemedi');
    }
  };

  return (
    <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-white p-5 shadow-sm space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <MonitorSmartphone className="w-5 h-5 text-indigo-600" />
          <div>
            <h4 className="font-semibold text-slate-800">Ekran / uygulama süresi</h4>
            <p className="text-xs text-slate-500">Günlük dakika girin; haftalık özet ve ortalama hesaplanır.</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAnchor((a) => addDays(a, -7))}
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setAnchor(new Date())}
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white"
          >
            Bu hafta
          </button>
          <button
            type="button"
            onClick={() => setAnchor((a) => addDays(a, 7))}
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg bg-white border border-slate-100 p-3">
          <p className="text-xs text-slate-500">Haftalık toplam</p>
          <p className="text-xl font-bold text-indigo-700">{weekTotal} dk</p>
          <p className="text-[11px] text-slate-400 mt-1">{loading ? '…' : `${format(parseISO(weekStartStr), 'd MMM', { locale: tr })} – ${format(parseISO(weekEndStr), 'd MMM', { locale: tr })}`}</p>
        </div>
        <div className="rounded-lg bg-white border border-slate-100 p-3">
          <p className="text-xs text-slate-500">Veri girilen günlere göre ortalama</p>
          <p className="text-xl font-bold text-slate-800">{dailyAvg} dk/gün</p>
          <p className="text-[11px] text-slate-400 mt-1">{daysWithData} gün kayıtlı</p>
        </div>
        <div className="rounded-lg bg-white border border-slate-100 p-3 flex flex-col gap-2">
          <label className="text-xs font-medium text-slate-600">Kayıt ekle / güncelle</label>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="date"
              value={draftDate}
              max={format(new Date(), 'yyyy-MM-dd')}
              onChange={(e) => setDraftDate(e.target.value)}
              className="text-sm border rounded-lg px-2 py-1"
            />
            <input
              type="number"
              min={0}
              max={1440}
              value={draftMins}
              onChange={(e) => setDraftMins(Number(e.target.value) || 0)}
              className="text-sm border rounded-lg px-2 py-1 w-24"
            />
            <span className="text-xs text-slate-500">dk</span>
            <button
              type="button"
              onClick={() => void saveToday()}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700"
            >
              <Save className="w-3.5 h-3.5" />
              Kaydet
            </button>
          </div>
        </div>
      </div>

      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <XAxis dataKey="gün" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} width={32} />
            <Tooltip formatter={(v: number) => [`${v} dk`, 'Süre']} />
            <Bar dataKey="dk" fill="#6366f1" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
