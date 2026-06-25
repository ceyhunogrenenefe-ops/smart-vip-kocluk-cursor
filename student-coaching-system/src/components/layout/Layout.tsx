// Türkçe: Ana Layout — masaüstünde sabit sidebar, yalnızca içerik kayar
import React, { useCallback, useEffect, useState } from 'react';
import Sidebar, { SIDEBAR_DESKTOP_WIDE_KEY } from './Sidebar';
import TopBar from './TopBar';
import MobileTabBar from './MobileTabBar';
import { useMobileAppShell } from '../../hooks/useMobileAppShell';
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
  const mobileAppShell = useMobileAppShell();

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

  /** Masaüstü: main kayar; mobil: tek scroll port (Android Chrome) */
  useEffect(() => {
    document.documentElement.classList.toggle('app-shell', desktopShell);
    document.documentElement.classList.toggle('mobile-app-viewport', !desktopShell);
    if (!desktopShell) {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
    return () => {
      document.documentElement.classList.remove('app-shell');
      document.documentElement.classList.remove('mobile-app-viewport');
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

  const topBar = (
    <TopBar
      drawerOpen={mobileDrawerOpen}
      onMenuClick={toggleMobileDrawer}
      hideMenuButton={mobileAppShell}
    />
  );

  const mainContent = (
    <main
      className={cn(
        'w-full max-w-[100vw] px-3 py-4 sm:px-5 sm:py-6 lg:px-6 lg:py-6',
        desktopShell && 'min-h-0 flex-1 overflow-y-auto overscroll-contain [webkit-overflow-scrolling:touch]',
        mobileAppShell ? 'pb-24' : 'pb-safe'
      )}
    >
      {children}
    </main>
  );

  if (!desktopShell) {
    return (
      <>
        {!mobileAppShell ? (
          <Sidebar
            mobileOpen={mobileDrawerOpen}
            onMobileOpenChange={setMobileDrawerOpen}
            desktopWide={desktopWide}
            onDesktopWideChange={setDesktopWide}
          />
        ) : null}

        <div
          className={cn(
            'mobile-scroll-port fixed inset-0 z-0 bg-slate-50',
            mobileAppShell && 'mobile-app-scroll-port student-mobile-scroll-port'
          )}
        >
          {topBar}
          {mainContent}
        </div>

        {mobileAppShell ? <MobileTabBar /> : null}

        {!mobileAppShell && mobileDrawerOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-[140] bg-slate-950/55 backdrop-blur-sm"
            aria-label="Menüyü kapat"
            onClick={() => setMobileDrawerOpen(false)}
          />
        ) : null}
      </>
    );
  }

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 overflow-hidden bg-slate-50">
      {!mobileAppShell ? (
        <Sidebar
          mobileOpen={mobileDrawerOpen}
          onMobileOpenChange={setMobileDrawerOpen}
          desktopWide={desktopWide}
          onDesktopWideChange={setDesktopWide}
        />
      ) : null}

      <div
        className={cn(
          'relative z-10 flex h-full min-h-0 w-full min-w-0 flex-col bg-slate-50 transition-[padding] duration-300',
          !mobileAppShell && (desktopWide ? 'lg:pl-64' : 'lg:pl-[4.5rem]')
        )}
      >
        {topBar}
        {mainContent}
      </div>

      {mobileAppShell ? <MobileTabBar /> : null}

      {!mobileAppShell && mobileDrawerOpen ? (
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
