import type { SystemUser } from '../context/AuthContext';
import type { UserRole } from '../types';
import { userRoleTags } from '../config/rolePermissions';
import { normalizeRolesFromApiUser } from './userBulkImport';

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
