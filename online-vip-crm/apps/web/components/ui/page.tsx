import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-brand-text md:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-6 py-12 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {description ? (
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      ) : null}
    </div>
  );
}

export function StubPage({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="animate-fade-up">
      <PageHeader
        title={title}
        description={description || 'Bu bölüm bir sonraki fazda tamamlanacak.'}
      />
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-soft">
        <div className="mx-auto max-w-lg text-center">
          <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-gradient-to-br from-brand-primary/15 to-brand-secondary/15" />
          <p className="font-medium text-slate-800">Yakında</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Arayüz iskeleti hazır. API entegrasyonu ve iş kuralları sonraki
            sprintte eklenecek.
          </p>
        </div>
      </div>
    </div>
  );
}

export function MetricShell({
  label,
  hint,
}: {
  label: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <div className="mt-3 h-8 w-24 rounded-md skeleton" />
      {hint ? <p className="mt-3 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

export function StatusBadge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
        tone === 'neutral' && 'bg-slate-100 text-slate-600',
        tone === 'success' && 'bg-emerald-50 text-emerald-700',
        tone === 'warning' && 'bg-amber-50 text-amber-700',
        tone === 'danger' && 'bg-red-50 text-red-700',
        tone === 'info' && 'bg-sky-50 text-sky-700',
      )}
    >
      {children}
    </span>
  );
}
