/**
 * Eğitim programları (Dönem Programı, Deneme Kulübü, Yaz Okulu, Kitap Okuma Atölyesi …)
 * Hiyerarşi: Program → Sınıf seviyesi → Şube/Grup (classes satırı).
 * Öğrenci üyeliği = class_students satırı; bir öğrenci birden çok programda olabilir.
 */
import { apiFetch } from './session';

export type EduProgram = {
  id: string;
  institution_id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
};

export type ProgramClass = {
  id: string;
  name: string;
  class_level?: string | null;
  branch?: string | null;
  program_id?: string | null;
  institution_id?: string | null;
  student_ids?: string[];
  teacher_ids?: string[];
};

export type ProgramGroupFilter = {
  programId: string; // '' = tümü, '__none__' = programsız
  level: string; // '' = tümü
  classId: string; // '' = tümü
};

export const EMPTY_PROGRAM_FILTER: ProgramGroupFilter = { programId: '', level: '', classId: '' };

export const NO_PROGRAM = '__none__';

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

function withInst(path: string, instId?: string | null): string {
  if (!instId) return path;
  return `${path}${path.includes('?') ? '&' : '?'}institution_id=${encodeURIComponent(instId)}`;
}

export async function fetchEduPrograms(
  instId?: string | null
): Promise<{ programs: EduProgram[]; setupRequired: boolean }> {
  const res = await apiFetch(withInst('/api/edu-programs', instId));
  const j = await readJson(res);
  if (!res.ok) throw new Error(String(j.error || 'Programlar alınamadı'));
  return {
    programs: Array.isArray(j.data) ? (j.data as EduProgram[]) : [],
    setupRequired: Boolean(j.setup_required)
  };
}

export async function createEduProgram(name: string, instId?: string | null): Promise<EduProgram> {
  const res = await apiFetch('/api/edu-programs', {
    method: 'POST',
    body: JSON.stringify({ name, ...(instId ? { institution_id: instId } : {}) })
  });
  const j = await readJson(res);
  if (!res.ok) throw new Error(String(j.error || 'Program eklenemedi'));
  return j.data as EduProgram;
}

export async function updateEduProgram(
  id: string,
  patch: Partial<Pick<EduProgram, 'name' | 'is_active' | 'sort_order'>>
): Promise<EduProgram> {
  const res = await apiFetch(`/api/edu-programs?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
  const j = await readJson(res);
  if (!res.ok) throw new Error(String(j.error || 'Program güncellenemedi'));
  return j.data as EduProgram;
}

export async function fetchProgramClasses(instId?: string | null): Promise<ProgramClass[]> {
  const res = await apiFetch(withInst('/api/class-live-lessons?scope=classes', instId));
  const j = await readJson(res);
  if (!res.ok) throw new Error(String(j.error || 'Şube/grup listesi alınamadı'));
  return Array.isArray(j.data) ? (j.data as ProgramClass[]) : [];
}

async function membershipOp(op: string, classId: string, studentId: string): Promise<void> {
  const res = await apiFetch(`/api/class-live-lessons?op=${op}`, {
    method: 'POST',
    body: JSON.stringify({ class_id: classId, student_id: studentId })
  });
  const j = await readJson(res);
  if (!res.ok) throw new Error(String(j.error || 'İşlem yapılamadı'));
}

export const addStudentToClass = (classId: string, studentId: string) =>
  membershipOp('add-student-to-class', classId, studentId);

export const removeStudentFromClass = (classId: string, studentId: string) =>
  membershipOp('remove-student-from-class', classId, studentId);

/* ---------- Etiketler ---------- */

const LEVEL_ORDER = ['2', '3', '4', '5', '6', '7', 'LGS', '8', '9', '10', '11', '12', 'TYT'];

export function levelLabel(level?: string | null): string {
  const v = String(level ?? '').trim();
  if (!v) return 'Seviyesiz';
  if (/^\d+$/.test(v)) return `${v}. Sınıf`;
  if (v.toUpperCase() === 'LGS') return '8. Sınıf (LGS)';
  return v;
}

export function sortLevels(levels: string[]): string[] {
  const rank = (l: string) => {
    const i = LEVEL_ORDER.indexOf(l.toUpperCase() === 'LGS' ? 'LGS' : l);
    return i === -1 ? 100 : i;
  };
  return [...levels].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'tr'));
}

export function programNameOf(cls: ProgramClass, programsById: Map<string, EduProgram>): string {
  if (!cls.program_id) return 'Programsız';
  return programsById.get(cls.program_id)?.name || 'Program';
}

/** «Deneme Kulübü · 8. Sınıf (LGS) · A Grubu» — aynı adlı gruplar karışmasın */
export function groupLabel(cls: ProgramClass, programsById: Map<string, EduProgram>): string {
  const bits = [programNameOf(cls, programsById)];
  if (String(cls.class_level ?? '').trim()) bits.push(levelLabel(cls.class_level));
  bits.push(cls.name);
  return bits.join(' · ');
}

export function sortProgramClasses(
  classes: ProgramClass[],
  programsById: Map<string, EduProgram>
): ProgramClass[] {
  const progRank = (c: ProgramClass) =>
    c.program_id ? programsById.get(c.program_id)?.sort_order ?? 9000 : 9999;
  const allLevels = sortLevels([...new Set(classes.map((c) => String(c.class_level ?? '')))]);
  const levelRank = (c: ProgramClass) => allLevels.indexOf(String(c.class_level ?? ''));
  return [...classes].sort(
    (a, b) =>
      progRank(a) - progRank(b) ||
      programNameOf(a, programsById).localeCompare(programNameOf(b, programsById), 'tr') ||
      levelRank(a) - levelRank(b) ||
      a.name.localeCompare(b.name, 'tr', { numeric: true })
  );
}

/* ---------- Üyelik indeksi ve filtre ---------- */

export function buildMembershipIndex(classes: ProgramClass[]): Map<string, ProgramClass[]> {
  const m = new Map<string, ProgramClass[]>();
  for (const c of classes) {
    for (const sid of c.student_ids || []) {
      const arr = m.get(sid) || [];
      arr.push(c);
      m.set(sid, arr);
    }
  }
  return m;
}

/** Program / seviye / grup filtresine uyan sınıflar */
export function classesMatchingFilter(classes: ProgramClass[], f: ProgramGroupFilter): ProgramClass[] {
  return classes.filter((c) => {
    if (f.classId) return c.id === f.classId;
    if (f.programId === NO_PROGRAM ? Boolean(c.program_id) : f.programId && c.program_id !== f.programId) {
      return false;
    }
    if (f.level && String(c.class_level ?? '') !== f.level) return false;
    return true;
  });
}

export function isFilterActive(f: ProgramGroupFilter): boolean {
  return Boolean(f.programId || f.level || f.classId);
}

/** Filtre boşsa herkes geçer; doluysa öğrenci eşleşen gruplardan en az birinde olmalı. */
export function studentMatchesProgramFilter(
  studentId: string,
  f: ProgramGroupFilter,
  matchingClassIds: Set<string>,
  index: Map<string, ProgramClass[]>
): boolean {
  if (!isFilterActive(f)) return true;
  const mine = index.get(studentId) || [];
  return mine.some((c) => matchingClassIds.has(c.id));
}
