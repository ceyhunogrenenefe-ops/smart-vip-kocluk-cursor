import React, { useMemo } from 'react';
import type { WeeklyEntry } from '../../types';
import {
  computeStudyInsightSummary,
  dailySolvedSeries,
  filterEntriesSince,
  formatDurationFromMinutes,
} from '../../lib/studyInsightMetrics';
import {
  Activity,
  BookOpen,
  CalendarCheck,
  Crosshair,
  MonitorSmartphone,
  Sparkles,
  Target,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type Props = {
  entries: WeeklyEntry[];
  /** Özet penceresi (örn. 30); `preFiltered` true ise yok sayılır */
  windowDays?: number;
  /** `entries` zaten tarih aralığına göre süzülmüşse (Analiz sayfası) */
  preFiltered?: boolean;
  /** Günlük bar grafikte kaç gün (varsayılan min(14, windowDays)) */
  chartDays?: number;
  title?: string;
  subtitle?: string;
  variant?: 'coach' | 'analytics';
  className?: string;
};

export function StudyInsightWidgets({
  entries,
  windowDays = 30,
  preFiltered = false,
  chartDays,
  title = 'Plan & günlük kayıt özeti',
  subtitle,
  variant = 'analytics',
  className = '',
}: Props) {
  const scoped = useMemo(
    () => (preFiltered ? entries : filterEntriesSince(entries, windowDays)),
    [entries, windowDays, preFiltered]
  );
  const summary = useMemo(() => computeStudyInsightSummary(scoped), [scoped]);
  const barLen = chartDays ?? Math.min(14, windowDays);
  const daily = useMemo(() => dailySolvedSeries(scoped, barLen), [scoped, barLen]);

  const accent =
    variant === 'coach'
      ? 'from-violet-600 to-indigo-700'
      : 'from-slate-800 to-slate-900 dark:from-slate-700 dark:to-slate-900';

  if (scoped.length === 0) {
    return (
      <div
        className={`rounded-2xl border border-dashed border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-900/40 p-6 text-center text-sm text-slate-500 ${className}`}
      >
        {entries.length === 0
          ? 'Henüz günlük çalışma kaydı yok. Öğrenci haftalık plan üzerinden kayıt girdiğinde burada görünecek.'
          : 'Bu tarih aralığında kayıt bulunmuyor. Farklı bir süre seçin veya öğrencinin giriş yapmasını bekleyin.'}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className={`rounded-2xl bg-gradient-to-r ${accent} p-5 sm:p-6 text-white shadow-lg`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 opacity-90" />
              <h3 className="text-lg font-bold">{title}</h3>
            </div>
            {subtitle ? (
              <p className="text-sm text-white/80 mt-1">{subtitle}</p>
            ) : (
              <p className="text-sm text-white/80 mt-1">
                {preFiltered
                  ? 'Seçilen filtre · Haftalık plan ile senkron günlük kayıtlar'
                  : `Son ${windowDays} gün · Haftalık plan ile senkron günlük kayıtlar`}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-1 rounded-lg bg-white/15 border border-white/20">
              {scoped.length} kayıt
            </span>
            <span className="px-2 py-1 rounded-lg bg-white/15 border border-white/20">
              {summary.activeDays} aktif gün
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
          <MiniStat
            icon={<Target className="w-4 h-4" />}
            label="Hedef gerçekleşme"
            value={`%${summary.realizationRate}`}
            hint={`${summary.totalSolved} / ${summary.totalTarget} soru`}
          />
          <MiniStat
            icon={<Crosshair className="w-4 h-4" />}
            label="Doğruluk"
            value={`%${summary.successRate}`}
            hint="Doğru / çözülen"
          />
          <MiniStat
            icon={<MonitorSmartphone className="w-4 h-4" />}
            label="Ekran süresi"
            value={formatDurationFromMinutes(summary.totalScreenMinutes)}
            hint="Toplam (öğrenci bildirimi)"
          />
          <MiniStat
            icon={<BookOpen className="w-4 h-4" />}
            label="Okunan sayfa"
            value={summary.totalPagesRead > 0 ? `${summary.totalPagesRead} syf.` : '—'}
            hint="Kitap takibi"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3 text-slate-800 dark:text-slate-100 font-semibold text-sm">
            <Activity className="w-4 h-4 text-orange-500" />
            Günlük çözüm ({daily.length} gün)
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12 }}
                  formatter={(v: number) => [`${v} soru`, 'Çözülen']}
                />
                <Bar dataKey="solved" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3 text-slate-800 dark:text-slate-100 font-semibold text-sm">
            <CalendarCheck className="w-4 h-4 text-emerald-500" />
            Çalışma sürekliliği
          </div>
          <div className="flex flex-wrap gap-1.5">
            {daily.map((d) => (
              <div
                key={d.date}
                title={`${d.date}: ${d.solved} soru`}
                className={`h-8 w-8 rounded-lg flex items-center justify-center text-[10px] font-medium border transition-colors ${
                  d.active
                    ? 'bg-emerald-500/15 border-emerald-400 text-emerald-800 dark:text-emerald-200'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-400'
                }`}
              >
                {d.label.replace('.', '')}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
            Yeşil: o gün en az bir kayıt · Turuncu grafik: günlük çözülen soru sayısı
          </p>
        </div>
      </div>

      {summary.subjectRows.length > 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 font-semibold text-sm text-slate-800 dark:text-slate-100">
            Ders bazlı performans
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
            {summary.subjectRows.slice(0, 12).map((row) => (
              <div key={row.subject} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-slate-800 dark:text-slate-100 truncate">{row.subject}</span>
                <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                  <span className="text-slate-500">Hedef % {row.realizationRate}</span>
                  <span
                    className={`px-2 py-0.5 rounded-md font-semibold ${
                      row.successRate >= 80
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                        : row.successRate >= 60
                          ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
                    }`}
                  >
                    %{row.successRate}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl bg-white/10 border border-white/20 p-3 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-white/90 text-xs font-medium mb-1">
        {icon}
        {label}
      </div>
      <p className="text-xl font-bold tracking-tight">{value}</p>
      <p className="text-[11px] text-white/70 mt-0.5 truncate">{hint}</p>
    </div>
  );
}
