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
  const [desktopShell, setDesktopShell] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false
  );
  const studentMobileShell = useStudentMobileShell();

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => {
      if (mq.matches) setMobileDrawerOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => setDesktopShell(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  /** Masaüstü: body scroll kapalı, kaydırma yalnızca main içinde */
  useEffect(() => {
    document.documentElement.classList.toggle('app-shell', desktopShell);
    return () => {
      document.documentElement.classList.remove('app-shell');
    };
  }, [desktopShell]);

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
    <div
      className={cn(
        'flex bg-slate-50',
        'max-lg:min-h-[100dvh] max-lg:flex-col',
        'lg:h-[100dvh] lg:max-h-[100dvh] lg:min-h-0 lg:overflow-hidden'
      )}
    >
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
          'relative z-10 flex min-w-0 flex-col bg-slate-50',
          'max-lg:min-h-[100dvh]',
          'lg:h-full lg:min-h-0 lg:transition-[padding] lg:duration-300',
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
            'max-w-[100vw] px-3 py-4 sm:px-5 sm:py-6 lg:px-6 lg:py-6',
            'max-lg:flex-none max-lg:touch-pan-y',
            'lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:[webkit-overflow-scrolling:touch]',
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
