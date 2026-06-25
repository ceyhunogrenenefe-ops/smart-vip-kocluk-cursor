import React, { useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { userRoleTags } from '../../config/rolePermissions';
import { cn } from '../../lib/utils';
import { getMobileTabsForRoles, mobileTabGridClass, type MobileTabItem } from './mobileTabConfig';
import { pathnameMatchesMobileTab } from './sidebar/navModel';

function tabIsActive(tab: MobileTabItem, pathname: string): boolean {
  if (tab.matchPaths?.length) {
    return pathnameMatchesMobileTab(pathname, tab.path, tab.matchPaths);
  }
  if (tab.end) return pathname === tab.path;
  return pathname === tab.path || pathname.startsWith(`${tab.path}/`);
}

/** Mobil tarayıcı / native — rol bazlı alt sekme navigasyonu */
export default function MobileTabBar() {
  const { effectiveUser } = useAuth();
  const location = useLocation();
  const tabs = useMemo(
    () => getMobileTabsForRoles(userRoleTags(effectiveUser)),
    [effectiveUser]
  );

  if (!tabs.length) return null;

  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[150] border-t border-slate-200/90 bg-white/95 pb-safe backdrop-blur-md supports-[backdrop-filter]:bg-white/90"
      aria-label="Ana menü"
    >
      <ul
        className={cn(
          'pointer-events-auto mx-auto grid max-w-lg items-stretch px-0.5 pt-1',
          mobileTabGridClass(tabs.length)
        )}
      >
        {tabs.map((tab) => {
          const { path, label, icon: Icon, end } = tab;
          const isActive = tabIsActive(tab, location.pathname);
          return (
            <li key={path} className="min-w-0">
              <NavLink
                to={path}
                end={end}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex min-h-[50px] flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 py-1 text-[9px] font-semibold leading-tight transition-colors touch-manipulation sm:text-[10px]',
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-500 hover:text-slate-800 active:bg-slate-100'
                )}
              >
                <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="max-w-full truncate">{label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
