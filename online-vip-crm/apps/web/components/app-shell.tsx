'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
  Users,
  GraduationCap,
  Target,
  GitBranch,
  CheckSquare,
  BarChart3,
  Building2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { InstitutionSwitcher } from '@/components/institution-switcher';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/inbox', label: 'Gelen Kutusu', icon: MessageSquare },
  { href: '/contacts', label: 'Kişiler', icon: Users },
  { href: '/students', label: 'Öğrenciler', icon: GraduationCap },
  { href: '/leads', label: 'Leadler', icon: Target },
  { href: '/pipelines', label: 'Pipeline', icon: GitBranch },
  { href: '/tasks', label: 'Görevler', icon: CheckSquare },
  { href: '/calendar', label: 'Takvim', icon: CalendarDays },
  { href: '/reports', label: 'Raporlar', icon: BarChart3 },
  { href: '/settings/profile', label: 'Ayarlar', icon: Settings },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userLabel, setUserLabel] = useState('Kullanıcı');

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/proxy/auth/me', { credentials: 'same-origin' })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json() as Promise<{
          user?: { email?: string; firstName?: string; lastName?: string };
        }>;
      })
      .then((data) => {
        if (cancelled || !data?.user) return;
        const name = [data.user.firstName, data.user.lastName]
          .filter(Boolean)
          .join(' ');
        setUserLabel(name || data.user.email || 'Kullanıcı');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-brand-background">
      <div className="flex min-h-screen">
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200/80 bg-white transition-transform duration-300 lg:static lg:translate-x-0',
            open ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
            <Link href="/dashboard" className="group block animate-slide-in">
              <p className="font-display text-xl font-semibold tracking-tight text-brand-text transition-colors group-hover:text-brand-primary">
                Online VIP CRM
              </p>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                Omnichannel CRM
              </p>
            </Link>
            <button
              type="button"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-50 lg:hidden"
              onClick={() => setOpen(false)}
              aria-label="Menüyü kapat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="border-b border-slate-100 px-4 py-3">
            <InstitutionSwitcher />
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
            {NAV.map((item, index) => {
              const active =
                pathname === item.href ||
                (item.href !== '/dashboard' && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{ animationDelay: `${index * 30}ms` }}
                  className={cn(
                    'animate-slide-in flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-gradient-to-r from-brand-primary/10 to-brand-secondary/10 text-brand-secondary'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                  )}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4',
                      active ? 'text-brand-primary' : 'text-slate-400',
                    )}
                  />
                  {item.label}
                </Link>
              );
            })}
            <Link
              href="/super-admin/institutions"
              className={cn(
                'mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                pathname.startsWith('/super-admin')
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:bg-slate-50',
              )}
            >
              <Building2 className="h-4 w-4" />
              Süper Admin
            </Link>
          </nav>

          <div className="relative border-t border-slate-100 p-3">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left hover:bg-slate-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {userLabel}
                </p>
                <p className="text-xs text-slate-400">Hesap menüsü</p>
              </div>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-slate-400 transition-transform',
                  menuOpen && 'rotate-180',
                )}
              />
            </button>
            {menuOpen ? (
              <div className="absolute bottom-16 left-3 right-3 rounded-xl border border-slate-200 bg-white p-1 shadow-soft">
                <Link
                  href="/settings/profile"
                  className="block rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Profil
                </Link>
                <button
                  type="button"
                  onClick={logout}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" />
                  Çıkış yap
                </button>
              </div>
            ) : null}
          </div>
        </aside>

        {open ? (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-slate-900/30 backdrop-blur-[1px] lg:hidden"
            aria-label="Menü arka planı"
            onClick={() => setOpen(false)}
          />
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200/80 bg-white/85 px-4 py-3 backdrop-blur md:px-6 lg:hidden">
            <button
              type="button"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-50"
              onClick={() => setOpen(true)}
              aria-label="Menüyü aç"
            >
              <Menu className="h-5 w-5" />
            </button>
            <p className="font-display text-lg font-semibold text-brand-text">
              Online VIP CRM
            </p>
          </header>
          <main className="flex-1 px-4 py-5 md:px-6 md:py-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
