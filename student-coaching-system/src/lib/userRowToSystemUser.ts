import type { SystemUser } from '../context/AuthContext';
import type { Database } from './supabase';
import type { Coach, Student } from '../types';

export type UserRow = Database['public']['Tables']['users']['Row'];

export function userRowToSystemUser(
  r: UserRow,
  opts: { coaches: Coach[]; students: Student[] }
): SystemUser {
  const base: SystemUser = {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone || undefined,
    role: r.role as SystemUser['role'],
    institutionId: r.institution_id || undefined,
    package: r.package ?? undefined,
    startDate: r.start_date ?? undefined,
    endDate: r.end_date ?? undefined,
    isActive: r.is_active,
    createdAt: r.created_at
  };
  const em = (r.email || '').toLowerCase().trim();
  if (r.role === 'coach') {
    const m = opts.coaches.find((c) => (c.email || '').toLowerCase().trim() === em);
    if (m) return { ...base, coachId: m.id };
  }
  if (r.role === 'student') {
    const m = opts.students.find((s) => (s.email || '').toLowerCase().trim() === em);
    if (m) return { ...base, studentId: m.id };
  }
  return base;
}
