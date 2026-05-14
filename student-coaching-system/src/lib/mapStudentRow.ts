import type { Database } from './supabase';
import type { ClassLevel, Coach, Student } from '../types';
import { inferProgramName } from '../types';

export type ApiStudentRow = Database['public']['Tables']['students']['Row'];
export type ApiCoachRow = Database['public']['Tables']['coaches']['Row'];

/**
 * `students.class_level` (metin/rakam/null) → uygulama `ClassLevel`.
 * Boş string `Number('') === 0` tuzağından kaçınır; geçersiz değer → undefined (yanlış 9/10 atamayız).
 */
export function normalizeClassLevel(raw: unknown): ClassLevel | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return undefined;
    const n = Math.trunc(raw);
    if (n >= 3 && n <= 12) return n as ClassLevel;
    return undefined;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    if (trimmed === 'LGS' || trimmed === 'YOS' || trimmed.startsWith('YKS-')) return trimmed as ClassLevel;
    const parsed = parseInt(trimmed, 10);
    if (!Number.isNaN(parsed) && parsed >= 3 && parsed <= 12) return parsed as ClassLevel;
  }
  return undefined;
}

/** API students satırı → uygulama Student (AppContext ile aynı). */
export function studentRowToStudent(s: ApiStudentRow): Student {
  const classLevel = normalizeClassLevel(s.class_level);
  return {
    id: s.id,
    name: s.name,
    email: s.email,
    platformUserId: s.platform_user_id || undefined,
    phone: s.phone || '',
    birthDate: s.birth_date || undefined,
    ...(classLevel !== undefined ? { classLevel } : {}),
    school: s.school || undefined,
    parentName: s.parent_name || undefined,
    parentPhone: s.parent_phone || '',
    coachId: s.coach_id || undefined,
    institutionId: s.institution_id || undefined,
    programId: s.program_id || undefined,
    programName: inferProgramName(classLevel),
    createdAt: s.created_at
  };
}

/** API coaches satırı → uygulama Coach */
export function coachRowToCoach(c: ApiCoachRow): Coach {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone || undefined,
    subjects: c.specialties || [],
    studentIds: c.student_ids || [],
    institutionId: c.institution_id || undefined,
    createdAt: c.created_at
  };
}
