import { useMemo } from 'react';
import type { SystemUser } from '../context/AuthContext';
import type { Coach, Student } from '../types';
import { resolveCoachRecordId } from './coachResolve';

export function isCoachLessonsMeetingsLocked(
  coach: Pick<Coach, 'lessonsMeetingsLocked'> | null | undefined
): boolean {
  return coach?.lessonsMeetingsLocked === true;
}

export function findStudentForUser(
  students: Student[],
  user: Pick<SystemUser, 'id' | 'email'> | null | undefined
): Student | undefined {
  if (!user) return undefined;
  const email = String(user.email || '')
    .toLowerCase()
    .trim();
  return students.find(
    (s) =>
      s.platformUserId === user.id ||
      (email && String(s.email || '').toLowerCase().trim() === email)
  );
}

export function resolveLessonsMeetingsLock(opts: {
  user: Pick<SystemUser, 'role' | 'id' | 'email' | 'coachId'> | null | undefined;
  coaches: Coach[];
  students: Student[];
}): { locked: boolean; coachName?: string; coachId?: string } {
  const { user, coaches, students } = opts;
  if (!user) return { locked: false };

  if (user.role === 'coach') {
    const coachId =
      resolveCoachRecordId(user.role, user.coachId, user.email, coaches) || user.coachId || '';
    const coach = coaches.find((c) => c.id === coachId);
    if (isCoachLessonsMeetingsLocked(coach)) {
      return { locked: true, coachName: coach?.name, coachId: coach?.id };
    }
    return { locked: false };
  }

  if (user.role === 'student') {
    const student = findStudentForUser(students, user);
    if (!student?.coachId) return { locked: false };
    const coach = coaches.find((c) => c.id === student.coachId);
    if (isCoachLessonsMeetingsLocked(coach)) {
      return { locked: true, coachName: coach?.name, coachId: coach?.id };
    }
  }

  return { locked: false };
}

export function useCoachLessonsMeetingsLock(
  user: Pick<SystemUser, 'role' | 'id' | 'email' | 'coachId'> | null | undefined,
  coaches: Coach[],
  students: Student[]
) {
  return useMemo(
    () => resolveLessonsMeetingsLock({ user, coaches, students }),
    [user, coaches, students]
  );
}
