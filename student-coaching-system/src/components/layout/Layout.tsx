// Türkçe: Ana Layout — masaüstünde sabit sidebar, yalnızca içerik kayar
import React, { useCallback, useEffect, useState } from 'react';
import Sidebar, { SIDEBAR_DESKTOP_WIDE_KEY } from './Sidebar';
import TopBar from './TopBar';
import StudentMobileTabBar from './StudentMobileTabBar';
import { useStudentMobileShell } from '../../hooks/useStudentMobileShell';
import { cn } from '../../lib/utils';

function readDesktopWideInitial(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(SIDEBAR_DESKTOP_WIDE_KEY) !== '0';
  } catch {
    return true;
  }
}

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [desktopWide, setDesktopWide] = useState(readDesktopWideInitial);
  const studentMobileShell = useStudentMobileShell();

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => {
      if (mq.matches) setMobileDrawerOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  /** Kabuk: body scroll kapalı, kaydırma yalnızca main içinde (mobil + masaüstü) */
  useEffect(() => {
    document.documentElement.classList.add('app-shell');
    return () => {
      document.documentElement.classList.remove('app-shell');
    };
  }, []);

  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileDrawerOpen]);

  const toggleMobileDrawer = useCallback(() => {
    setMobileDrawerOpen((o) => !o);
  }, []);

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 overflow-hidden bg-slate-50">
      {!studentMobileShell ? (
        <Sidebar
          mobileOpen={mobileDrawerOpen}
          onMobileOpenChange={setMobileDrawerOpen}
          desktopWide={desktopWide}
          onDesktopWideChange={setDesktopWide}
        />
      ) : null}

      <div
        className={cn(
          'relative z-10 flex h-full min-h-0 min-w-0 flex-col bg-slate-50 lg:transition-[padding] lg:duration-300',
          !studentMobileShell && (desktopWide ? 'lg:pl-64' : 'lg:pl-[4.5rem]')
        )}
      >
        <TopBar
          drawerOpen={mobileDrawerOpen}
          onMenuClick={toggleMobileDrawer}
          hideMenuButton={studentMobileShell}
        />
        <main
          className={cn(
            'max-w-[100vw] min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5 sm:py-6 lg:px-6 lg:py-6',
            '[webkit-overflow-scrolling:touch]',
            studentMobileShell ? 'pb-24' : 'pb-safe'
          )}
        >
          {children}
        </main>
      </div>

      {studentMobileShell ? <StudentMobileTabBar /> : null}

      {!studentMobileShell && mobileDrawerOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-[140] bg-slate-950/55 backdrop-blur-sm lg:hidden"
          aria-label="Menüyü kapat"
          onClick={() => setMobileDrawerOpen(false)}
        />
      ) : null}
    </div>
  );
}
