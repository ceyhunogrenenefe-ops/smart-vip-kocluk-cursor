import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

type PageCollapsibleSectionProps = {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  headerActions?: React.ReactNode;
};

export function PageCollapsibleSection({
  title,
  description,
  badge,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  children,
  className = '',
  contentClassName = 'p-4',
  headerActions
}: PageCollapsibleSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : internalOpen;

  const setOpen = (next: boolean) => {
    if (!controlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <div className={`overflow-hidden rounded-xl border border-gray-100 bg-white ${className}`}>
      <div className="flex items-stretch gap-0">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50/80"
        >
          <ChevronDown
            className={`h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 ${
              open ? 'rotate-180' : ''
            }`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-800">{title}</span>
              {badge}
            </div>
            {description && !open ? (
              <p className="mt-0.5 truncate text-xs text-slate-500">{description}</p>
            ) : null}
          </div>
        </button>
        {headerActions ? (
          <div className="flex shrink-0 items-center border-l border-gray-100 px-3">{headerActions}</div>
        ) : null}
      </div>
      {open ? <div className={`border-t border-gray-100 ${contentClassName}`}>{children}</div> : null}
    </div>
  );
}
