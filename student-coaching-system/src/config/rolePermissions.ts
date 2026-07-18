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
  '/students': ['super_admin', 'admin', 'coach'],
  '/teachers': ['super_admin', 'admin', 'coach'],
  '/coaches': ['super_admin', 'admin'],
  '/topics': ['super_admin', 'admin'],
  '/topic-tracking': ['admin', 'coach', 'student'],
  '/exam-tracking': ['admin', 'coach', 'student'],
  '/edesis': ['super_admin', 'admin', 'coach'],
  '/book-tracking': ['admin', 'coach'],
  '/written-exam': ['admin', 'coach'],
  '/pdf-import': ['admin', 'coach'],
  '/analytics': ['admin', 'coach'],
  '/attendance-report': ['super_admin', 'admin', 'coach', 'teacher'],
  '/coach-stats': ['super_admin', 'admin'],
  '/ai-coach': ['super_admin', 'admin', 'coach'],
  '/reports': ['admin'],
  '/whatsapp': ['admin'],
  '/message-templates': ['admin', 'super_admin'],
  '/webhooks': ['super_admin', 'admin'],
  '/settings': ['super_admin', 'admin', 'teacher'],
  '/tracking': ['admin'],
  '/weekly-planner': ['super_admin', 'admin', 'coach', 'student'],
  '/my-profile': ['super_admin', 'admin', 'coach', 'student', 'teacher'],
  '/academic-center': ['super_admin', 'admin', 'coach', 'student', 'teacher'],
  '/academic-center/bbb-join': ['super_admin', 'admin', 'coach', 'student', 'teacher'],
  '/super-admin': ['super_admin', 'admin'],
  '/user-management': ['super_admin', 'admin'],
  '/private-lesson-assignments': ['super_admin', 'admin'],
  '/subscription': ['super_admin', 'admin'],
  '/system-management': ['super_admin', 'admin'],
  '/student-dashboard': ['student'],
  '/student-reports': ['student'],
  '/student-analytics': ['student'],
  '/student-meetings': ['student'],
  '/coach-dashboard': ['coach'],
  '/coach-kilavuz': ['coach'],
  '/coach-reports': ['coach'],
  '/coach-whatsapp-settings': ['super_admin', 'admin', 'coach', 'teacher'],
  '/meetings': ['super_admin', 'admin', 'coach'],
  '/live-lessons': ['super_admin', 'admin', 'teacher', 'coach'],
  '/canli-ozel-ders': ['super_admin', 'admin', 'teacher', 'coach', 'student'],
  '/canli-ozel-ders/derslerim': ['super_admin', 'admin', 'teacher', 'coach'],
  '/canli-ozel-ders/takvim': ['super_admin', 'admin', 'teacher', 'coach', 'student'],
  '/canli-ozel-ders/ogrenciler': ['super_admin', 'admin', 'teacher', 'coach'],
  '/canli-ozel-ders/paketler': ['super_admin', 'admin'],
  '/canli-ozel-ders/odemeler': ['super_admin', 'admin', 'coach'],
  '/canli-ozel-ders/gecmis': ['super_admin', 'admin', 'teacher', 'coach', 'student'],
  '/canli-ozel-ders/raporlar': ['super_admin', 'admin', 'teacher', 'coach'],
  '/teacher-panel': ['teacher'],
  '/teacher-solution-appointments': ['teacher', 'super_admin', 'admin'],
  '/class-live-lessons': ['super_admin', 'admin', 'coach', 'teacher'],
  '/schedule-planner': ['super_admin', 'admin'],
  '/class-schedule': ['student'],
  '/veli-onay': ['super_admin', 'admin', 'coach'],
  '/tahsilat-muhasebe': ['super_admin', 'admin'],
  '/muhasebe': ['super_admin', 'admin'],
  '/soru-sor': ['student'],
  '/yardim': ['student', 'teacher', 'coach', 'admin', 'super_admin'],
  '/soru-havuzu': ['super_admin', 'admin', 'teacher', 'coach'],
  '/soru-analitik': ['super_admin', 'admin', 'coach'],
  '/notifications': ['super_admin', 'admin', 'coach'],
  '/events': ['super_admin', 'admin', 'coach'],
  '/kitap-siparisleri': ['super_admin', 'admin'],
  '/ozel-ders-talepleri': ['super_admin', 'admin'],
  '/ogretmen-profil-onaylari': ['super_admin', 'admin'],
  '/profilimi-duzenle': ['teacher', 'coach'],
  '/edu-panel': ['super_admin', 'admin', 'coach', 'teacher'],
  '/edu-derslerim': ['student'],
  '/ai-agents-admin': ['super_admin', 'admin', 'teacher', 'coach'],
  '/ai-agents': ['super_admin', 'admin', 'teacher', 'coach', 'student'],
  '/ai-agents/:id': ['super_admin', 'admin', 'teacher', 'coach', 'student'],
  '/exams': ['super_admin', 'admin', 'teacher', 'coach', 'student'],
  '/exams/take/:id': ['super_admin', 'admin', 'teacher', 'coach', 'student'],
  '/exams/result/:id': ['super_admin', 'admin', 'teacher', 'coach', 'student'],
  '/mobile/dersler': ['super_admin', 'admin', 'coach', 'teacher', 'student'],
  '/mobile/akademik': ['super_admin', 'admin', 'coach', 'teacher', 'student'],
  '/mobile/yonetim': ['super_admin', 'admin']
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
