import React, { useEffect, useState } from 'react';
import * as Collapsible from '@radix-ui/react-collapsible';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { FlatNavItem, NavGroupKind } from './navModel';
import { pathnameMatchesGroup } from './navModel';

type Props = {
  id: NavGroupKind;
  label: string;
  icon: LucideIcon;
  items: FlatNavItem[];
  pathname: string;
  collapsed: boolean;
  onNavigate: (path: string) => void;
};

function routeInGroup(pathname: string, kind: NavGroupKind, items: FlatNavItem[]) {
  return pathnameMatchesGroup(pathname, kind, items);
}

export function SidebarNavGroup({ id, label, icon: Icon, items, pathname, collapsed, onNavigate }: Props) {
  const routeIn = routeInGroup(pathname, id, items);
  const [userOpen, setUserOpen] = useState(false);

  useEffect(() => {
    if (!routeIn) setUserOpen(false);
  }, [routeIn, pathname]);

  const mergedOpen = routeIn || userOpen;

  if (items.length === 0) return null;

  if (collapsed) {
    return (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            title={label}
            className={cn(
              'flex w-full min-h-[44px] items-center justify-center rounded-xl p-2.5 transition-all duration-200 ease-out touch-manipulation',
              routeIn
                ? 'bg-blue-500/25 text-white ring-1 ring-blue-300/45 shadow-[0_0_18px_-6px_rgba(59,130,246,0.4)]'
                : 'text-slate-300 hover:bg-white/10 hover:text-white'
            )}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="right"
            align="start"
            sideOffset={10}
            className="z-[70] min-w-[13.5rem] overflow-hidden rounded-xl border border-slate-400/25 bg-slate-900/98 p-1.5 shadow-xl shadow-black/35 backdrop-blur-xl"
          >
            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {label}
            </div>
            {items.map((it) => {
              const active = pathname === it.path || pathname.startsWith(`${it.path}/`);
              const SubIcon = it.icon;
              return (
                <DropdownMenu.Item
                  key={it.path}
                  onSelect={() => onNavigate(it.path)}
                  className={cn(
                    'flex cursor-pointer select-none items-center gap-2 rounded-lg px-2 py-2 text-[13px] outline-none transition-colors',
                    active ? 'bg-blue-500/20 text-white' : 'text-slate-200 hover:bg-white/10'
                  )}
                >
                  <SubIcon className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.75} />
                  <span className="truncate">{it.label}</span>
                </DropdownMenu.Item>
              );
            })}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    );
  }

  return (
    <Collapsible.Root
      open={mergedOpen}
      onOpenChange={(next) => {
        if (routeIn && !next) return;
        setUserOpen(next);
      }}
      className="w-full"
    >
      <Collapsible.Trigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full min-h-[44px] items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold transition-all duration-200 ease-out touch-manipulation',
            mergedOpen ? 'bg-slate-700/55 text-white shadow-inner' : 'text-white/90 hover:bg-white/12 hover:text-white'
          )}
        >
          <Icon className="h-[18px] w-[18px] shrink-0 text-slate-200" strokeWidth={1.75} />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-slate-300 transition-transform duration-300 ease-out',
              mergedOpen && 'rotate-180'
            )}
          />
        </button>
      </Collapsible.Trigger>
      <Collapsible.Content className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <ul className="space-y-0.5 pb-1 pt-0.5">
          {items.map((it) => {
            const active = pathname === it.path || pathname.startsWith(`${it.path}/`);
            const SubIcon = it.icon;
            return (
              <li key={it.path}>
                <button
                  type="button"
                  onClick={() => onNavigate(it.path)}
                  className={cn(
                    'group flex w-full min-h-[40px] items-center gap-2 rounded-lg py-2 pl-5 pr-3 text-left text-[13px] font-medium transition-all duration-200 ease-out touch-manipulation',
                    active
                      ? 'bg-blue-500/20 text-white shadow-[0_0_18px_-8px_rgba(59,130,246,0.4)] ring-1 ring-blue-300/35'
                      : 'text-slate-100/95 hover:bg-white/12 hover:text-white'
                  )}
                >
                  <span className="h-1 w-1 shrink-0 rounded-full bg-current opacity-35 group-hover:opacity-60" />
                  <SubIcon className="h-3.5 w-3.5 shrink-0 opacity-70" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
