import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { userRoleTags } from '../config/rolePermissions';
import { isNativeApp } from '../lib/nativeApp';

/**
 * Öğrenci mobil kabuk: native uygulama veya dar ekran (telefon web).
 * Alt sekme çubuğu + sidebar gizleme.
 */
export function useStudentMobileShell(): boolean {
  const { effectiveUser } = useAuth();
  const tags = userRoleTags(effectiveUser);
  const isStudentOnly =
    tags.includes('student') &&
    !tags.some((t) => ['super_admin', 'admin', 'coach', 'teacher'].includes(t));

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

  if (!isStudentOnly) return false;
  if (isNativeApp()) return true;
  return !isLg;
}
