import { CheckCircle2, Clock, ListChecks, Target, Users } from 'lucide-react';
import type { EduHomeworkStatsPayload } from '../../lib/eduPanel/eduPanelApi';

function Metric({
  icon,
  label,
  value,
  hint
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

/**
 * Ödev takip özeti: tamamlama oranı, ortalama süre, hedefe ulaşma.
 * Süre ve soru ölçütleri yalnız öğrenci bildirdiğinde dolar.
 */
export default function HomeworkStatsPanel({ stats }: { stats: EduHomeworkStatsPayload }) {
  const rate = Number.isFinite(stats.rate) ? Math.round(stats.rate) : 0;
  const reported = stats.selfReportedCount || 0;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          icon={<Users className="h-3.5 w-3.5 text-slate-400" />}
          label="Tamamlayan"
          value={`${stats.submitted} / ${stats.total}`}
          hint={stats.pending ? `${stats.pending} öğrenci bekliyor` : undefined}
        />
        <Metric
          icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
          label="Tamamlama oranı"
          value={`%${rate}`}
          hint={stats.late ? `${stats.late} geç teslim` : undefined}
        />
        <Metric
          icon={<Clock className="h-3.5 w-3.5 text-sky-500" />}
          label="Ortalama süre"
          value={stats.averageSpentMinutes != null ? `${stats.averageSpentMinutes} dk` : '—'}
          hint={
            stats.targetMinutes != null
              ? `Hedef ${stats.targetMinutes} dk`
              : reported
                ? undefined
                : 'Öğrenci bildirmedi'
          }
        />
        <Metric
          icon={<ListChecks className="h-3.5 w-3.5 text-amber-500" />}
          label="Ortalama soru"
          value={stats.averageSolvedQuestions != null ? String(stats.averageSolvedQuestions) : '—'}
          hint={
            stats.targetQuestionCount != null
              ? `Hedef ${stats.targetQuestionCount} soru`
              : reported
                ? undefined
                : 'Öğrenci bildirmedi'
          }
        />
      </div>

      {stats.reachedTargetCount != null && stats.targetQuestionCount != null ? (
        <p className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800 ring-1 ring-emerald-200">
          <Target className="h-4 w-4" />
          Hedefe ulaşan: {stats.reachedTargetCount} öğrenci ({stats.targetQuestionCount} soru ve üzeri)
        </p>
      ) : null}

      {stats.missingNames?.length ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3">
          <p className="text-xs font-semibold text-rose-800">Teslim etmeyenler</p>
          <p className="mt-1 text-sm text-rose-900">{stats.missingNames.join(', ')}</p>
        </div>
      ) : null}
    </div>
  );
}
