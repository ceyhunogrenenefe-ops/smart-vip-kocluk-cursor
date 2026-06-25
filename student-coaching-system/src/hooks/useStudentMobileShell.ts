import { useAuth } from '../context/AuthContext';
import { userRoleTags } from '../config/rolePermissions';
import { useMobileAppShell } from './useMobileAppShell';

/**
 * Öğrenci-only mobil kabuk (ör. öğrenci takvim görünümü).
 * Genel layout için useMobileAppShell kullanın.
 */
export function useStudentMobileShell(): boolean {
  const mobileAppShell = useMobileAppShell();
  const { effectiveUser } = useAuth();
  const tags = userRoleTags(effectiveUser);
  const isStudentOnly =
    tags.includes('student') &&
    !tags.some((t) => ['super_admin', 'admin', 'coach', 'teacher'].includes(t));

  return mobileAppShell && isStudentOnly;
}
