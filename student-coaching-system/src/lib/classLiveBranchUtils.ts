import type { Student } from '../types';
import { turkishFold } from './userBulkImport';

export function compactLevelKey(s: string): string {
  return turkishFold(String(s)).replace(/[\s\-_/]/g, '');
}

/** Grup sınıfı seviye + şubesi seçiliyken yalnızca eşleşen öğrenciler (students.school = şube) */
export function studentMatchesClassLevelAndBranch(
  s: Student,
  classLevel: string | null | undefined,
  classBranch: string | null | undefined
): boolean {
  const lv = String(classLevel || '').trim();
  if (!lv) return true;
  const stLev = String(s.classLevel ?? '').trim();
  if (!stLev) return false;
  const levelOk =
    compactLevelKey(stLev) === compactLevelKey(lv) ||
    compactLevelKey(stLev).includes(compactLevelKey(lv)) ||
    compactLevelKey(lv).includes(compactLevelKey(stLev));
  if (!levelOk) return false;
  const br = String(classBranch || '').trim();
  if (!br) return true;
  const sch = String(s.school ?? '').trim();
  if (!sch) return false;
  return compactLevelKey(sch) === compactLevelKey(br);
}

/** Kullanıcı yönetimindeki öğrenci şubeleri (school) + mevcut sınıf şubeleri */
export function collectInstitutionBranchOptions(
  students: Student[],
  extraBranches: Array<string | null | undefined> = []
): string[] {
  const set = new Set<string>();
  for (const s of students) {
    const b = String(s.school ?? '').trim();
    if (b) set.add(b);
  }
  for (const b of extraBranches) {
    const t = String(b ?? '').trim();
    if (t) set.add(t);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'tr', { sensitivity: 'base' }));
}

export function branchSelectOptions(branchOptions: string[], current?: string | null): string[] {
  const cur = String(current ?? '').trim();
  if (!cur) return branchOptions;
  if (branchOptions.some((b) => compactLevelKey(b) === compactLevelKey(cur))) return branchOptions;
  return [cur, ...branchOptions];
}
