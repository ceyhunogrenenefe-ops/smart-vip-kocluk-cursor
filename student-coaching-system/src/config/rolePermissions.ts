import type { UserRole } from '../types';

/**
 * Yetki matrisi (özet)
 *
 * - super_admin: Tüm kurumlar + yönetici oluşturma (admin_limits bootstrap) + tam API/UI.
 * - admin: institution_id kapsamı — kullanıcı/koç/öğrenci, kota ayarı (PATCH /api/quota), raporlar, WhatsApp, sistem sayfaları.
 * - coach: Yalnızca coach_id ile eşleşen öğrenciler; haftalık/kitap/yazılı/AI vb.; görüşme oluşturma; Ayarlar (yoklama raporu dahil).
 * - teacher: Kurum içi — users’ta yalnızca student; öğrenci POST (koç zorunlu); kullanıcı silme yok; coaches salt okuma.
 *   Haftalık/kitap/yazılı API’de yalnızca GET (kurum filtresi); PATCH/POST yok. Görüşme oluşturma yok.
 * - student: Yalnızca kendi student_id verisi.
 *
 * UI rotaları aşağıda; API ayrıca satır/kurum bazında doğrular (JWT zorunlu hassas uçlar).
 */
export const ROUTE_ALLOWED_ROLES = {
  '/dashboard': ['super_admin', 'admin', 'teacher'],
  '/students': ['super_admin', 'admin', 'coach', 'teacher'],
  '/teachers': ['super_admin', 'admin', 'coach'],
  '/coaches': ['super_admin', 'admin'],
  '/topics': ['super_admin', 'admin'],
  '/topic-tracking': ['admin', 'coach'],
  '/exam-tracking': ['admin', 'coach'],
  '/book-tracking': ['admin', 'coach'],
  '/written-exam': ['admin', 'coach'],
  '/pdf-import': ['admin', 'coach'],
  '/analytics': ['admin', 'coach'],
  '/ai-coach': ['super_admin', 'admin', 'coach'],
  '/reports': ['admin'],
  '/whatsapp': ['admin'],
  '/message-templates': ['admin', 'super_admin'],
  '/webhooks': ['super_admin', 'admin', 'coach'],
  '/settings': ['super_admin', 'admin', 'teacher', 'coach'],
  '/tracking': ['admin', 'coach'],
  '/weekly-planner': ['super_admin', 'admin', 'coach', 'student'],
  '/academic-center': ['super_admin', 'admin', 'coach', 'student', 'teacher'],
  '/super-admin': ['super_admin', 'admin'],
  '/user-management': ['super_admin', 'admin'],
  '/subscription': ['super_admin', 'admin'],
  '/system-management': ['super_admin', 'admin'],
  '/student-dashboard': ['student'],
  '/student-reports': ['student'],
  '/student-analytics': ['student'],
  '/student-meetings': ['student'],
  '/coach-dashboard': ['coach'],
  '/coach-reports': ['coach'],
  '/coach-whatsapp-settings': ['super_admin', 'admin', 'coach', 'teacher'],
  '/meetings': ['super_admin', 'admin', 'coach'],
  '/live-lessons': ['super_admin', 'admin', 'teacher', 'coach'],
  '/teacher-panel': ['teacher'],
  '/class-live-lessons': ['super_admin', 'admin', 'coach', 'teacher'],
  '/class-schedule': ['student'],
  '/pdf-contract-hub': ['super_admin', 'admin', 'coach'],
  '/student-contracts': ['student']
} as const satisfies Record<string, readonly UserRole[]>;

export type ProtectedAppPath = keyof typeof ROUTE_ALLOWED_ROLES;

export function rolesForProtectedRoute(path: ProtectedAppPath): UserRole[] {
  return [...ROUTE_ALLOWED_ROLES[path]];
}

/** JWT / kullanıcı satırı `roles[]` ile birincil `role` tekilleştirilir */
export type UserWithRoleTags = { role: UserRole; roles?: UserRole[] };

export function userRoleTags(user: UserWithRoleTags | null | undefined): UserRole[] {
  if (!user) return [];
  const from = Array.isArray(user.roles) && user.roles.length ? user.roles : [];
  const set = new Set<UserRole>([...from, user.role]);
  return [...set];
}

export function userHasAnyRole(
  user: UserWithRoleTags | null | undefined,
  allowed: readonly UserRole[]
): boolean {
  if (!allowed.length) return true;
  const tags = userRoleTags(user);
  return tags.some((t) => (allowed as readonly UserRole[]).includes(t));
}
