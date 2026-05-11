import type { Coach, Student } from '../types';

/** Oturumdaki coaches.id ile listedeki kaydı eşleştirir; yoksa e-postadan dener. */
export function resolveCoachRecordId(
  role: string | undefined,
  coachId: string | undefined,
  email: string | undefined,
  coaches: Coach[]
): string | undefined {
  if (role !== 'coach') return undefined;
  const id = coachId?.trim();
  if (id && coaches.some((c) => c.id === id)) return id;
  const em = email?.trim().toLowerCase();
  if (em) {
    const hit = coaches.find((c) => c.email.trim().toLowerCase() === em);
    if (hit) return hit.id;
  }
  return undefined;
}

/** Oturumdaki students.id; liste henüz yüklenmemiş olsa bile JWT studentId güvenilir (API doğrular). */
export function resolveStudentRecordId(
  role: string | undefined,
  studentId: string | undefined,
  email: string | undefined,
  students: Student[]
): string | undefined {
  if (String(role || '').toLowerCase() !== 'student') return undefined;
  const id = studentId?.trim();
  if (id) return id;
  const em = email?.trim().toLowerCase();
  if (em) {
    const hit = students.find((s) => String(s.email || '').trim().toLowerCase() === em);
    if (hit) return hit.id;
  }
  return undefined;
}
