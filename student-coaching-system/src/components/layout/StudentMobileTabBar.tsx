import React from 'react';
import { NavLink } from 'react-router-dom';
import { Calendar, BarChart3, CircleHelp, Sparkles, User, Video } from 'lucide-react';
import { cn } from '../../lib/utils';

const TABS = [
  { path: '/weekly-planner', label: 'Plan', icon: Calendar, end: false },
  { path: '/student-analytics', label: 'Analiz', icon: BarChart3, end: false },
  { path: '/class-schedule', label: 'Dersler', icon: Video, end: false },
  { path: '/academic-center', label: 'Merkez', icon: Sparkles, end: false },
  { path: '/soru-sor', label: 'Soru', icon: CircleHelp, end: false },
  { path: '/my-profile', label: 'Profil', icon: User, end: false }
] as const;

/** Öğrenci mobil — alt sekme navigasyonu */
export default function StudentMobileTabBar() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[150] border-t border-slate-200/90 bg-white/95 pb-safe backdrop-blur-md supports-[backdrop-filter]:bg-white/90"
      aria-label="Ana menü"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-6 items-stretch px-0.5 pt-1">
        {TABS.map(({ path, label, icon: Icon, end }) => (
          <li key={path} className="min-w-0">
            <NavLink
              to={path}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex min-h-[50px] flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 py-1 text-[9px] font-semibold leading-tight transition-colors touch-manipulation sm:text-[10px]',
                  isActive
                    ? 'text-indigo-700 bg-indigo-50'
                    : 'text-slate-500 hover:text-slate-800 active:bg-slate-100'
                )
              }
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
              <span className="truncate max-w-full">{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
