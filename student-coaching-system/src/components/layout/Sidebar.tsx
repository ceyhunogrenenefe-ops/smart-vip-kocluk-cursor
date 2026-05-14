// Türkçe: Sol navigasyon — SaaS tarzı koyu tema, accordion gruplar, daraltılabilir rail
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Settings,
  TrendingUp,
  Video
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { userRoleTags } from '../../config/rolePermissions';
import { cn } from '../../lib/utils';
import {
  getFlatMenuForRoles,
  structureNavFromFlat,
  STUDENT_PANEL_SUBMENU_ITEMS,
  type FlatNavItem
} from './sidebar/navModel';
import { SidebarNavLink } from './sidebar/SidebarNavLink';
import { SidebarNavGroup } from './sidebar/SidebarNavGroup';

export const SIDEBAR_DESKTOP_WIDE_KEY = 'sidebar-desktop-wide';

export type SidebarProps = {
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  desktopWide: boolean;
  onDesktopWideChange: (wide: boolean) => void;
};

export default function Sidebar({
  mobileOpen,
  onMobileOpenChange,
  desktopWide,
  onDesktopWideChange
}: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { effectiveUser } = useAuth();
  const { institution } = useApp();

  const tags = userRoleTags(effectiveUser);
  const flat = useMemo(() => getFlatMenuForRoles(tags), [tags]);
  const nav = useMemo(() => structureNavFromFlat(flat), [flat]);
  const isStudentOnlyNav =
    tags.includes('student') &&
    !tags.some((t) => ['super_admin', 'admin', 'coach', 'teacher'].includes(t));
  const hasGroupedSection =
    nav.lessons.length > 0 ||
    nav.academic.length > 0 ||
    nav.orgSystem.length > 0 ||
    nav.settings.length > 0;

  const [isLg, setIsLg] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const fn = () => setIsLg(mq.matches);
    fn();
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  /** Mobil çekmecede her zaman etiketler; dar rail yalnızca lg+ */
  const railCollapsed = !desktopWide && isLg;

  const afterNavigate = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      onMobileOpenChange(false);
    }
  };

  const go = (path: string) => {
    navigate(path);
    afterNavigate();
  };

  const persistWide = (wide: boolean) => {
    onDesktopWideChange(wide);
    try {
      localStorage.setItem(SIDEBAR_DESKTOP_WIDE_KEY, wide ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  const renderRestLink = (item: FlatNavItem) => {
    const active =
      location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
    return (
      <SidebarNavLink
        key={item.path}
        label={item.label}
        icon={item.icon}
        active={active}
        collapsed={railCollapsed}
        onNavigate={() => go(item.path)}
      />
    );
  };

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-[110] flex min-h-0 h-screen max-h-[100dvh] flex-col overflow-hidden',
        'border-r border-slate-400/25 text-white',
        'bg-gradient-to-b from-slate-800 via-slate-800 to-slate-950',
        '[box-shadow:inset_1px_0_0_0_rgba(255,255,255,0.045)]',
        'shadow-[4px_0_32px_-12px_rgba(15,23,42,0.45)] transition-[width,transform] duration-300 ease-out',
        'max-lg:border-r-2 max-lg:border-slate-700/60 max-lg:rounded-r-3xl max-lg:shadow-[12px_0_48px_-8px_rgba(0,0,0,0.55)]',
        mobileOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full',
        'max-lg:w-[min(19.5rem,calc(100vw-1rem))]',
        desktopWide ? 'lg:w-64' : 'lg:w-[72px]'
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          'flex h-14 flex-shrink-0 items-center border-b border-slate-500/40 bg-slate-950/35 px-3 backdrop-blur-md transition-all duration-300 max-lg:bg-slate-950/55 max-lg:border-slate-600/50',
          railCollapsed && isLg && 'lg:justify-center lg:px-2'
        )}
      >
        {institution.logo ? (
          <img
            src={institution.logo}
            alt=""
            className="h-9 w-9 shrink-0 rounded-lg bg-slate-100 object-contain p-0.5 ring-2 ring-slate-600/40 shadow-md"
          />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-slate-900/25 ring-1 ring-white/15">
            <TrendingUp className="h-5 w-5 text-white" strokeWidth={2} />
          </div>
        )}
        {(!railCollapsed || !isLg) && (
          <div className="ml-2.5 min-w-0 flex-1 max-lg:block lg:block">
            <p className="truncate text-sm font-semibold tracking-tight text-white">{institution.name}</p>
            <p className="truncate text-[10px] font-medium uppercase tracking-wider text-slate-300/90">Smart Coach</p>
          </div>
        )}
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-2 py-3">
        {isStudentOnlyNav ? (
          <SidebarNavGroup
            id="studentPanel"
            label="Öğrenci Paneli"
            icon={LayoutDashboard}
            items={STUDENT_PANEL_SUBMENU_ITEMS}
            pathname={location.pathname}
            collapsed={railCollapsed}
            onNavigate={go}
            itemMatchExact
          />
        ) : null}

        {/* Panel */}
        {nav.panels.map((p) => {
          const active =
            location.pathname === p.path || location.pathname.startsWith(`${p.path}/`);
          return (
            <SidebarNavLink
              key={p.path}
              label={p.label}
              icon={p.icon}
              active={active}
              collapsed={railCollapsed}
              onNavigate={() => go(p.path)}
            />
          );
        })}

        {hasGroupedSection ? (
          <>
            <div className="my-2 h-px bg-gradient-to-r from-transparent via-slate-400/35 to-transparent" />
            <SidebarNavGroup
              id="lessons"
              label="Ders & Görüşmeler"
              icon={Video}
              items={nav.lessons}
              pathname={location.pathname}
              collapsed={railCollapsed}
              onNavigate={go}
            />
            <SidebarNavGroup
              id="academic"
              label="Akademik Takip"
              icon={BarChart3}
              items={nav.academic}
              pathname={location.pathname}
              collapsed={railCollapsed}
              onNavigate={go}
            />
            <SidebarNavGroup
              id="org"
              label="Kurum & Sistem"
              icon={Building2}
              items={nav.orgSystem}
              pathname={location.pathname}
              collapsed={railCollapsed}
              onNavigate={go}
            />
            {nav.settings.length > 0 ? (
              <SidebarNavGroup
                id="settings"
                label="Ayarlar"
                icon={Settings}
                items={nav.settings}
                pathname={location.pathname}
                collapsed={railCollapsed}
                onNavigate={go}
              />
            ) : null}
          </>
        ) : null}

        {nav.rest.length > 0 ? (
          <>
            <div className="my-2 h-px bg-gradient-to-r from-transparent via-slate-400/35 to-transparent" />
            <div className="flex flex-col gap-0.5">{nav.rest.map(renderRestLink)}</div>
          </>
        ) : null}
      </nav>

      {/* Desktop: geniş / dar */}
      <div className="hidden flex-shrink-0 border-t border-slate-500/30 p-2 lg:block">
        <button
          type="button"
          onClick={() => persistWide(!desktopWide)}
          title={desktopWide ? 'Menüyü daralt' : 'Menüyü genişlet'}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-slate-300 transition-all duration-200 hover:bg-white/10 hover:text-white"
        >
          {desktopWide ? (
            <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
          ) : (
            <ChevronRight className="h-5 w-5" strokeWidth={1.75} />
          )}
        </button>
      </div>
    </aside>
  );
}
