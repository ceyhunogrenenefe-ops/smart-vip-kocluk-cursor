import type { SystemUser } from '../context/AuthContext';
import type { UserRole, Student, ClassLevel } from '../types';
import { CLASS_LEVELS, formatClassLevelLabel } from '../types';
import { userRoleTags } from '../config/rolePermissions';
import { normalizeRolesFromApiUser } from './userBulkImport';
import { normalizeClassLevel } from './mapStudentRow';

/** `users` satırı yok; yalnızca `coaches` tablosundaki profil (UserManagement listesi) */
export const COACH_PROFILE_ONLY_PREFIX = '__coach_profile__:';

export function isCoachProfileOnlyUser(id: string): boolean {
  return String(id).startsWith(COACH_PROFILE_ONLY_PREFIX);
}

export function getDaysLeftFromEndDate(endDate?: string): number | null {
  if (!endDate) return null;
  const end = new Date(endDate);
  const now = new Date();
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/** Kullanıcı yönetimi «Aktif» filtresi ile aynı mantık */
export function isUserActiveAccount(user: Pick<SystemUser, 'isActive' | 'endDate'>): boolean {
  if (user.isActive === false) return false;
  if (!user.endDate) return true;
  const daysLeft = getDaysLeftFromEndDate(user.endDate);
  if (daysLeft === null) return true;
  return daysLeft > 0;
}

export function isUserExpiredAccount(user: Pick<SystemUser, 'endDate'>): boolean {
  if (!user.endDate) return false;
  const daysLeft = getDaysLeftFromEndDate(user.endDate);
  return daysLeft !== null && daysLeft <= 0;
}

export function userHasRoleTag(
  user: Pick<SystemUser, 'role' | 'roles'>,
  role: UserRole
): boolean {
  return userRoleTags(user as { role: UserRole; roles?: UserRole[] }).includes(role);
}

export interface SystemUserStats {
  totalListed: number;
  loginAccounts: number;
  profileOnlyCoaches: number;
  admins: number;
  coaches: number;
  teachers: number;
  students: number;
  active: number;
  expired: number;
  inactive: number;
}

export function computeSystemUserStats(users: SystemUser[]): SystemUserStats {
  const loginUsers = users.filter((u) => !isCoachProfileOnlyUser(u.id));
  const staffAdmins = (u: SystemUser) =>
    userHasRoleTag(u, 'admin') || userHasRoleTag(u, 'super_admin');
  return {
    totalListed: users.length,
    loginAccounts: loginUsers.length,
    profileOnlyCoaches: users.filter((u) => isCoachProfileOnlyUser(u.id)).length,
    admins: users.filter(staffAdmins).length,
    coaches: users.filter((u) => userHasRoleTag(u, 'coach')).length,
    teachers: users.filter((u) => userHasRoleTag(u, 'teacher')).length,
    students: users.filter((u) => userHasRoleTag(u, 'student')).length,
    active: users.filter((u) => isUserActiveAccount(u)).length,
    expired: users.filter((u) => isUserExpiredAccount(u)).length,
    inactive: users.filter((u) => u.isActive === false).length
  };
}

export interface ApiUserRoleCounts {
  loginAccounts: number;
  students: number;
  coaches: number;
  teachers: number;
  admins: number;
}

export function countApiUsersByRole(
  users: { role?: string | null; roles?: unknown; institution_id?: string | null }[],
  institutionId?: string | null
): ApiUserRoleCounts {
  const scoped =
    institutionId != null && institutionId !== ''
      ? users.filter((u) => u.institution_id === institutionId)
      : users;
  const hasRole = (u: (typeof scoped)[0], role: UserRole) =>
    normalizeRolesFromApiUser(u).includes(role);
  const isAdmin = (u: (typeof scoped)[0]) =>
    hasRole(u, 'admin') || hasRole(u, 'super_admin');
  return {
    loginAccounts: scoped.length,
    students: scoped.filter((u) => hasRole(u, 'student')).length,
    coaches: scoped.filter((u) => hasRole(u, 'coach')).length,
    teachers: scoped.filter((u) => hasRole(u, 'teacher')).length,
    admins: scoped.filter(isAdmin).length
  };
}

export function buildLiveCountsByInstitution(
  users: { institution_id?: string | null; role?: string | null; roles?: unknown }[]
): Record<string, { students: number; coaches: number; teachers: number }> {
  const m: Record<string, { students: number; coaches: number; teachers: number }> = {};
  for (const u of users) {
    const iid = u.institution_id;
    if (!iid || typeof iid !== 'string') continue;
    if (!m[iid]) m[iid] = { students: 0, coaches: 0, teachers: 0 };
    const tags = normalizeRolesFromApiUser(u);
    if (tags.includes('student')) m[iid].students += 1;
    if (tags.includes('coach')) m[iid].coaches += 1;
    if (tags.includes('teacher')) m[iid].teachers += 1;
  }
  return m;
}

/** Filtre / istatistik için tutarlı sınıf anahtarı (9, LGS, YKS-Sayısal …) */
export function normalizeClassLevelFilterKey(
  level: ClassLevel | string | number | undefined | null
): string {
  if (level === undefined || level === null || level === '') return '';
  const normalized = normalizeClassLevel(level);
  if (normalized !== undefined) return String(normalized);
  return String(level).trim();
}

export function classLevelsMatch(
  level: ClassLevel | string | number | undefined | null,
  filterKey: string
): boolean {
  if (!filterKey || filterKey === 'all') return true;
  return normalizeClassLevelFilterKey(level) === normalizeClassLevelFilterKey(filterKey);
}

const CLASS_LEVEL_ORDER = CLASS_LEVELS.map((l) => String(l.value));

export function sortClassLevelKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const ia = CLASS_LEVEL_ORDER.indexOf(a);
    const ib = CLASS_LEVEL_ORDER.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b, 'tr');
  });
}

export interface ClassLevelStudentCount {
  key: string;
  label: string;
  count: number;
}

export function computeStudentsByClassLevel(students: Student[]): ClassLevelStudentCount[] {
  const counts = new Map<string, number>();
  let unknown = 0;
  for (const s of students) {
    const key = normalizeClassLevelFilterKey(s.classLevel);
    if (!key) {
      unknown += 1;
      continue;
    }
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const rows: ClassLevelStudentCount[] = sortClassLevelKeys([...counts.keys()]).map((key) => ({
    key,
    label: formatClassLevelLabel(key),
    count: counts.get(key) || 0
  }));
  if (unknown > 0) {
    rows.push({ key: '__unknown__', label: 'Sınıf belirtilmemiş', count: unknown });
  }
  return rows;
}

export interface InstitutionClassStats {
  institutionId: string;
  institutionName: string;
  total: number;
  byClass: ClassLevelStudentCount[];
}

export function computeStudentsByInstitutionAndClass(
  students: Student[],
  institutions: { id: string; name: string }[]
): InstitutionClassStats[] {
  const instName = new Map(institutions.map((i) => [i.id, i.name]));
  const byInst = new Map<string, Student[]>();
  for (const s of students) {
    const iid = s.institutionId || '__none__';
    if (!byInst.has(iid)) byInst.set(iid, []);
    byInst.get(iid)!.push(s);
  }
  return [...byInst.entries()]
    .map(([institutionId, sts]) => ({
      institutionId,
      institutionName:
        institutionId === '__none__'
          ? 'Kurumsuz'
          : instName.get(institutionId) || institutionId.slice(0, 8),
      total: sts.length,
      byClass: computeStudentsByClassLevel(sts)
    }))
    .sort((a, b) => a.institutionName.localeCompare(b.institutionName, 'tr'));
}

export function indexStudentsByPlatformLink(students: Student[]): {
  byPlatformUserId: Map<string, Student>;
  byEmail: Map<string, Student>;
  byId: Map<string, Student>;
} {
  const byPlatformUserId = new Map<string, Student>();
  const byEmail = new Map<string, Student>();
  const byId = new Map<string, Student>();
  for (const s of students) {
    byId.set(s.id, s);
    const pid = String(s.platformUserId || '').trim();
    if (pid) byPlatformUserId.set(pid, s);
    const em = (s.email || '').toLowerCase().trim();
    if (em) byEmail.set(em, s);
  }
  return { byPlatformUserId, byEmail, byId };
}

export function resolveStudentForUser(
  user: { id: string; email: string; studentId?: string },
  index: ReturnType<typeof indexStudentsByPlatformLink>
): Student | undefined {
  const uid = String(user.id || '').trim();
  const em = (user.email || '').toLowerCase().trim();
  if (uid && index.byPlatformUserId.get(uid)) return index.byPlatformUserId.get(uid);
  if (uid && index.byId.get(uid)) return index.byId.get(uid);
  if (user.studentId && index.byId.get(user.studentId)) return index.byId.get(user.studentId);
  if (em && index.byEmail.get(em)) return index.byEmail.get(em);
  return undefined;
}
