'use client';

import { Building2, ChevronDown } from 'lucide-react';

export function InstitutionSwitcher() {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-left transition hover:border-brand-secondary/30 hover:bg-white"
      title="Kurum değiştirici — yakında"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-secondary/10 text-brand-secondary">
          <Building2 className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-800">
            Online VIP Dershane
          </span>
          <span className="block text-[11px] text-slate-400">
            Kurum seçici (yakında)
          </span>
        </span>
      </span>
      <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
    </button>
  );
}
