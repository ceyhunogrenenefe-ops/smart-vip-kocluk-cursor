import React, { useMemo } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { MonitorSmartphone } from 'lucide-react';
import { screenTimeBandMeta, SCREEN_TIME_LEGEND } from '../../lib/screenTimeBands';
import { cn } from '../../lib/utils';

export type DailyScreenTimePoint = {
  gün: string;
  dakika: number;
  fill: string;
  bandLabel: string;
  bandId: string;
};

export function buildDailyScreenTimeSeries(
  weekStartStr: string,
  byDate: Map<string, number>
): DailyScreenTimePoint[] {
  const labels = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  return Array.from({ length: 7 }, (_, i) => {
    const d = format(addDays(parseISO(weekStartStr), i), 'yyyy-MM-dd');
    const dakika = byDate.get(d) ?? 0;
    const meta = screenTimeBandMeta(dakika);
    return {
      gün: labels[i],
      dakika,
      fill: meta.fill,
      bandLabel: meta.label,
      bandId: meta.id
    };
  });
}

type DailyScreenTimeChartProps = {
  weekStartStr: string;
  byDate: Map<string, number>;
  loading?: boolean;
  className?: string;
};

export function DailyScreenTimeChart({
  weekStartStr,
  byDate,
  loading = false,
  className
}: DailyScreenTimeChartProps) {
  const data = useMemo(
    () => buildDailyScreenTimeSeries(weekStartStr, byDate),
    [weekStartStr, byDate]
  );

  const weekTotal = useMemo(() => data.reduce((s, d) => s + d.dakika, 0), [data]);
  const daysLogged = useMemo(() => data.filter((d) => d.dakika > 0).length, [data]);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50 via-white to-violet-50/30 p-5 shadow-sm sm:col-span-2 lg:min-h-[168px] dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-violet-950/20',
        className
      )}
    >
      <div className="absolute -right-10 top-0 h-32 w-32 rounded-full bg-violet-400/10 blur-2xl" aria-hidden />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700 shadow-sm dark:bg-violet-950/60 dark:text-violet-300">
            <MonitorSmartphone className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-800/90 dark:text-violet-300/90">
              Günlük ekran süresi
            </p>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Telefon / tablet — haftalık dağılım
            </p>
          </div>
        </div>
        <div className="flex gap-4 text-right">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Hafta toplam</p>
            <p className="font-mono text-lg font-bold tabular-nums text-slate-800 dark:text-slate-100">
              {loading ? '…' : `${weekTotal} dk`}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Kayıtlı gün</p>
            <p className="font-mono text-lg font-bold tabular-nums text-slate-800 dark:text-slate-100">
              {loading ? '…' : daysLogged}
            </p>
          </div>
        </div>
      </div>

      <div className="relative mt-3 h-[112px] w-full [&_.recharts-tooltip-wrapper]:outline-none">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="rgb(148 163 184 / 0.3)" />
            <XAxis
              dataKey="gün"
              tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
              axisLine={{ stroke: 'rgb(226 232 240 / 0.9)' }}
              tickLine={false}
              dy={4}
            />
            <YAxis hide domain={[0, 'dataMax + 20']} />
            <Tooltip
              cursor={{ fill: 'rgb(139 92 246 / 0.06)', radius: 8 }}
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const row = payload[0].payload as DailyScreenTimePoint;
                const meta = screenTimeBandMeta(row.dakika);
                return (
                  <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm dark:border-slate-600 dark:bg-slate-900/95">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{row.gün}</p>
                    <p className="mt-0.5 tabular-nums text-slate-600 dark:text-slate-300">
                      {row.dakika} dk
                    </p>
                    <p className={cn('mt-1 inline-flex rounded-md px-1.5 py-0.5 font-semibold', meta.bg, meta.text)}>
                      {row.bandLabel}
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="dakika" radius={[10, 10, 4, 4]} maxBarSize={40}>
              {data.map((entry) => (
                <Cell key={entry.gün} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="relative mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-700/80">
        {SCREEN_TIME_LEGEND.map(({ range, meta }) => (
          <span
            key={range}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-1 text-[10px] font-semibold text-slate-600 shadow-sm dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-300"
          >
            <span
              className="h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-800"
              style={{ backgroundColor: meta.fill }}
              aria-hidden
            />
            <span className="text-slate-500 dark:text-slate-400">{range}</span>
            <span className={meta.text}>{meta.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
