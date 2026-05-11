import React from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';

export type WeeklyLiveGridShellProps = {
  title: string;
  /** Üst başlık altı kısa açıklama */
  subtitle?: string;
  /** Örn. 04.05.2026 - 10.05.2026 */
  weekRangeLabel: string;
  loading?: boolean;
  showWeekNavigation?: boolean;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  onThisWeek?: () => void;
  /** Üst barda ek pill / rozetler */
  legend?: React.ReactNode;
  /** Mor şerit altı bilgi satırı */
  hint?: string;
  children: React.ReactNode;
};

/**
 * Grup + özel canlı ders haftalık gridleri için ortak kabuk (gradient üst bar, hafta navigasyonu).
 */
export function WeeklyLiveGridShell({
  title,
  subtitle,
  weekRangeLabel,
  loading,
  showWeekNavigation = true,
  onPrevWeek,
  onNextWeek,
  onThisWeek,
  legend,
  hint,
  children
}: WeeklyLiveGridShellProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xl shadow-slate-300/25 ring-1 ring-slate-100/80">
      <div className="relative overflow-hidden bg-gradient-to-br from-[#1e1b4b] via-indigo-900 to-violet-950 px-4 py-5 sm:px-6 sm:py-6 text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.35) 0%, transparent 45%), radial-gradient(circle at 80% 0%, rgba(167,139,250,0.35) 0%, transparent 40%)'
          }}
        />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-white/90">
              <CalendarDays className="h-5 w-5 shrink-0 text-amber-300" aria-hidden />
              <h2 className="text-lg font-bold tracking-tight sm:text-xl">{title}</h2>
            </div>
            {subtitle ? <p className="max-w-2xl text-sm text-indigo-100/95">{subtitle}</p> : null}
            <p className="font-mono text-sm font-semibold tabular-nums text-amber-200/95 sm:text-base">
              {weekRangeLabel}
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-3 sm:items-end">
            {showWeekNavigation && (onPrevWeek || onNextWeek || onThisWeek) ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onPrevWeek}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20"
                  aria-label="Önceki hafta"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={onThisWeek}
                  className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-amber-950 shadow-lg shadow-amber-900/30 transition hover:bg-amber-300"
                >
                  Bugün
                </button>
                <button
                  type="button"
                  onClick={onNextWeek}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20"
                  aria-label="Sonraki hafta"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            ) : null}

            {legend ? (
              <div className="flex flex-wrap justify-end gap-2">{legend}</div>
            ) : null}
          </div>
        </div>

        {hint ? (
          <p className="relative mt-4 max-w-3xl text-xs leading-relaxed text-indigo-100/90 sm:text-sm">{hint}</p>
        ) : null}

        {loading ? (
          <p className="relative mt-2 text-xs font-medium text-amber-200/90">Yükleniyor…</p>
        ) : null}
      </div>

      <div className="border-t border-slate-100 bg-gradient-to-b from-slate-50/80 to-white">{children}</div>
    </div>
  );
}
