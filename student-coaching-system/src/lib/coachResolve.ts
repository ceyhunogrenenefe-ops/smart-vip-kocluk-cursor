import type { Coach, Student } from '../types';

export type ResolveCoachRecordOpts = {
  roles?: string[];
  /** users.id — coaches.id ile aynı olabilir */
  platformUserId?: string;
};

export function userHasCoachCapability(
  role: string | undefined,
  roles?: string[]
): boolean {
  const from = Array.isArray(roles) && roles.length ? roles : [];
  const set = new Set<string>([...from, String(role || '').toLowerCase()]);
  return set.has('coach');
}

/** Oturumdaki coaches.id ile listedeki kaydı eşleştirir; yoksa e-postadan dener. */
export function resolveCoachRecordId(
  role: string | undefined,
  coachId: string | undefined,
  email: string | undefined,
  coaches: Coach[],
  opts?: ResolveCoachRecordOpts
): string | undefined {
  if (!userHasCoachCapability(role, opts?.roles)) return undefined;
  const id = coachId?.trim();
  if (id && coaches.some((c) => c.id === id)) return id;
  const platformId = opts?.platformUserId?.trim();
  if (platformId && coaches.some((c) => c.id === platformId)) return platformId;
  const em = email?.trim().toLowerCase();
  if (em) {
    const hit = coaches.find((c) => String(c.email || '').trim().toLowerCase() === em);
    if (hit) return hit.id;
  }
  return undefined;
}

/** Oturumdaki students.id; liste henüz yüklenmemiş olsa bile JWT studentId güvenilir (API doğrular). */
export function resolveStudentRecordId(
  role: string | undefined,
  studentId: string | undefined,
  email: string | undefined,
  students: Student[],
  opts?: { roles?: string[] }
): string | undefined {
  const roles = opts?.roles ?? [];
  const isStudent =
    String(role || '').toLowerCase() === 'student' || roles.includes('student');
  if (!isStudent) return undefined;
  const id = studentId?.trim();
  if (id) return id;
  const em = email?.trim().toLowerCase();
  if (em) {
    const hit = students.find((s) => String(s.email || '').trim().toLowerCase() === em);
    if (hit) return hit.id;
  }
  return undefined;
}
