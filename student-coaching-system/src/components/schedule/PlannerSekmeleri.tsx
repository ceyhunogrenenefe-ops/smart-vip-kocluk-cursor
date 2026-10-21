import React from 'react';
import { NavLink } from 'react-router-dom';
import { CalendarDays, FileText } from 'lucide-react';

/** Ders Programı Planlayıcısı üstündeki sekmeler: haftalık program | yazılıya hazırlık */
export default function PlannerSekmeleri() {
  const sinif = ({ isActive }: { isActive: boolean }) =>
    `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${
      isActive
        ? 'bg-[#173b70] text-white'
        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
    }`;
  return (
    <nav
      className="flex w-fit gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900"
      aria-label="Planlayıcı bölümleri"
    >
      <NavLink to="/ders-saatleri-yeni-donem" end className={sinif}>
        <CalendarDays className="h-4 w-4" /> Haftalık program
      </NavLink>
      <NavLink to="/ders-saatleri-yeni-donem/yazili-hazirlik" className={sinif}>
        <FileText className="h-4 w-4" /> Yazılıya hazırlık
      </NavLink>
    </nav>
  );
}
