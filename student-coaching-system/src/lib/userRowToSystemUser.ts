import type { SystemUser } from '../context/AuthContext';
import type { Database } from './supabase';
import type { Coach, Student } from '../types';

export type UserRow = Database['public']['Tables']['users']['Row'];

const ROLE_UI_PRIORITY: Partial<Record<SystemUser['role'], number>> = {
  super_admin: 50,
  admin: 49,
  coach: 41,
  teacher: 40,
  student: 10
};

export function userRowToSystemUser(r: UserRow, opts: { coaches: Coach[]; students: Student[] }): SystemUser {
  const rawRoles = Array.isArray((r as unknown as { roles?: string[] }).roles)
    ? ((r as unknown as { roles?: string[] }).roles || [])
        .map((x) => String(x || '').trim())
        .filter(Boolean)
    : [];
  const rolesList = (
    rawRoles.length > 0 ? [...new Set(rawRoles)] : [String(r.role || 'student')]
  ) as SystemUser['role'][];

  const effectiveRole = [...rolesList].sort(
    (a, b) => (ROLE_UI_PRIORITY[b] ?? 0) - (ROLE_UI_PRIORITY[a] ?? 0)
  )[0]!;

  const base: SystemUser = {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone || undefined,
    role: effectiveRole,
    roles: rolesList,
    institutionId: r.institution_id || undefined,
    package: r.package ?? undefined,
    startDate: r.start_date ?? undefined,
    endDate: r.end_date ?? undefined,
    isActive: r.is_active,
    createdAt: r.created_at
  };
  const em = (r.email || '').toLowerCase().trim();

  if (rolesList.includes('coach')) {
    const m = opts.coaches.find((c) => (c.email || '').toLowerCase().trim() === em);
    if (m) return { ...base, coachId: m.id };
  }
  if (rolesList.includes('student')) {
    const m = opts.students.find((s) => (s.email || '').toLowerCase().trim() === em);
    if (m) return { ...base, studentId: m.id };
  }
  return base;
}
