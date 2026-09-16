import { CheckCircle2, CircleDashed, Sparkles, TrendingUp } from 'lucide-react';

/**
 * Koç hedefi ↔ gerçekleşen görselleri.
 * Renk anlamları haftalık plandaki kartlarla aynıdır:
 *   yeşil = hedefe ulaşıldı, mavi = devam ediyor, gri = başlanmadı, mor = hedef aşıldı.
 */

export type GoalProgressItem = {
  key: string;
  label: string;
  unit: string;
  target: number;
  completed: number;
};

export type SubjectGoalProgressRow = {
  subject: string;
  unit: string;
  target: number;
  completed: number;
  successPct: number;
  correct: number;
  wrong: number;
  blank: number;
};

type Status = 'exceeded' | 'reached' | 'progress' | 'notStarted' | 'untargeted';

function goalStatus(completed: number, target: number): Status {
  if (target <= 0) return 'untargeted';
  if (completed > target) return 'exceeded';
  if (completed >= target) return 'reached';
  if (completed > 0) return 'progress';
  return 'notStarted';
}

const STATUS_STYLE: Record<
  Status,
  { label: string; pill: string; bar: string; ring: string; icon: typeof CheckCircle2 }
> = {
  exceeded: {
    label: 'Hedef aşıldı',
    pill: 'bg-violet-100 text-violet-800 ring-violet-200',
    bar: 'bg-emerald-500',
    ring: '#7c3aed',
    icon: Sparkles,
  },
  reached: {
    label: 'Hedefe ulaşıldı',
    pill: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
    bar: 'bg-emerald-500',
    ring: '#059669',
    icon: CheckCircle2,
  },
  progress: {
    label: 'Devam ediyor',
    pill: 'bg-sky-100 text-sky-800 ring-sky-200',
    bar: 'bg-sky-500',
    ring: '#0284c7',
    icon: TrendingUp,
  },
  notStarted: {
    label: 'Başlanmadı',
    pill: 'bg-slate-100 text-slate-600 ring-slate-200',
    bar: 'bg-slate-300',
    ring: '#94a3b8',
    icon: CircleDashed,
  },
  untargeted: {
    label: 'Hedef yok',
    pill: 'bg-slate-100 text-slate-600 ring-slate-200',
    bar: 'bg-slate-400',
    ring: '#94a3b8',
    icon: CircleDashed,
  },
};

function realizationPct(completed: number, target: number): number {
  if (target <= 0) return 0;
  return Math.round((completed / target) * 100);
}

/** Hedef dolana kadar tek renk; aşım varsa hedef payı + mor fazlalık payı. */
function ProgressBar({ completed, target, status }: { completed: number; target: number; status: Status }) {
  const style = STATUS_STYLE[status];
  if (target <= 0) {
    return <div className="h-2.5 rounded-full bg-slate-100" aria-hidden />;
  }
  if (completed > target) {
    const targetShare = (target / completed) * 100;
    return (
      <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        <div className="h-full bg-emerald-500" style={{ width: `${targetShare}%` }} />
        <div className="h-full bg-violet-500" style={{ width: `${100 - targetShare}%` }} />
      </div>
    );
  }
  const width = Math.min(100, Math.max(0, (completed / target) * 100));
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
      <div className={`h-full rounded-full ${style.bar} transition-[width] duration-500`} style={{ width: `${width}%` }} />
    </div>
  );
}

function Ring({ pct, color }: { pct: number; color: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const shown = Math.min(100, Math.max(0, pct));
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90 shrink-0" aria-hidden>
      <circle cx="32" cy="32" r={r} fill="none" stroke="#e2e8f0" strokeWidth="7" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${(shown / 100) * c} ${c}`}
      />
    </svg>
  );
}

export function GoalProgressOverview({
  items,
  rangeLabel,
}: {
  items: GoalProgressItem[];
  rangeLabel: string;
}) {
  const visible = items.filter((i) => i.target > 0 || i.completed > 0);
  if (!visible.length) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-600">Koç hedefleri</p>
          <h3 className="text-lg font-semibold text-slate-900">Hedef ve gerçekleşme</h3>
        </div>
        <p className="text-xs text-slate-500">{rangeLabel} · koçun verdiği kota ile öğrencinin girdiği çalışma</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {visible.map((item) => {
          const status = goalStatus(item.completed, item.target);
          const style = STATUS_STYLE[status];
          const pct = realizationPct(item.completed, item.target);
          const Icon = style.icon;
          const remaining = Math.max(0, item.target - item.completed);
          const extra = Math.max(0, item.completed - item.target);
          return (
            <article
              key={item.key}
              className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${style.pill}`}
                >
                  <Icon className="h-3 w-3" />
                  {style.label}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <Ring pct={pct} color={style.ring} />
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums text-slate-800">
                    %{pct}
                  </span>
                </div>
                <dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
                  <dt className="text-slate-500">Yapılan</dt>
                  <dd className="text-right font-semibold tabular-nums text-slate-900">
                    {item.completed} {item.unit}
                  </dd>
                  <dt className="text-slate-500">Hedef</dt>
                  <dd className="text-right font-semibold tabular-nums text-slate-700">
                    {item.target} {item.unit}
                  </dd>
                  <dt className="text-slate-500">{extra > 0 ? 'Fazladan' : 'Kalan'}</dt>
                  <dd
                    className={`text-right font-semibold tabular-nums ${extra > 0 ? 'text-violet-700' : 'text-slate-700'}`}
                  >
                    {extra > 0 ? `+${extra}` : remaining}
                  </dd>
                </dl>
              </div>

              <ProgressBar completed={item.completed} target={item.target} status={status} />
            </article>
          );
        })}
      </div>
    </section>
  );
}

function successTone(pct: number): string {
  if (pct >= 80) return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (pct >= 60) return 'bg-amber-50 text-amber-700 ring-amber-200';
  return 'bg-rose-50 text-rose-700 ring-rose-200';
}

export function SubjectGoalProgressList({ rows, rangeLabel }: { rows: SubjectGoalProgressRow[]; rangeLabel: string }) {
  const visible = rows.filter((r) => r.target > 0 || r.completed > 0);
  if (!visible.length) return null;

  // Geride kalan dersler üstte: koç önce müdahale gereken dersi görsün.
  const ordered = [...visible].sort((a, b) => {
    if ((a.target > 0) !== (b.target > 0)) return a.target > 0 ? -1 : 1;
    return realizationPct(a.completed, a.target) - realizationPct(b.completed, b.target);
  });

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-600">Ders bazında</p>
          <h3 className="text-lg font-semibold text-slate-900">Hedef gerçekleşme ve doğruluk</h3>
        </div>
        <p className="text-xs text-slate-500">{rangeLabel} · geride kalan dersler üstte</p>
      </header>

      <ul className="divide-y divide-slate-100">
        {ordered.map((row) => {
          const status = goalStatus(row.completed, row.target);
          const style = STATUS_STYLE[status];
          const pct = realizationPct(row.completed, row.target);
          const answered = row.correct + row.wrong + row.blank;
          return (
            <li key={row.subject} className="grid gap-2 py-3 sm:grid-cols-[minmax(9rem,14rem)_1fr_auto] sm:items-center sm:gap-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">{row.subject}</p>
                <p className="text-[11px] text-slate-500">{row.unit}</p>
              </div>

              <div className="space-y-1">
                <ProgressBar completed={row.completed} target={row.target} status={status} />
                <p className="text-[11px] tabular-nums text-slate-500">
                  {row.completed} / {row.target > 0 ? row.target : '—'}
                  {row.completed > row.target && row.target > 0 ? (
                    <span className="ml-1 font-semibold text-violet-700">(+{row.completed - row.target})</span>
                  ) : null}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                {row.target > 0 ? (
                  <span
                    className={`inline-flex min-w-[3.25rem] justify-center rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ring-1 ${style.pill}`}
                    title={style.label}
                  >
                    %{pct}
                  </span>
                ) : null}
                {answered > 0 ? (
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ${successTone(row.successPct)}`}
                    title={`Doğru ${row.correct} · Yanlış ${row.wrong} · Boş ${row.blank}`}
                  >
                    Doğru %{row.successPct}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <footer className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Hedefe ulaşıldı
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-sky-500" /> Devam ediyor
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-violet-500" /> Hedefin fazlası
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-slate-300" /> Başlanmadı
        </span>
      </footer>
    </section>
  );
}
