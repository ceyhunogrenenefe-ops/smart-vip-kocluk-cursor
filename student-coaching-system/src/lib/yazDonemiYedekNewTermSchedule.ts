/**
 * Yaz dönemi yedek (16).json → 2026-2027 yeni dönem planlayıcısı.
 * 2–12. sınıf + YÖS / YKS / SAT gruplarını Excel seed’leriyle tek programda birleştirir.
 */

import type { PlannerCell, PlannerGroup, PlannerPeriod } from './lgs8ExcelNewTermSchedule';
import { buildLgs8ExcelNewTermPlannerState } from './lgs8ExcelNewTermSchedule';
import {
  mergePrimaryExcelIntoPlannerState,
  upsertPlannerGroups,
} from './primaryExcelNewTermSchedule';
import yazBackup from './data/yaz-donemi-yedek-16.json';

const TERM_START = '2026-09-01';
const TERM_END = '2027-06-19';

type YazPeriod = { label?: string; time?: string };
type YazCell = { subject?: string; teacher?: string };
type YazGroup = {
  id?: string;
  name?: string;
  color?: string;
  advisor?: string;
  classLevel?: string | null;
  branch?: string | null;
  locked?: boolean;
  periods?: YazPeriod[];
  periodsByDay?: Record<string, YazPeriod[]>;
  schedule?: Record<string, YazCell | null | undefined>;
  students?: unknown[];
  curriculum?: unknown[];
  classId?: string | null;
};

type YazBackupFile = {
  term?: { start?: string; end?: string };
  days?: string[];
  periods?: YazPeriod[];
  eveningPeriods?: YazPeriod[];
  groups?: YazGroup[];
  teachers?: Array<{ id?: string; name?: string; email?: string; branches?: string[] }>;
  poolSubjects?: string[];
  curriculumPresets?: Record<string, unknown>;
  systemClasses?: unknown[];
  systemStudents?: unknown[];
};

const backup = yazBackup as YazBackupFile;

/** "8A YAZ KAMPI" / "2026-2027 11-B SINIFI" / "YÖS …" → kanonik kısa ad */
export function canonicalizePlannerGroupName(name: unknown): string {
  const raw = String(name || '').trim();
  if (!raw) return '';
  const up = raw.toLocaleUpperCase('tr-TR');

  if (up.includes('YÖS') || /\bYOS\b/.test(up)) return 'YÖS';
  if (up.includes('YKS') || up.includes('YILDIZLAR YKS')) return 'YKS';
  if (up === 'SAT' || /(^|\s)SAT(\s|$)/.test(up)) return 'SAT';

  const stripped = raw
    .replace(/20\d{2}\s*[-–/]\s*20\d{2}/g, '')
    .replace(/YAZ\s*KAMPI/gi, '')
    .replace(/SINIFI?/gi, '')
    .replace(/DÖNEM[İI]?/gi, '')
    .replace(/DÖMEM/gi, '')
    .replace(/GRUBU?/gi, '')
    .trim();

  const m = stripped.match(/(?:^|[^\d])([2-9]|1[0-2])\s*[-_]?\s*([A-Za-zÇĞİÖŞÜçğıöşü])/u);
  if (m) {
    return `${m[1]}${m[2].toLocaleUpperCase('tr-TR')}`;
  }
  return stripped.replace(/\s+/g, ' ').trim() || raw;
}

function clonePeriods(list: YazPeriod[] | PlannerPeriod[] | undefined): PlannerPeriod[] {
  return (list || []).map((p, i) => ({
    label: String(p.label || `${i + 1}. Ders`),
    time: String(p.time || '').trim(),
  }));
}

function clonePeriodsByDay(
  periodsByDay: Record<string, YazPeriod[]> | undefined,
  fallback: PlannerPeriod[]
): Record<string, PlannerPeriod[]> {
  const out: Record<string, PlannerPeriod[]> = {};
  if (periodsByDay && typeof periodsByDay === 'object') {
    for (const [k, list] of Object.entries(periodsByDay)) {
      if (Array.isArray(list) && list.length) out[k] = clonePeriods(list);
    }
  }
  if (!Object.keys(out).length) {
    for (let di = 0; di <= 6; di++) out[String(di)] = clonePeriods(fallback);
  }
  return out;
}

function cloneSchedule(schedule: YazGroup['schedule']): Record<string, PlannerCell> {
  const out: Record<string, PlannerCell> = {};
  if (!schedule || typeof schedule !== 'object') return out;
  for (const [key, cell] of Object.entries(schedule)) {
    if (!cell || typeof cell !== 'object') continue;
    const subject = String(cell.subject || '').trim();
    const teacher = String(cell.teacher || '').trim();
    if (!subject && !teacher) continue;
    out[key] = { subject, teacher };
  }
  return out;
}

function countLessons(schedule: Record<string, PlannerCell> | undefined): number {
  return Object.keys(schedule || {}).length;
}

function toPlannerGroup(g: YazGroup): PlannerGroup {
  const periods = clonePeriods(g.periods?.length ? g.periods : backup.eveningPeriods || backup.periods);
  const schedule = cloneSchedule(g.schedule);
  const name = canonicalizePlannerGroupName(g.name) || String(g.name || 'Grup');
  return {
    id: String(g.id || `yaz-${name}`),
    name,
    advisor: String(g.advisor || ''),
    color: String(g.color || '#3B6EA5'),
    students: Array.isArray(g.students) ? g.students : [],
    schedule,
    periods,
    periodsByDay: clonePeriodsByDay(g.periodsByDay, periods),
    locked: Boolean(g.locked),
    classId: null,
    classLevel: String(g.classLevel || ''),
    branch: null,
    curriculum: Array.isArray(g.curriculum) ? g.curriculum : [],
  };
}

/** Yedekteki tüm gruplar (kanonik adlarla). */
export function buildYazBackupGroups(): PlannerGroup[] {
  const groups = Array.isArray(backup.groups) ? backup.groups : [];
  // Aynı kanonik ada düşenlerde dolu programı tercih et
  const byName = new Map<string, PlannerGroup>();
  for (const raw of groups) {
    const g = toPlannerGroup(raw);
    const key = g.name.toLocaleLowerCase('tr-TR');
    const prev = byName.get(key);
    if (!prev || countLessons(g.schedule) >= countLessons(prev.schedule)) {
      byName.set(key, g);
    }
  }
  return [...byName.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'tr', { numeric: true })
  );
}

export function countYazBackupLessons(groups = buildYazBackupGroups()): number {
  return groups.reduce((n, g) => n + countLessons(g.schedule), 0);
}

export function buildYazBackupNewTermPlannerState() {
  const periods = clonePeriods(backup.eveningPeriods?.length ? backup.eveningPeriods : backup.periods);
  const groups = buildYazBackupGroups();
  return {
    term: {
      start: String(backup.term?.start || TERM_START).slice(0, 10),
      end: String(backup.term?.end || TERM_END).slice(0, 10),
    },
    days: Array.isArray(backup.days) && backup.days.length
      ? backup.days.map(String)
      : ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'],
    periods,
    periodsByDay: Object.fromEntries(
      [0, 1, 2, 3, 4, 5, 6].map((di) => [String(di), clonePeriods(periods)])
    ) as Record<string, PlannerPeriod[]>,
    groups,
    teachers: Array.isArray(backup.teachers)
      ? backup.teachers.map((t) => ({
          id: String(t.id || ''),
          name: String(t.name || ''),
          email: t.email ? String(t.email) : undefined,
          branches: Array.isArray(t.branches) ? t.branches.map(String) : [],
        }))
      : [],
    poolSubjects: Array.isArray(backup.poolSubjects) ? backup.poolSubjects.map(String) : [],
    curriculumPresets: backup.curriculumPresets || {},
  };
}

/**
 * İki planı birleştirir: önce base, sonra overlay (aynı ad → overlay kazanır).
 * Overlay boşsa base’teki dolu program korunur.
 */
export function mergePlannerStatesPreferFilled(
  base: Record<string, unknown> | null | undefined,
  overlay: Record<string, unknown> | null | undefined
) {
  const b = base && typeof base === 'object' ? base : {};
  const o = overlay && typeof overlay === 'object' ? overlay : {};
  const baseGroups = Array.isArray((b as { groups?: unknown }).groups)
    ? ((b as { groups: PlannerGroup[] }).groups as PlannerGroup[])
    : [];
  const overlayGroups = Array.isArray((o as { groups?: unknown }).groups)
    ? ((o as { groups: PlannerGroup[] }).groups as PlannerGroup[])
    : [];

  // Kanonik ada normalize et
  const normedBase = baseGroups.map((g) => ({
    ...g,
    name: canonicalizePlannerGroupName(g.name) || g.name,
  }));
  const normedOverlay = overlayGroups.map((g) => ({
    ...g,
    name: canonicalizePlannerGroupName(g.name) || g.name,
  }));

  // Overlay yalnızca doluysa veya base boşsa yazsın
  const smartOverlay: PlannerGroup[] = [];
  const baseBy = new Map(
    normedBase.map((g) => [g.name.toLocaleLowerCase('tr-TR'), g] as const)
  );
  for (const g of normedOverlay) {
    const key = g.name.toLocaleLowerCase('tr-TR');
    const prev = baseBy.get(key);
    if (!prev) {
      smartOverlay.push(g);
      continue;
    }
    if (countLessons(g.schedule) >= countLessons(prev.schedule)) {
      smartOverlay.push(g);
    }
  }

  const teachers = [
    ...((Array.isArray((b as { teachers?: unknown }).teachers)
      ? (b as { teachers: unknown[] }).teachers
      : []) as unknown[]),
    ...((Array.isArray((o as { teachers?: unknown }).teachers)
      ? (o as { teachers: unknown[] }).teachers
      : []) as unknown[]),
  ];
  const poolSubjects = [
    ...new Set([
      ...((Array.isArray((b as { poolSubjects?: unknown }).poolSubjects)
        ? (b as { poolSubjects: string[] }).poolSubjects
        : []) as string[]),
      ...((Array.isArray((o as { poolSubjects?: unknown }).poolSubjects)
        ? (o as { poolSubjects: string[] }).poolSubjects
        : []) as string[]),
    ]),
  ];

  return {
    ...b,
    ...o,
    term: (o as { term?: unknown }).term || (b as { term?: unknown }).term || {
      start: TERM_START,
      end: TERM_END,
    },
    days:
      (Array.isArray((o as { days?: unknown }).days) && (o as { days: string[] }).days.length
        ? (o as { days: string[] }).days
        : null) ||
      (Array.isArray((b as { days?: unknown }).days) ? (b as { days: string[] }).days : null) || [
        'Pazartesi',
        'Salı',
        'Çarşamba',
        'Perşembe',
        'Cuma',
        'Cumartesi',
        'Pazar',
      ],
    periods:
      (Array.isArray((b as { periods?: unknown }).periods) &&
      (b as { periods: PlannerPeriod[] }).periods.length
        ? (b as { periods: PlannerPeriod[] }).periods
        : null) ||
      (Array.isArray((o as { periods?: unknown }).periods)
        ? (o as { periods: PlannerPeriod[] }).periods
        : []),
    periodsByDay:
      (b as { periodsByDay?: unknown }).periodsByDay ||
      (o as { periodsByDay?: unknown }).periodsByDay ||
      {},
    groups: upsertPlannerGroups(normedBase, smartOverlay),
    teachers,
    poolSubjects,
    curriculumPresets: {
      ...(((b as { curriculumPresets?: object }).curriculumPresets as object) || {}),
      ...(((o as { curriculumPresets?: object }).curriculumPresets as object) || {}),
    },
  };
}

/**
 * Tek program: yaz yedek (2–12 + YÖS/YKS/SAT) + Excel 2A–7A + Excel 8A–8F.
 * Excel dolu hücreleri yaz kampı kabuklarının üzerine yazılır.
 */
export function buildFullNewTermPlannerState() {
  const yaz = buildYazBackupNewTermPlannerState();
  const excel = mergePrimaryExcelIntoPlannerState(buildLgs8ExcelNewTermPlannerState());
  return mergePlannerStatesPreferFilled(yaz, excel as Record<string, unknown>);
}

export function mergeYazBackupIntoPlannerState(current: Record<string, unknown> | null | undefined) {
  return mergePlannerStatesPreferFilled(current, buildYazBackupNewTermPlannerState());
}

export function mergeFullNewTermIntoPlannerState(current: Record<string, unknown> | null | undefined) {
  return mergePlannerStatesPreferFilled(current, buildFullNewTermPlannerState());
}

const WANTED_CORE = ['2a', '4a', '5a', '6a', '7a', '8a', '8b', '8c', '8f', '9a', '10a', '11a', 'yös', 'yks'];

export function plannerNeedsFullNewTermSeed(plannerJson: unknown): boolean {
  const groups = (plannerJson as { groups?: Array<{ name?: string; schedule?: Record<string, unknown> }> })
    ?.groups;
  if (!Array.isArray(groups) || !groups.length) return true;
  const found = new Set<string>();
  for (const g of groups) {
    const name = canonicalizePlannerGroupName(g?.name).toLocaleLowerCase('tr-TR');
    const hit = WANTED_CORE.find((w) => name === w || name.includes(w));
    if (!hit) continue;
    const schedule = g?.schedule;
    if (!schedule || typeof schedule !== 'object') continue;
    const hasLesson = Object.values(schedule).some((cell) => {
      if (!cell || typeof cell !== 'object') return false;
      const c = cell as { subject?: string; teacher?: string };
      return !!(String(c.subject || '').trim() || String(c.teacher || '').trim());
    });
    if (hasLesson) found.add(hit);
  }
  // En azından ortaokul Excel + bir lise/YÖS grubu dolu olsun
  const hasPrimary = ['2a', '4a', '5a', '6a', '7a'].some((k) => found.has(k));
  const hasLgs = ['8a', '8b', '8c', '8f'].some((k) => found.has(k));
  const hasHs = ['9a', '10a', '11a', 'yös', 'yks'].some((k) => found.has(k));
  return !(hasPrimary && hasLgs && hasHs);
}
