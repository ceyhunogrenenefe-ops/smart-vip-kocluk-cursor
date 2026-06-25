import { Loader2 } from 'lucide-react';

export function ScoresLoadingPlaceholder({
  message = 'Skor verileri yükleniyor…',
  compact = false
}: {
  message?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-slate-50 text-center text-sm text-slate-600 ${
        compact ? 'px-4 py-4' : 'px-4 py-10'
      }`}
    >
      <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-blue-600" />
      {message}
    </div>
  );
}

export function DashboardStatsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-2xl bg-slate-100 p-6 h-28" />
      ))}
    </div>
  );
}
