import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

export type MobileNavHubItem = {
  path: string;
  label: string;
  icon: LucideIcon;
  description?: string;
};

type MobileNavHubProps = {
  title: string;
  subtitle?: string;
  items: MobileNavHubItem[];
  featured?: MobileNavHubItem | null;
  className?: string;
};

export default function MobileNavHub({
  title,
  subtitle,
  items,
  featured,
  className
}: MobileNavHubProps) {
  const navigate = useNavigate();

  const renderTile = (item: MobileNavHubItem, featuredTile = false) => {
    const Icon = item.icon;
    return (
      <button
        key={item.path}
        type="button"
        onClick={() => navigate(item.path)}
        className={cn(
          'flex w-full items-center gap-3 rounded-2xl border text-left transition-colors touch-manipulation active:scale-[0.99]',
          featuredTile
            ? 'border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50 p-4 shadow-sm'
            : 'border-slate-200/90 bg-white p-3.5 shadow-sm hover:bg-slate-50 active:bg-slate-100'
        )}
      >
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
            featuredTile ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-indigo-700'
          )}
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900">{item.label}</span>
          {item.description ? (
            <span className="mt-0.5 block text-xs leading-snug text-slate-500">{item.description}</span>
          ) : null}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      </button>
    );
  };

  return (
    <div className={cn('mx-auto max-w-lg space-y-4 pb-4', className)}>
      <header className="px-0.5">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </header>

      {featured ? renderTile(featured, true) : null}

      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => renderTile(item))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
          Bu bölüm için menü öğesi yok.
        </p>
      )}
    </div>
  );
}
