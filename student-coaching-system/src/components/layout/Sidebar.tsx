// Türkçe: Sol navigasyon — SaaS tarzı koyu tema, accordion gruplar, daraltılabilir rail
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  MessageCircle,
  Settings,
  Users,
  Video
} from 'lucide-react';
import { DEFAULT_BRAND_LOGO } from '../../lib/brandAssets';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { userRoleTags, userHasAnyRole } from '../../config/rolePermissions';
import { cn } from '../../lib/utils';
import {
  getFlatMenuForRoles,
  structureNavFromFlat,
  STUDENT_PANEL_SUBMENU_ITEMS,
  STUDENT_LESSON_NAV_ITEMS,
  STUDENT_NAV_ACADEMIC_CENTER,
  STUDENT_NAV_SORU_SOR,
  STUDENT_NAV_YARDIM,
  NAV_MY_PROFILE,
  NAV_KITAP_SIPARISLERI,
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
  const showBookOrdersNav = userHasAnyRole(effectiveUser, ['super_admin', 'admin']);
  const restNav = useMemo(
    () => (showBookOrdersNav ? nav.rest.filter((it) => it.path !== NAV_KITAP_SIPARISLERI.path) : nav.rest),
    [nav.rest, showBookOrdersNav]
  );
  const isStudentOnlyNav =
    tags.includes('student') &&
    !tags.some((t) => ['super_admin', 'admin', 'coach', 'teacher'].includes(t));
  const hasGroupedSection =
    Boolean(nav.academicCenter) ||
    nav.lessons.length > 0 ||
    nav.team.length > 0 ||
    nav.academic.length > 0 ||
    nav.whatsapp.length > 0 ||
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
        'flex min-h-0 h-screen max-h-[100dvh] flex-col overflow-hidden',
        'max-lg:fixed max-lg:left-0 max-lg:top-0',
        mobileOpen
          ? 'max-lg:z-[160] max-lg:flex'
          : 'max-lg:hidden',
        'lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex',
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
          <img
            src={DEFAULT_BRAND_LOGO}
            alt="Online VIP Dershane"
            className="h-9 w-9 shrink-0 rounded-lg bg-white object-contain p-0.5 ring-2 ring-slate-600/40 shadow-md"
          />
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
          <>
            <SidebarNavLink
              label={STUDENT_NAV_ACADEMIC_CENTER.label}
              icon={STUDENT_NAV_ACADEMIC_CENTER.icon}
              active={
                location.pathname === STUDENT_NAV_ACADEMIC_CENTER.path ||
                location.pathname.startsWith(`${STUDENT_NAV_ACADEMIC_CENTER.path}/`)
              }
              collapsed={railCollapsed}
              onNavigate={() => go(STUDENT_NAV_ACADEMIC_CENTER.path)}
            />
            <SidebarNavGroup
              id="studentLessons"
              label="Ders & Görüşmeler"
              icon={Video}
              items={STUDENT_LESSON_NAV_ITEMS}
              pathname={location.pathname}
              collapsed={railCollapsed}
              onNavigate={go}
            />
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
            <SidebarNavLink
              label={STUDENT_NAV_SORU_SOR.label}
              icon={STUDENT_NAV_SORU_SOR.icon}
              active={
                location.pathname === STUDENT_NAV_SORU_SOR.path ||
                location.pathname.startsWith(`${STUDENT_NAV_SORU_SOR.path}/`)
              }
              collapsed={railCollapsed}
              onNavigate={() => go(STUDENT_NAV_SORU_SOR.path)}
            />
            <SidebarNavLink
              label={STUDENT_NAV_YARDIM.label}
              icon={STUDENT_NAV_YARDIM.icon}
              active={
                location.pathname === STUDENT_NAV_YARDIM.path ||
                location.pathname.startsWith(`${STUDENT_NAV_YARDIM.path}/`)
              }
              collapsed={railCollapsed}
              onNavigate={() => go(STUDENT_NAV_YARDIM.path)}
            />
            <SidebarNavLink
              label={NAV_MY_PROFILE.label}
              icon={NAV_MY_PROFILE.icon}
              active={
                location.pathname === NAV_MY_PROFILE.path ||
                location.pathname.startsWith(`${NAV_MY_PROFILE.path}/`)
              }
              collapsed={railCollapsed}
              onNavigate={() => go(NAV_MY_PROFILE.path)}
            />
          </>
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

        {showBookOrdersNav ? (
          <SidebarNavLink
            label={NAV_KITAP_SIPARISLERI.label}
            icon={NAV_KITAP_SIPARISLERI.icon}
            active={
              location.pathname === NAV_KITAP_SIPARISLERI.path ||
              location.pathname.startsWith(`${NAV_KITAP_SIPARISLERI.path}/`)
            }
            collapsed={railCollapsed}
            onNavigate={() => go(NAV_KITAP_SIPARISLERI.path)}
          />
        ) : null}

        {hasGroupedSection ? (
          <>
            <div className="my-2 h-px bg-gradient-to-r from-transparent via-slate-400/35 to-transparent" />
            {nav.academicCenter ? (
              <SidebarNavLink
                label={nav.academicCenter.label}
                icon={nav.academicCenter.icon}
                active={
                  location.pathname === nav.academicCenter.path ||
                  location.pathname.startsWith(`${nav.academicCenter.path}/`)
                }
                collapsed={railCollapsed}
                onNavigate={() => go(nav.academicCenter!.path)}
              />
            ) : null}
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
              id="team"
              label="Öğrenci ve Ekip"
              icon={Users}
              items={nav.team}
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
              id="whatsapp"
              label="WhatsApp"
              icon={MessageCircle}
              items={nav.whatsapp}
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

        {restNav.length > 0 ? (
          <>
            <div className="my-2 h-px bg-gradient-to-r from-transparent via-slate-400/35 to-transparent" />
            <div className="flex flex-col gap-0.5">{restNav.map(renderRestLink)}</div>
          </>
        ) : null}
      </nav>

      {/* Desktop: geniş / dar */}
      <div className="hidden flex-shrink-0 border-t border-slate-500/30 p-2 lg:block">
        <button
          type="button"
          onClick={() => persistWide(!desktopWide)}
          title={desktopWide ? 'Menüyü daralt' : 'Menüyü genişlet'}
          className="flex min-h-[44px] w-full touch-manipulation items-center justify-center gap-2 rounded-xl py-2.5 text-slate-300 transition-all duration-200 hover:bg-white/10 hover:text-white"
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
