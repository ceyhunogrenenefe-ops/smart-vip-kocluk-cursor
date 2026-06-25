import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { isNativeApp } from '../lib/nativeApp';

/**
 * Mobil uygulama kabuğu: native uygulama veya dar ekran (telefon / tablet dikey).
 * Alt sekme çubuğu, sidebar gizleme, tek scroll port — tüm roller.
 */
export function useMobileAppShell(): boolean {
  const { effectiveUser } = useAuth();
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

  if (!effectiveUser) return false;
  if (isNativeApp()) return true;
  return !isLg;
}
