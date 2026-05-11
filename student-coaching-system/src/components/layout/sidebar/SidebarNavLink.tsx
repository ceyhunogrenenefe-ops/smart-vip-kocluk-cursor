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
        indent && 'ml-2 border-l border-white/[0.08] pl-4',
        active
          ? 'bg-blue-500/[0.14] text-white shadow-[0_0_28px_-10px_rgba(59,130,246,0.65)] ring-1 ring-blue-400/30'
          : 'text-slate-300/95 hover:bg-white/[0.07] hover:text-white hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]'
      )}
    >
      <Icon
        className={cn(
          'h-[18px] w-[18px] shrink-0 transition-transform duration-200 ease-out',
          active ? 'text-blue-200' : 'text-slate-400 group-hover:scale-[1.04] group-hover:text-slate-200'
        )}
        strokeWidth={1.75}
      />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
    </button>
  );
}
