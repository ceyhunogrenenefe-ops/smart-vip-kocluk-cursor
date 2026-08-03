import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { ArrowDownRight, ArrowUpRight, Loader2, Minus } from 'lucide-react';
import {
  fetchCoachStats,
  type CoachStatsExamDay,
  type CoachStatsResponse
} from '../../lib/coachStatsApi';

const TZ = 'Europe/Istanbul';

function istanbulToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function mondayOf(ymd: string): string {
  const noon = new Date(`${ymd}T12:00:00+03:00`);
  const short = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(noon);
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return addDaysYmd(ymd, -(map[short] ?? 0));
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `%${v.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
}

function deltaPct(curr: number | null | undefined, prev: number | null | undefined): number | null {
  if (curr == null || prev == null) return null;
  if (prev === 0) return curr === 0 ? 0 : 100;
  return Math.round((10 * ((curr - prev) / Math.abs(prev)) * 100)) / 10;
}

function fmtDelta(d: number | null): string {
  if (d == null) return '—';
  const sign = d > 0 ? '+' : '';
  return `${sign}${d.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}%`;
}

type MetricKey =
  | 'avg_report_fill_rate'
  | 'avg_attendance_rate'
  | 'avg_absence_rate'
  | 'avg_planner_goal_rate'
  | 'deneme_participation_rate';

const METRICS: { key: MetricKey; label: string; hint: string }[] = [
  { key: 'avg_report_fill_rate', label: 'Rapor doldurma', hint: 'Aktif öğrenci×gün' },
  { key: 'avg_attendance_rate', label: 'Ders devamlılık', hint: 'Present+geç' },
  { key: 'avg_absence_rate', label: 'Devamsızlık', hint: 'Absent oranı' },
  { key: 'avg_planner_goal_rate', label: 'Plan/hedef', hint: 'Haftalık soru hedefi' },
  { key: 'deneme_participation_rate', label: 'Deneme katılım', hint: 'E-Desis · aktif öğrenci' }
];

function summaryValue(data: CoachStatsResponse | null, key: MetricKey): number | null {
  if (!data?.summary) return null;
  if (key === 'deneme_participation_rate') {
    return data.summary.deneme_participation_rate ?? data.summary.avg_deneme_entry_rate ?? null;
  }
  if (key === 'avg_absence_rate') return data.summary.avg_absence_rate ?? null;
  return (data.summary as Record<string, number | null | undefined>)[key] ?? null;
}

function weekdayKey(ymd: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(
      new Date(`${ymd}T12:00:00+03:00`)
    );
  } catch {
    return ymd;
  }
}

type Props = {
  institutionId: string;
  coachId: string;
  classId: string;
  /** Karşılaştırma için “bu hafta” ankrajı (Pzt–bugün veya seçilen bitiş haftası) */
  anchorTo?: string;
};

export default function CoachWeeklyComparison({
  institutionId,
  coachId,
  classId,
  anchorTo
}: Props) {
  const [thisWeek, setThisWeek] = useState<CoachStatsResponse | null>(null);
  const [lastWeek, setLastWeek] = useState<CoachStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ranges = useMemo(() => {
    const today = istanbulToday();
    const end = anchorTo && anchorTo <= today ? anchorTo : today;
    const mon = mondayOf(end);
    const thisFrom = mon;
    const thisTo = end < addDaysYmd(mon, 6) ? end : addDaysYmd(mon, 6);
    const lastMon = addDaysYmd(mon, -7);
    return {
      thisWeek: { from: thisFrom, to: thisTo },
      lastWeek: { from: lastMon, to: addDaysYmd(lastMon, 6) }
    };
  }, [anchorTo]);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const common = {
          institutionId: institutionId || null,
          coachId: coachId || null,
          classId: classId || null
        };
        const [curr, prev] = await Promise.all([
          fetchCoachStats({ ...common, ...ranges.thisWeek }),
          fetchCoachStats({ ...common, ...ranges.lastWeek })
        ]);
        if (cancel) return;
        setThisWeek(curr);
        setLastWeek(prev);
      } catch (e) {
        if (cancel) return;
        setThisWeek(null);
        setLastWeek(null);
        setError(e instanceof Error ? e.message : 'Haftalık karşılaştırma yüklenemedi');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [institutionId, coachId, classId, ranges.thisWeek.from, ranges.thisWeek.to, ranges.lastWeek.from, ranges.lastWeek.to]);

  const chartData = useMemo(
    () =>
      METRICS.map((m) => {
        const bu = summaryValue(thisWeek, m.key);
        const gecen = summaryValue(lastWeek, m.key);
        return {
          metric: m.label,
          hint: m.hint,
          gecen: gecen ?? 0,
          bu: bu ?? 0,
          gecenRaw: gecen,
          buRaw: bu,
          delta: deltaPct(bu, gecen)
        };
      }),
    [thisWeek, lastWeek]
  );

  const examDayCompare = useMemo(() => {
    const curr = thisWeek?.exam_days || [];
    const prev = lastWeek?.exam_days || [];
    const byWdCurr = new Map<string, CoachStatsExamDay>();
    const byWdPrev = new Map<string, CoachStatsExamDay>();
    for (const d of curr) byWdCurr.set(weekdayKey(d.date), d);
    for (const d of prev) byWdPrev.set(weekdayKey(d.date), d);
    const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const labels: Record<string, string> = {
      Mon: 'Pzt',
      Tue: 'Sal',
      Wed: 'Çar',
      Thu: 'Per',
      Fri: 'Cum',
      Sat: 'Cmt',
      Sun: 'Paz'
    };
    return order
      .filter((wd) => byWdCurr.has(wd) || byWdPrev.has(wd))
      .map((wd) => {
        const c = byWdCurr.get(wd);
        const p = byWdPrev.get(wd);
        return {
          weekday: labels[wd] || wd,
          thisDate: c?.date || null,
          lastDate: p?.date || null,
          thisRate: c?.rate ?? null,
          lastRate: p?.rate ?? null,
          thisPart: c ? `${c.participants}/${c.active_students}` : '—',
          lastPart: p ? `${p.participants}/${p.active_students}` : '—',
          thisNames: c?.exam_names?.join(', ') || '—',
          lastNames: p?.exam_names?.join(', ') || '—',
          delta: deltaPct(c?.rate ?? null, p?.rate ?? null)
        };
      });
  }, [thisWeek, lastWeek]);

  return (
    <section className="space-y-4 rounded-2xl border border-teal-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Haftalık Karşılaştırma</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Geçen hafta ({ranges.lastWeek.from} → {ranges.lastWeek.to}) ile bu hafta (
            {ranges.thisWeek.from} → {ranges.thisWeek.to}) karşılaştırması. Pasif öğrenciler hariç.
          </p>
        </div>
        {loading ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Hesaplanıyor…
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {chartData.map((row) => {
          const up = (row.delta ?? 0) > 0;
          const down = (row.delta ?? 0) < 0;
          return (
            <div key={row.metric} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {row.metric}
              </p>
              <div className="mt-1 flex items-end justify-between gap-2">
                <div>
                  <p className="text-lg font-bold text-slate-900">{fmtPct(row.buRaw)}</p>
                  <p className="text-[11px] text-slate-500">Geçen: {fmtPct(row.gecenRaw)}</p>
                </div>
                <span
                  className={`inline-flex items-center gap-0.5 rounded-lg px-1.5 py-0.5 text-xs font-semibold ${
                    up
                      ? 'bg-emerald-50 text-emerald-700'
                      : down
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {up ? (
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  ) : down ? (
                    <ArrowDownRight className="h-3.5 w-3.5" />
                  ) : (
                    <Minus className="h-3.5 w-3.5" />
                  )}
                  {fmtDelta(row.delta)}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">{row.hint}</p>
            </div>
          );
        })}
      </div>

      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="metric" tick={{ fontSize: 11 }} interval={0} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(v: number, name: string) => [`%${v}`, name === 'gecen' ? 'Geçen hafta' : 'Bu hafta']}
            />
            <Legend
              formatter={(v) => (v === 'gecen' ? 'Geçen hafta' : v === 'bu' ? 'Bu hafta' : v)}
            />
            <Bar dataKey="gecen" name="gecen" fill="#94a3b8" radius={[4, 4, 0, 0]} />
            <Bar dataKey="bu" name="bu" fill="#0d9488" radius={[4, 4, 0, 0]}>
              {chartData.map((row) => (
                <Cell
                  key={row.metric}
                  fill={
                    row.metric === 'Devamsızlık'
                      ? '#e11d48'
                      : row.metric === 'Deneme katılım'
                        ? '#d97706'
                        : '#0d9488'
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2 text-xs text-slate-600">
        <strong>Deneme katılım (haftalık):</strong>{' '}
        Bu hafta {thisWeek?.summary.deneme_participants ?? '—'} /{' '}
        {thisWeek?.summary.active_student_count ?? '—'} aktif (
        {fmtPct(summaryValue(thisWeek, 'deneme_participation_rate'))}
        ) · Geçen hafta {lastWeek?.summary.deneme_participants ?? '—'} /{' '}
        {lastWeek?.summary.active_student_count ?? '—'} (
        {fmtPct(summaryValue(lastWeek, 'deneme_participation_rate'))})
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
          <h3 className="text-sm font-semibold text-slate-900">Ortak deneme günleri (haftanın günü)</h3>
          <p className="text-[11px] text-slate-500">
            Aynı hafta günündeki E-Desis deneme katılımı — aktif öğrenci paydası
          </p>
        </div>
        {examDayCompare.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-slate-500">
            Bu iki haftada deneme günü kaydı yok (E-Desis senkronunu kontrol edin).
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Gün</th>
                  <th className="px-3 py-2">Geçen hafta</th>
                  <th className="px-3 py-2">Bu hafta</th>
                  <th className="px-3 py-2">Değişim</th>
                </tr>
              </thead>
              <tbody>
                {examDayCompare.map((row) => (
                  <tr key={row.weekday} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-900">{row.weekday}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {row.lastDate || '—'}
                      <span className="mt-0.5 block text-[11px] text-slate-400">
                        {fmtPct(row.lastRate)} · {row.lastPart}
                      </span>
                      <span className="block text-[10px] text-slate-400">{row.lastNames}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {row.thisDate || '—'}
                      <span className="mt-0.5 block text-[11px] text-slate-400">
                        {fmtPct(row.thisRate)} · {row.thisPart}
                      </span>
                      <span className="block text-[10px] text-slate-400">{row.thisNames}</span>
                    </td>
                    <td
                      className={`px-3 py-2 font-semibold ${
                        (row.delta ?? 0) > 0
                          ? 'text-emerald-700'
                          : (row.delta ?? 0) < 0
                            ? 'text-rose-700'
                            : 'text-slate-600'
                      }`}
                    >
                      {fmtDelta(row.delta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
