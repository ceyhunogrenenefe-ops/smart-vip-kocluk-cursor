import type { UserRole } from '../types';

/**
 * Yetki matrisi (özet)
 *
 * - super_admin: Tüm kurumlar + yönetici oluşturma (admin_limits bootstrap) + tam API/UI.
 * - admin: institution_id kapsamı — kullanıcı/koç/öğrenci, kota ayarı (PATCH /api/quota), raporlar, WhatsApp, sistem sayfaları.
 * - coach: Yalnızca coach_id ile eşleşen öğrenciler; haftalık/kitap/yazılı/AI vb.; görüşme oluşturma.
 * - teacher: Kurum içi — users’ta yalnızca student; öğrenci POST (koç zorunlu); kullanıcı silme yok; coaches salt okuma.
 *   Haftalık/kitap/yazılı API’de yalnızca GET (kurum filtresi); PATCH/POST yok. Görüşme oluşturma yok.
 * - student: Yalnızca kendi student_id verisi.
 *
 * UI rotaları aşağıda; API ayrıca satır/kurum bazında doğrular (JWT zorunlu hassas uçlar).
 */
export const ROUTE_ALLOWED_ROLES = {
  '/dashboard': ['super_admin', 'admin', 'teacher'],
  '/students': ['super_admin', 'admin', 'coach', 'teacher'],
  '/coaches': ['super_admin', 'admin'],
  '/topics': ['super_admin', 'admin'],
  '/topic-tracking': ['super_admin', 'admin', 'coach'],
  '/exam-tracking': ['super_admin', 'admin', 'coach'],
  '/book-tracking': ['super_admin', 'admin', 'coach'],
  '/written-exam': ['super_admin', 'admin', 'coach'],
  '/pdf-import': ['super_admin', 'admin', 'coach'],
  '/analytics': ['super_admin', 'admin', 'coach'],
  '/ai-coach': ['super_admin', 'admin', 'coach'],
  '/reports': ['super_admin', 'admin'],
  '/whatsapp': ['super_admin', 'admin'],
  '/message-templates': ['super_admin', 'admin'],
  '/webhooks': ['super_admin', 'admin', 'coach'],
  '/settings': ['super_admin', 'admin', 'teacher'],
  '/tracking': ['super_admin', 'admin', 'coach'],
  '/super-admin': ['super_admin', 'admin'],
  '/user-management': ['super_admin', 'admin', 'teacher'],
  '/system-management': ['super_admin', 'admin'],
  '/student-dashboard': ['student'],
  '/student-reports': ['student'],
  '/student-analytics': ['student'],
  '/student-meetings': ['student'],
  '/coach-dashboard': ['coach'],
  '/coach-reports': ['coach'],
  '/coach-whatsapp-settings': ['coach', 'teacher'],
  '/meetings': ['super_admin', 'admin', 'coach'],
  '/live-lessons': ['super_admin', 'admin', 'teacher', 'coach']
} as const satisfies Record<string, readonly UserRole[]>;

export type ProtectedAppPath = keyof typeof ROUTE_ALLOWED_ROLES;

export function rolesForProtectedRoute(path: ProtectedAppPath): UserRole[] {
  return [...ROUTE_ALLOWED_ROLES[path]];
}
