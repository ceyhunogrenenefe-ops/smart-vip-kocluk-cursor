/**
 * Excel/PNG (2026-2027) — 2A / 4A / 5A / 6A / 7A haftalık program.
 * Kaynak: kurum program görseli → Ders Saatleri Yeni Dönem planlayıcısı.
 * Görselde öğretmen yok; teacher alanları boş bırakılır.
 */

import type { PlannerCell, PlannerGroup, PlannerPeriod } from './lgs8ExcelNewTermSchedule';

const TERM_START = '2026-09-01';
const TERM_END = '2027-06-19';

export const PRIMARY_DAYS = [
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
  'Pazar',
] as const;

/** Hafta içi — 8. sınıfla aynı iskelet (boş dilimler null kalır). */
export const PRIMARY_WEEKDAY_PERIODS: PlannerPeriod[] = [
  { label: '1. Ders', time: '17:00–17:40' },
  { label: '2. Ders', time: '17:50–18:30' },
  { label: '3. Ders', time: '19:00–19:40' },
  { label: '4. Ders', time: '19:50–20:30' },
  { label: '5. Ders', time: '20:40–21:20' },
];

/** Cumartesi: tek blok deneme (10:00–12:00) + öğleden sonra dilimleri. */
export const PRIMARY_SATURDAY_PERIODS: PlannerPeriod[] = [
  { label: '1. Ders', time: '10:00–12:00' },
  { label: '2. Ders', time: '16:00–16:40' },
  { label: '3. Ders', time: '16:50–17:30' },
  { label: '4. Ders', time: '18:00–18:40' },
  { label: '5. Ders', time: '18:50–19:30' },
];

export const PRIMARY_SUNDAY_PERIODS: PlannerPeriod[] = [
  { label: '1. Ders', time: '10:00–12:00' },
];

const S = {
  MAT: 'MATEMATİK',
  KOD: 'KODLAMA',
  ODEV_KITAP: 'ÖDEV & KİTAP OKUMA',
  ING: 'İNGİLİZCE',
  SINIF: 'SINIF DERSİ',
  DENEME: 'DENEME SINAVI',
  ODEV: 'ÖDEV SAATİ',
  REH: 'REHBERLİK',
  ETUT_KITAP: 'ETÜT & KİTAP OKUMA',
  TUR: 'TÜRKÇE',
  SOS: 'SOSYAL BİLGİLER',
  FEN: 'FEN BİLGİSİ',
  ETUT: 'ETÜT',
} as const;

type ClassDef = {
  id: string;
  name: string;
  color: string;
  classLevel: string;
  /** dayIndex 0–6 → periodIndex → subject or null */
  grid: Record<number, Array<string | null>>;
};

function clonePeriods(list: PlannerPeriod[]): PlannerPeriod[] {
  return list.map((p) => ({ label: p.label, time: p.time }));
}

function buildPeriodsByDay(): Record<string, PlannerPeriod[]> {
  const out: Record<string, PlannerPeriod[]> = {};
  for (let di = 0; di <= 4; di++) out[String(di)] = clonePeriods(PRIMARY_WEEKDAY_PERIODS);
  out['5'] = clonePeriods(PRIMARY_SATURDAY_PERIODS);
  out['6'] = clonePeriods(PRIMARY_SUNDAY_PERIODS);
  return out;
}

function buildSchedule(def: ClassDef): Record<string, PlannerCell> {
  const schedule: Record<string, PlannerCell> = {};
  for (const [diStr, periods] of Object.entries(def.grid)) {
    const di = Number(diStr);
    periods.forEach((subject, pi) => {
      if (!subject) return;
      schedule[`${di}_${pi}`] = { subject, teacher: '' };
    });
  }
  return schedule;
}

function toGroup(def: ClassDef): PlannerGroup {
  return {
    id: def.id,
    name: def.name,
    advisor: '',
    color: def.color,
    students: [],
    schedule: buildSchedule(def),
    periods: clonePeriods(PRIMARY_WEEKDAY_PERIODS),
    periodsByDay: buildPeriodsByDay(),
    locked: false,
    classId: null,
    classLevel: def.classLevel,
    branch: null,
    curriculum: [],
  };
}

/** Cumartesi: deneme + 4 öğleden sonra dilimi. */
function satGrid(
  afternoon: [string | null, string | null, string | null, string | null] = [null, null, null, null]
): Record<number, Array<string | null>> {
  return {
    5: [S.DENEME, afternoon[0], afternoon[1], afternoon[2], afternoon[3]],
  };
}

const CLASS_2A: ClassDef = {
  id: 'primary-2026-2A',
  name: '2A',
  color: '#C45C26',
  classLevel: '2',
  grid: {
    // Salı Matematik ×2, Perşembe Kodlama ×2 (19:00 / 19:50)
    1: [null, null, S.MAT, S.MAT, null],
    3: [null, null, S.KOD, S.KOD, null],
  },
};

const CLASS_4A: ClassDef = {
  id: 'primary-2026-4A',
  name: '4A',
  color: '#2F6FAD',
  classLevel: '4',
  grid: {
    0: [S.ODEV_KITAP, null, S.MAT, S.MAT, null],
    1: [S.ODEV_KITAP, null, null, null, null],
    2: [S.ODEV_KITAP, null, S.ING, S.ING, null],
    3: [S.ODEV_KITAP, null, S.SINIF, S.SINIF, null],
    4: [S.ODEV_KITAP, null, null, null, null],
    ...satGrid(),
  },
};

const CLASS_5A: ClassDef = {
  id: 'primary-2026-5A',
  name: '5A',
  color: '#6B3FA0',
  classLevel: '5',
  grid: {
    0: [S.ODEV, S.REH, S.TUR, S.TUR, null],
    1: [S.ODEV, S.ETUT_KITAP, null, null, null],
    2: [S.ODEV, S.ETUT_KITAP, S.SOS, null, null],
    3: [S.ODEV, S.ETUT_KITAP, S.FEN, S.FEN, null],
    4: [S.ODEV, S.ETUT_KITAP, null, null, null],
    ...satGrid([S.MAT, S.MAT, S.ING, S.ING]),
  },
};

const CLASS_6A: ClassDef = {
  id: 'primary-2026-6A',
  name: '6A',
  color: '#0E7A5F',
  classLevel: '6',
  grid: {
    0: [S.ODEV, S.REH, S.SOS, null, null],
    1: [S.ODEV, S.ETUT_KITAP, null, null, null],
    2: [S.ODEV, S.ETUT_KITAP, S.FEN, S.FEN, null],
    3: [S.ODEV, S.ETUT_KITAP, S.TUR, S.TUR, null],
    4: [S.ODEV, S.ETUT_KITAP, null, null, null],
    ...satGrid([S.ING, S.ING, S.MAT, S.MAT]),
  },
};

const CLASS_7A: ClassDef = {
  id: 'primary-2026-7A',
  name: '7A',
  color: '#8B1E3F',
  classLevel: '7',
  grid: {
    0: [S.ETUT, S.ETUT, S.REH, null, null],
    1: [S.ETUT, S.ETUT, S.TUR, S.TUR, S.SOS],
    2: [S.ETUT, S.ETUT, null, null, null],
    3: [S.ETUT, S.ETUT, S.MAT, S.MAT, null],
    4: [S.ETUT, S.ETUT, null, null, null],
    ...satGrid([S.FEN, S.FEN, S.ING, S.ING]),
  },
};

export const PRIMARY_EXCEL_CLASS_DEFS = [CLASS_2A, CLASS_4A, CLASS_5A, CLASS_6A, CLASS_7A] as const;

export function buildPrimaryExcelGroups(): PlannerGroup[] {
  return PRIMARY_EXCEL_CLASS_DEFS.map(toGroup);
}

export function countPrimaryExcelLessons(groups = buildPrimaryExcelGroups()): number {
  return groups.reduce((n, g) => n + Object.keys(g.schedule || {}).length, 0);
}

function normGroupName(name: unknown): string {
  return String(name || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/[-_\s./]/g, '');
}

/** Gelen grupları ada göre upsert eder; diğer grupları korur. */
export function upsertPlannerGroups<T extends { name?: string }>(
  existing: T[] | undefined,
  incoming: T[]
): T[] {
  const map = new Map<string, T>();
  const order: string[] = [];
  for (const g of existing || []) {
    const key = normGroupName(g?.name);
    if (!key) continue;
    if (!map.has(key)) order.push(key);
    map.set(key, g);
  }
  for (const g of incoming) {
    const key = normGroupName(g?.name);
    if (!key) continue;
    if (!map.has(key)) order.push(key);
    map.set(key, g);
  }
  return order.map((k) => map.get(k)!).filter(Boolean);
}

/** Yalnız 2A–7A gruplarıyla yeni dönem durumu. */
export function buildPrimaryExcelNewTermPlannerState() {
  return {
    term: { start: TERM_START, end: TERM_END },
    days: [...PRIMARY_DAYS],
    periods: clonePeriods(PRIMARY_WEEKDAY_PERIODS),
    periodsByDay: buildPeriodsByDay(),
    groups: buildPrimaryExcelGroups(),
  };
}

/** Mevcut planlayıcı durumuna 2A–7A gruplarını birleştirir. */
export function mergePrimaryExcelIntoPlannerState(current: Record<string, unknown> | null | undefined) {
  const primary = buildPrimaryExcelNewTermPlannerState();
  const base = current && typeof current === 'object' ? current : {};
  const existingGroups = Array.isArray((base as { groups?: unknown }).groups)
    ? ((base as { groups: PlannerGroup[] }).groups as PlannerGroup[])
    : [];
  return {
    ...primary,
    ...base,
    term: (base as { term?: unknown }).term || primary.term,
    days: Array.isArray((base as { days?: unknown }).days) ? (base as { days: string[] }).days : primary.days,
    periods: Array.isArray((base as { periods?: unknown }).periods)
      ? (base as { periods: PlannerPeriod[] }).periods
      : primary.periods,
    periodsByDay:
      (base as { periodsByDay?: Record<string, PlannerPeriod[]> }).periodsByDay || primary.periodsByDay,
    groups: upsertPlannerGroups(existingGroups, primary.groups),
  };
}

const PRIMARY_WANTED = ['2a', '4a', '5a', '6a', '7a'];

export function plannerNeedsPrimaryExcelSeed(plannerJson: unknown): boolean {
  const groups = (plannerJson as { groups?: Array<{ name?: string; schedule?: Record<string, unknown> }> })
    ?.groups;
  if (!Array.isArray(groups) || !groups.length) return true;
  const found = new Set<string>();
  for (const g of groups) {
    const name = normGroupName(g?.name);
    const hit = PRIMARY_WANTED.find((w) => name === w || name.includes(w));
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
  return found.size < PRIMARY_WANTED.length;
}
