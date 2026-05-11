import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../../lib/utils';

type Props = {
  label: string;
  icon: LucideIcon;
  active: boolean;
  collapsed: boolean;
  indent?: boolean;
  onNavigate: () => void;
};

export function SidebarNavLink({
  label,
  icon: Icon,
  active,
  collapsed,
  indent,
  onNavigate
}: Props) {
  return (
    <button
      type="button"
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={cn(
        'group flex w-full min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium leading-snug transition-all duration-200 ease-out touch-manipulation',
        indent && 'ml-2 border-l border-slate-500/35 pl-4',
        active
          ? 'bg-blue-500/20 text-white shadow-[0_0_24px_-8px_rgba(59,130,246,0.45)] ring-1 ring-blue-300/40'
          : 'text-slate-100/90 hover:bg-white/10 hover:text-white hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]'
      )}
    >
      <Icon
        className={cn(
          'h-[18px] w-[18px] shrink-0 transition-transform duration-200 ease-out',
          active ? 'text-blue-100' : 'text-slate-300 group-hover:scale-[1.04] group-hover:text-white'
        )}
        strokeWidth={1.75}
      />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
    </button>
  );
}
