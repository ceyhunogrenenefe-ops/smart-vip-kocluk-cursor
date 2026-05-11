// Türkçe: Ana Layout — mobil hamburger çekmece, masaüstünde geniş / dar sidebar
import React, { useCallback, useEffect, useState } from 'react';
import Sidebar, { SIDEBAR_DESKTOP_WIDE_KEY } from './Sidebar';
import TopBar from './TopBar';
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

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => {
      if (mq.matches) setMobileDrawerOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
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
    <div className="min-h-screen min-h-[100dvh] bg-slate-50">
      {/*
        Z-index: ana kolon altta (beyaz TopBar drawer altında kalmalı).
        Scrim → drawer sırası; böylece beyaz üzerine binme olmaz.
      */}
      <div
        className={cn(
          'relative z-0 flex min-w-0 flex-1 flex-col transition-[margin] duration-300 ease-out',
          desktopWide ? 'lg:ml-64' : 'lg:ml-[72px]'
        )}
      >
        <TopBar drawerOpen={mobileDrawerOpen} onMenuClick={toggleMobileDrawer} />

        <main className="max-w-[100vw] flex-1 px-3 py-4 pb-safe sm:px-5 sm:py-6 lg:px-6 lg:py-6">
          {children}
        </main>
      </div>

      {mobileDrawerOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-[100] bg-slate-950/55 backdrop-blur-sm transition-opacity duration-300 lg:hidden"
          aria-label="Menüyü kapat"
          onClick={() => setMobileDrawerOpen(false)}
        />
      ) : null}

      <Sidebar
        mobileOpen={mobileDrawerOpen}
        onMobileOpenChange={setMobileDrawerOpen}
        desktopWide={desktopWide}
        onDesktopWideChange={setDesktopWide}
      />
    </div>
  );
}
