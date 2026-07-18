import { useEffect, useState } from 'react';
import { isNativeApp } from '../lib/nativeApp';

/**
 * Mobil uygulama kabuğu: native uygulama veya dar ekran (telefon / tablet dikey).
 * Alt sekme çubuğu, sidebar gizleme, tek scroll port — tüm roller.
 * Giriş durumundan bağımsızdır (telefonda layout gecikmesini önler).
 */
export function useMobileAppShell(): boolean {
  const [isLg, setIsLg] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const fn = () => setIsLg(mq.matches);
    fn();
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  if (isNativeApp()) return true;
  return !isLg;
}
