import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { useMobileAppShell } from '../../hooks/useMobileAppShell';

/** Mobilde (yan menü gizli) Deneme Sınav Takvimi girişi — Merkez sekmesinde. */
export default function MobileExamCalendarCard() {
  const mobileAppShell = useMobileAppShell();
  if (!mobileAppShell) return null;
  return (
    <Link
      to="/deneme-takvimi"
      className="flex items-center gap-3 rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-sky-50 p-4 shadow-sm active:bg-indigo-100/60 touch-manipulation"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-sky-600 text-white shadow">
        <CalendarDays className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-slate-900">Deneme Sınav Takvimi</span>
        <span className="block text-xs text-slate-600">Yaklaşan deneme sınavların ve tarihleri</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-indigo-700" />
    </Link>
  );
}
