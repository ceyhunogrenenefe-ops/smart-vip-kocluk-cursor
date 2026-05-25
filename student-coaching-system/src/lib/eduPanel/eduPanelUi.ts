import type { EduLessonRow } from '../../types/eduPanel.types';
import { formatClassLevelLabel } from '../../types';

export const STATUS_LABEL = { draft: 'Taslak', active: 'Yayında', archived: 'Arşiv' } as const;

export const SUBJECT_DOT: Record<string, string> = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  purple: 'bg-purple-500',
  pink: 'bg-pink-500',
  gray: 'bg-gray-400'
};

export const SUBJECT_BORDER: Record<string, string> = {
  blue: 'border-l-blue-500',
  green: 'border-l-green-500',
  amber: 'border-l-amber-500',
  red: 'border-l-red-500',
  purple: 'border-l-purple-500',
  pink: 'border-l-pink-500',
  gray: 'border-l-gray-400'
};

export type ClassGroup = {
  classId: string;
  className: string;
  rows: EduLessonRow[];
};

export function groupRowsByClass(
  rows: EduLessonRow[],
  classes: { id: string; name: string }[]
): ClassGroup[] {
  const nameById = new Map(classes.map((c) => [c.id, c.name]));
  const byClass = new Map<string, EduLessonRow[]>();

  for (const row of rows) {
    const list = byClass.get(row.class_id) || [];
    list.push(row);
    byClass.set(row.class_id, list);
  }

  const groups: ClassGroup[] = [];
  for (const [classId, classRows] of byClass) {
    classRows.sort((a, b) => String(b.lesson_date).localeCompare(String(a.lesson_date)));
    groups.push({
      classId,
      className: nameById.get(classId) || 'Sınıf',
      rows: classRows
    });
  }

  groups.sort((a, b) => a.className.localeCompare(b.className, 'tr'));
  return groups;
}

export type SubjectGroup = {
  subjectName: string;
  rows: EduLessonRow[];
};

export function groupRowsBySubject(rows: EduLessonRow[]): SubjectGroup[] {
  const bySubject = new Map<string, EduLessonRow[]>();
  for (const row of rows) {
    const key = row.subject_name?.trim() || 'Ders';
    const list = bySubject.get(key) || [];
    list.push(row);
    bySubject.set(key, list);
  }
  const groups: SubjectGroup[] = [];
  for (const [subjectName, subjectRows] of bySubject) {
    subjectRows.sort((a, b) => String(b.lesson_date).localeCompare(String(a.lesson_date)));
    groups.push({ subjectName, rows: subjectRows });
  }
  groups.sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'tr'));
  return groups;
}

export type EduClassRef = {
  id: string;
  name: string;
  class_level?: string | number | null;
};

/** Kademe (class_level) → o kademeye düşen sınıflar */
export type LevelGroup = {
  levelKey: string;
  levelLabel: string;
  classIds: string[];
  classes: EduClassRef[];
  rowCount: number;
};

function normalizeLevelKey(level: string | number | null | undefined): string {
  if (level === null || level === undefined || level === '') return '__none__';
  return String(level);
}

/** Kademe bazında özet (üst seçici için). Konu sayısı dahil. */
export function buildLevelGroups(
  classes: EduClassRef[],
  rows: EduLessonRow[]
): LevelGroup[] {
  const rowCountByClass = new Map<string, number>();
  for (const r of rows) {
    rowCountByClass.set(r.class_id, (rowCountByClass.get(r.class_id) || 0) + 1);
  }
  const byLevel = new Map<string, LevelGroup>();
  for (const c of classes) {
    const key = normalizeLevelKey(c.class_level);
    const label =
      key === '__none__' ? 'Sınıf bilgisi yok' : formatClassLevelLabel(c.class_level as never);
    const g =
      byLevel.get(key) ||
      ({ levelKey: key, levelLabel: label, classIds: [], classes: [], rowCount: 0 } as LevelGroup);
    g.classIds.push(c.id);
    g.classes.push(c);
    g.rowCount += rowCountByClass.get(c.id) || 0;
    byLevel.set(key, g);
  }
  /** Konu içermeyen kademeleri arkaya at; sonra alfabetik */
  return Array.from(byLevel.values()).sort((a, b) => {
    if ((b.rowCount > 0 ? 1 : 0) - (a.rowCount > 0 ? 1 : 0) !== 0) {
      return (b.rowCount > 0 ? 1 : 0) - (a.rowCount > 0 ? 1 : 0);
    }
    return a.levelLabel.localeCompare(b.levelLabel, 'tr');
  });
}

/** Seçili kademe için dersler ve her birinin konu sayısı */
export function subjectsForLevel(
  rows: EduLessonRow[],
  classIdsInLevel: string[]
): { subjectName: string; count: number }[] {
  const allow = new Set(classIdsInLevel);
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!allow.has(r.class_id)) continue;
    const key = (r.subject_name || '').trim() || 'Ders';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([subjectName, count]) => ({ subjectName, count }))
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'tr'));
}

/** Filtrelenmiş konular — kademe (class id listesi) + ders adı */
export function filterRows(
  rows: EduLessonRow[],
  options: { classIdsInLevel?: string[]; subjectName?: string | null; classId?: string | null }
): EduLessonRow[] {
  const { classIdsInLevel, subjectName, classId } = options;
  const allow = classIdsInLevel ? new Set(classIdsInLevel) : null;
  return rows
    .filter((r) => {
      if (allow && !allow.has(r.class_id)) return false;
      if (classId && r.class_id !== classId) return false;
      if (subjectName && (r.subject_name || '').trim() !== subjectName) return false;
      return true;
    })
    .sort((a, b) => String(b.lesson_date).localeCompare(String(a.lesson_date)));
}

export function formatLessonDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch {
    return iso;
  }
}
