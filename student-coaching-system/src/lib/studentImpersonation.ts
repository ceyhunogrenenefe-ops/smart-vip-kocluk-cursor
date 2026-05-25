import type { SystemUser } from '../context/AuthContext';
import type { Student } from '../types';

/** Öğrenci kartından hesaba geçiş (taklit) hedefi */
export function studentToImpersonationTarget(student: Student): SystemUser {
  return {
    id: student.platformUserId || student.authUserId || `student-card-${student.id}`,
    name: student.name,
    email: student.email.trim(),
    phone: student.phone || undefined,
    role: 'student',
    studentId: student.id,
    institutionId: student.institutionId,
    isActive: true,
    createdAt: student.createdAt
  };
}
