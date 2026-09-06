/**
 * Yaz dönemi yedek JSON → ders programı planlayıcısı.
 * Kural: yedekteki dersleri yaz, mevcut programın yapısını (days/periods) bozma.
 * Kaynaklar: yaz-donemi-yedek-16.json + yaz-donemi-yedek-17-8sinif.json
 */

import type { PlannerCell, PlannerGroup, PlannerPeriod } from './lgs8ExcelNewTermSchedule';
import { buildLgs8ExcelNewTermPlannerState } from './lgs8ExcelNewTermSchedule';
import {
  mergePrimaryExcelIntoPlannerState,
  upsertPlannerGroups,
} from './primaryExcelNewTermSchedule';
import yazBackup16 from './data/yaz-donemi-yedek-16.json';
import yazBackup17 from './data/yaz-donemi-yedek-17-8sinif.json';

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
};

const backup16 = yazBackup16 as YazBackupFile;
const backup17 = yazBackup17 as YazBackupFile;

function eveningPeriodsOf(file: YazBackupFile): YazPeriod[] {
  const evening =
    (file as { eveningPeriods?: YazPeriod[] }).eveningPeriods ||
    file.eveningPeriods ||
    [];
  if (Array.isArray(evening) && evening.length) return evening;
  return Array.isArray(file.periods) ? file.periods : [];
}

/** "8A YAZ KAMPI" / "2026-2027 11-B SINIFI" / "YÖS …" → kısa kanonik ad */
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
  if (m) return `${m[1]}${m[2].toLocaleUpperCase('tr-TR')}`;
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

function toPlannerGroup(g: YazGroup, fallbackPeriods: YazPeriod[]): PlannerGroup {
  const periods = clonePeriods(g.periods?.length ? g.periods : fallbackPeriods);
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

/** Yedek 16 + 17 → kanonik grup listesi (aynı ad: daha dolu kazanır). */
export function buildYazBackupGroups(): PlannerGroup[] {
  const byName = new Map<string, PlannerGroup>();
  const ingest = (file: YazBackupFile) => {
    const fb = eveningPeriodsOf(file);
    for (const raw of file.groups || []) {
      const g = toPlannerGroup(raw, fb);
      const key = g.name.toLocaleLowerCase('tr-TR');
      const prev = byName.get(key);
      if (!prev || countLessons(g.schedule) > countLessons(prev.schedule)) byName.set(key, g);
    }
  };
  ingest(backup16);
  ingest(backup17);
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true }));
}

export function countYazBackupLessons(groups = buildYazBackupGroups()): number {
  return groups.reduce((n, g) => n + countLessons(g.schedule), 0);
}

export function buildYazBackupNewTermPlannerState() {
  const periods = clonePeriods(eveningPeriodsOf(backup16));
  return {
    term: {
      start: String(backup16.term?.start || TERM_START).slice(0, 10),
      end: String(backup16.term?.end || TERM_END).slice(0, 10),
    },
    days:
      Array.isArray(backup16.days) && backup16.days.length
        ? backup16.days.map(String)
        : ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'],
    periods,
    periodsByDay: Object.fromEntries(
      [0, 1, 2, 3, 4, 5, 6].map((di) => [String(di), clonePeriods(periods)])
    ) as Record<string, PlannerPeriod[]>,
    groups: buildYazBackupGroups(),
    teachers: Array.isArray(backup16.teachers)
      ? backup16.teachers.map((t) => ({
          id: String(t.id || ''),
          name: String(t.name || ''),
          email: t.email ? String(t.email) : undefined,
          branches: Array.isArray(t.branches) ? t.branches.map(String) : [],
        }))
      : [],
    poolSubjects: Array.isArray((backup16 as { poolSubjects?: string[] }).poolSubjects)
      ? (backup16 as { poolSubjects: string[] }).poolSubjects.map(String)
      : Array.isArray(backup16.poolSubjects)
        ? backup16.poolSubjects.map(String)
        : [],
    curriculumPresets: backup16.curriculumPresets || {},
  };
}

function mergeGroupsPreserveStructure(
  baseGroups: PlannerGroup[],
  incomingGroups: PlannerGroup[]
): PlannerGroup[] {
  const normedBase = baseGroups.map((g) => ({
    ...g,
    name: canonicalizePlannerGroupName(g.name) || g.name,
  }));
  const baseBy = new Map(normedBase.map((g) => [g.name.toLocaleLowerCase('tr-TR'), g] as const));
  const toUpsert: PlannerGroup[] = [];

  for (const raw of incomingGroups) {
    const g = { ...raw, name: canonicalizePlannerGroupName(raw.name) || raw.name };
    const key = g.name.toLocaleLowerCase('tr-TR');
    const prev = baseBy.get(key);
    if (!prev) {
      // Yeni grup: kendi periods/schedule ile ekle
      toUpsert.push(g);
      continue;
    }
    const prevN = countLessons(prev.schedule);
    const nextN = countLessons(g.schedule);
    if (prevN === 0 && nextN > 0) {
      // Boş kabuk → yedekteki dolu program (kendi dilimleriyle)
      toUpsert.push({ ...g, id: prev.id || g.id, name: prev.name || g.name });
      continue;
    }
    if (prevN > 0 && nextN > 0) {
      // Mevcut dilim yapısını koru; yalnızca boş hücreleri doldur
      toUpsert.push({
        ...prev,
        schedule: { ...(g.schedule || {}), ...(prev.schedule || {}) },
        periods: prev.periods?.length ? prev.periods : g.periods,
        periodsByDay:
          prev.periodsByDay && Object.keys(prev.periodsByDay).length
            ? prev.periodsByDay
            : g.periodsByDay,
      });
    }
    // prev dolu, incoming boş/az → dokunma (yapı + ders korunur)
  }

  return upsertPlannerGroups(normedBase, toUpsert);
}

/**
 * Yedek JSON’u programa yazar — days/periods/term yapısı bozulmaz.
 * Mevcut dolu sınıflar korunur; eksik gruplar / boş hücreler doldurulur.
 */
export function writeYazBackupJsonIntoPlanner(
  current: Record<string, unknown> | null | undefined
) {
  const yaz = buildYazBackupNewTermPlannerState();
  const hasCurrent =
    !!current &&
    typeof current === 'object' &&
    (Array.isArray((current as { groups?: unknown }).groups) ||
      Array.isArray((current as { periods?: unknown }).periods));

  if (!hasCurrent) return yaz;

  const b = current as Record<string, unknown>;
  const baseGroups = Array.isArray(b.groups) ? (b.groups as PlannerGroup[]) : [];
  const teachers = [
    ...((Array.isArray(b.teachers) ? b.teachers : []) as unknown[]),
    ...((yaz.teachers || []) as unknown[]),
  ];
  const poolSubjects = [
    ...new Set([
      ...((Array.isArray(b.poolSubjects) ? b.poolSubjects : []) as string[]),
      ...((yaz.poolSubjects || []) as string[]),
    ]),
  ];

  return {
    ...b,
    term: b.term || yaz.term,
    days: Array.isArray(b.days) && (b.days as string[]).length ? b.days : yaz.days,
    periods:
      Array.isArray(b.periods) && (b.periods as PlannerPeriod[]).length ? b.periods : yaz.periods,
    periodsByDay: b.periodsByDay || yaz.periodsByDay,
    groups: mergeGroupsPreserveStructure(baseGroups, yaz.groups as PlannerGroup[]),
    teachers,
    poolSubjects,
    curriculumPresets: {
      ...((b.curriculumPresets as object) || {}),
      ...(yaz.curriculumPresets || {}),
    },
  };
}

/** @deprecated alias — yapıyı koruyan yazma */
export function mergeYazBackupIntoPlannerState(
  current: Record<string, unknown> | null | undefined
) {
  return writeYazBackupJsonIntoPlanner(current);
}

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

  // Üst yapı her zaman base’ten (program iskeleti bozulmaz)
  return {
    ...b,
    term: (b as { term?: unknown }).term || (o as { term?: unknown }).term || {
      start: TERM_START,
      end: TERM_END,
    },
    days:
      (Array.isArray((b as { days?: unknown }).days) && (b as { days: string[] }).days.length
        ? (b as { days: string[] }).days
        : null) ||
      (Array.isArray((o as { days?: unknown }).days) ? (o as { days: string[] }).days : null) || [
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
    groups: mergeGroupsPreserveStructure(baseGroups, overlayGroups),
    teachers,
    poolSubjects,
    curriculumPresets: {
      ...(((b as { curriculumPresets?: object }).curriculumPresets as object) || {}),
      ...(((o as { curriculumPresets?: object }).curriculumPresets as object) || {}),
    },
  };
}

export function buildFullNewTermPlannerState() {
  const yaz = buildYazBackupNewTermPlannerState();
  const excel = mergePrimaryExcelIntoPlannerState(buildLgs8ExcelNewTermPlannerState());
  // Excel’i yaz üzerine: yapı yaz/excel karışımında periods base=yaz sonra excel periods tercih?
  // Yapıyı bozmamak için: önce yaz iskeleti, excel grupları koruyarak eklenir.
  return mergePlannerStatesPreferFilled(yaz, excel as Record<string, unknown>);
}

export function mergeFullNewTermIntoPlannerState(
  current: Record<string, unknown> | null | undefined
) {
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
  const hasPrimary = ['2a', '4a', '5a', '6a', '7a'].some((k) => found.has(k));
  const hasLgs = ['8a', '8b', '8c', '8f'].some((k) => found.has(k));
  const hasHs = ['9a', '10a', '11a', 'yös', 'yks'].some((k) => found.has(k));
  return !(hasPrimary && hasLgs && hasHs);
}
