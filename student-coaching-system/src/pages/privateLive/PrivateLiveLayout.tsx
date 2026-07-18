import React, { useMemo } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Calendar,
  Users,
  Package,
  Wallet,
  History,
  BarChart3,
  Radio
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { userRoleTags, userHasAnyRole } from '../../config/rolePermissions';
import { cn } from '../../lib/utils';

type Tab = { to: string; label: string; icon: React.ElementType; end?: boolean };

export default function PrivateLiveLayout() {
  const { effectiveUser } = useAuth();
  const location = useLocation();
  const tags = userRoleTags(effectiveUser);
  const isStudent =
    tags.includes('student') &&
    !tags.some((t) => ['super_admin', 'admin', 'coach', 'teacher'].includes(t));
  const canPayments = userHasAnyRole(effectiveUser, ['super_admin', 'admin', 'coach']);
  const canPackages = userHasAnyRole(effectiveUser, ['super_admin', 'admin']);

  const tabs: Tab[] = useMemo(() => {
    if (isStudent) {
      return [
        { to: '/canli-ozel-ders', label: 'Özet', icon: LayoutDashboard, end: true },
        { to: '/canli-ozel-ders/takvim', label: 'Takvim', icon: Calendar },
        { to: '/canli-ozel-ders/gecmis', label: 'Geçmiş', icon: History }
      ];
    }
    const list: Tab[] = [
      { to: '/canli-ozel-ders', label: 'Gösterge', icon: LayoutDashboard, end: true },
      { to: '/canli-ozel-ders/derslerim', label: 'Özel Derslerim', icon: Radio },
      { to: '/canli-ozel-ders/takvim', label: 'Takvim', icon: Calendar },
      { to: '/canli-ozel-ders/ogrenciler', label: 'Öğrenciler', icon: Users }
    ];
    if (canPackages) list.push({ to: '/canli-ozel-ders/paketler', label: 'Paketler', icon: Package });
    if (canPayments) list.push({ to: '/canli-ozel-ders/odemeler', label: 'Ödemeler', icon: Wallet });
    list.push(
      { to: '/canli-ozel-ders/gecmis', label: 'Ders Geçmişi', icon: History },
      { to: '/canli-ozel-ders/raporlar', label: 'Raporlar', icon: BarChart3 }
    );
    return list;
  }, [isStudent, canPayments, canPackages]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 px-4 py-4 text-white shadow-sm sm:px-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-200/90">
          Online VIP Dershane
        </p>
        <h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">Canlı Özel Ders</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-300">
          {isStudent
            ? 'Yaklaşan dersleriniz, kalan hakkınız ve kayıtlarınız.'
            : 'Takvim, paket, yoklama ve ders süreci — tek panelden yönetim.'}
        </p>
      </div>

      <nav
        className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Canlı özel ders sekmeleri"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors touch-manipulation',
                  isActive || (tab.end === false && location.pathname.startsWith(tab.to) && tab.to !== '/canli-ozel-ders')
                    ? 'border-indigo-300 bg-indigo-600 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                )
              }
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {tab.label}
            </NavLink>
          );
        })}
      </nav>

      <Outlet />
    </div>
  );
}
