/**
 * Excel (2026-2027) — 8A / 8B / 8C / 8F haftalık program + yan öğretmen tablosu.
 * Kaynak: kurum Excel ekran görüntüsü → Ders Saatleri Yeni Dönem planlayıcısı.
 */

/** newTermSchedulePlanner ile aynı tarihler — döngüsel import yok. */
const TERM_START = '2026-09-01';
const TERM_END = '2027-06-19';

export type PlannerPeriod = { label: string; time: string };
export type PlannerCell = { subject: string; teacher: string };
export type PlannerGroup = {
  id: string;
  name: string;
  advisor: string;
  color: string;
  students: unknown[];
  schedule: Record<string, PlannerCell>;
  periods: PlannerPeriod[];
  periodsByDay: Record<string, PlannerPeriod[]>;
  locked: boolean;
  classId: null;
  classLevel: string;
  branch: null;
  curriculum: unknown[];
};

/** Hafta içi akşam dilimleri (Excel). */
export const LGS8_WEEKDAY_PERIODS: PlannerPeriod[] = [
  { label: '1. Ders', time: '17:00–17:40' },
  { label: '2. Ders', time: '17:50–18:30' },
  { label: '3. Ders', time: '19:00–19:40' },
  { label: '4. Ders', time: '19:50–20:30' },
  { label: '5. Ders', time: '20:40–21:20' },
];

/** Cumartesi: sabah deneme + öğleden sonra ders. */
export const LGS8_SATURDAY_PERIODS: PlannerPeriod[] = [
  { label: '1. Ders', time: '10:00–11:15' },
  { label: '2. Ders', time: '11:30–12:50' },
  { label: '3. Ders', time: '16:00–16:40' },
  { label: '4. Ders', time: '16:50–17:30' },
  { label: '5. Ders', time: '18:00–18:40' },
  { label: '6. Ders', time: '18:50–19:30' },
];

/** Pazar: sabah deneme tekrar. */
export const LGS8_SUNDAY_PERIODS: PlannerPeriod[] = [
  { label: '1. Ders', time: '10:00–11:15' },
  { label: '2. Ders', time: '11:30–12:50' },
];

export const LGS8_DAYS = [
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
  'Pazar',
] as const;

const S = {
  MAT: 'MATEMATİK',
  FEN: 'FEN BİLGİSİ',
  TUR: 'TÜRKÇE',
  INK: 'İNKILAP TARİHİ',
  DIN: 'DİN KÜLTÜRÜ',
  ING: 'İNGİLİZCE',
  ETUT: 'ETÜT',
  REH: 'REHBERLİK',
  DEN_SOZ: 'DENEME SINAVI SÖZEL',
  DEN_SAY: 'DENEME SINAVI SAYISAL',
  DEN_TEK: 'DENEME SINAVI TEKRAR',
} as const;

type TeacherMap = Record<string, string>;

type ClassDef = {
  id: string;
  name: string;
  color: string;
  teachers: TeacherMap;
  /** dayIndex 0–6 → periodIndex → subject or null */
  grid: Record<number, Array<string | null>>;
};

function clonePeriods(list: PlannerPeriod[]): PlannerPeriod[] {
  return list.map((p) => ({ label: p.label, time: p.time }));
}

function buildPeriodsByDay(): Record<string, PlannerPeriod[]> {
  const out: Record<string, PlannerPeriod[]> = {};
  for (let di = 0; di <= 4; di++) out[String(di)] = clonePeriods(LGS8_WEEKDAY_PERIODS);
  out['5'] = clonePeriods(LGS8_SATURDAY_PERIODS);
  out['6'] = clonePeriods(LGS8_SUNDAY_PERIODS);
  return out;
}

function teacherFor(subject: string, map: TeacherMap): string {
  if (subject.startsWith('DENEME')) return '';
  return map[subject] || '';
}

function buildSchedule(def: ClassDef): Record<string, PlannerCell> {
  const schedule: Record<string, PlannerCell> = {};
  for (const [diStr, periods] of Object.entries(def.grid)) {
    const di = Number(diStr);
    periods.forEach((subject, pi) => {
      if (!subject) return;
      schedule[`${di}_${pi}`] = {
        subject,
        teacher: teacherFor(subject, def.teachers),
      };
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
    periods: clonePeriods(LGS8_WEEKDAY_PERIODS),
    periodsByDay: buildPeriodsByDay(),
    locked: false,
    classId: null,
    classLevel: '8',
    branch: null,
    curriculum: [],
  };
}

/** Ortak Cumartesi/Pazar deneme + Cumartesi öğleden sonra 4 dilim. */
function weekendGrid(satAfternoon: [string, string, string, string]): Record<number, Array<string | null>> {
  return {
    5: [S.DEN_SOZ, S.DEN_SAY, satAfternoon[0], satAfternoon[1], satAfternoon[2], satAfternoon[3]],
    6: [S.DEN_TEK, S.DEN_TEK],
  };
}

const CLASS_8F: ClassDef = {
  id: 'lgs8-2026-8F',
  name: '8F',
  color: '#2E4C8C',
  teachers: {
    [S.MAT]: 'Doğan Aktürk',
    [S.FEN]: 'Kamil Angay',
    [S.TUR]: 'Reha Apaydın',
    [S.INK]: 'Mustafa Kozan',
    [S.DIN]: 'Büşra Öztürk',
    [S.ING]: 'Mustafa Öztürk',
    [S.ETUT]: 'Doğan Aktürk',
    [S.REH]: 'Doğan Aktürk',
  },
  grid: {
    0: [S.ETUT, S.ETUT, S.REH, S.TUR, S.TUR],
    1: [S.ETUT, S.ETUT, S.ETUT, null, null],
    2: [S.ETUT, S.ETUT, S.ETUT, S.ING, S.ING],
    3: [S.ETUT, S.ETUT, S.ETUT, null, null],
    4: [S.ETUT, S.ETUT, S.INK, S.MAT, S.DIN],
    ...weekendGrid([S.MAT, S.MAT, S.FEN, S.FEN]),
  },
};

const CLASS_8B: ClassDef = {
  id: 'lgs8-2026-8B',
  name: '8B',
  color: '#0E8A6B',
  teachers: {
    [S.MAT]: 'Merve Yurdakul',
    [S.FEN]: 'Tayyibe Öğrenenefe',
    [S.TUR]: 'Reha Apaydın',
    [S.INK]: 'Mustafa Kozan',
    [S.DIN]: 'Büşra Öztürk',
    [S.ING]: 'Mustafa Öztürk',
    [S.ETUT]: 'Doğan Aktürk',
    [S.REH]: 'Merve Yurdakul',
  },
  grid: {
    0: [S.ETUT, S.ETUT, S.ETUT, S.REH, null],
    1: [S.ETUT, S.ETUT, S.ETUT, S.ING, S.ING],
    2: [S.ETUT, S.ETUT, S.ETUT, S.TUR, S.TUR],
    3: [S.ETUT, S.ETUT, S.ETUT, null, null],
    4: [S.ETUT, S.ETUT, S.MAT, S.INK, S.DIN],
    ...weekendGrid([S.MAT, S.MAT, S.FEN, S.FEN]),
  },
};

const CLASS_8A: ClassDef = {
  id: 'lgs8-2026-8A',
  name: '8A',
  color: '#B4541E',
  teachers: {
    [S.MAT]: 'Ahmet Dağüstü',
    [S.FEN]: 'Kamil Angay',
    [S.TUR]: 'Reha Apaydın',
    [S.INK]: 'Mustafa Kozan',
    [S.DIN]: 'Büşra Öztürk',
    [S.ING]: 'Mustafa Öztürk',
    [S.ETUT]: 'Doğan Aktürk',
    [S.REH]: 'Kamil Angay',
  },
  grid: {
    0: [S.ETUT, S.ETUT, S.REH, S.ING, S.ING],
    1: [S.ETUT, S.ETUT, S.ETUT, null, null],
    2: [S.ETUT, S.ETUT, S.ETUT, null, null],
    3: [S.ETUT, S.ETUT, S.MAT, S.DIN, S.INK],
    4: [S.ETUT, S.ETUT, S.ETUT, S.TUR, S.TUR],
    ...weekendGrid([S.FEN, S.FEN, S.MAT, S.MAT]),
  },
};

const CLASS_8C: ClassDef = {
  id: 'lgs8-2026-8C',
  name: '8C',
  color: '#7A3FA0',
  teachers: {
    [S.MAT]: 'Erdal Karadaş',
    [S.FEN]: 'Kamil Angay',
    [S.TUR]: 'Reha Apaydın',
    [S.INK]: 'Mustafa Kozan',
    [S.DIN]: 'Büşra Öztürk',
    [S.ING]: 'Mustafa Öztürk',
    [S.ETUT]: 'Doğan Aktürk',
    [S.REH]: 'Reha Apaydın',
  },
  grid: {
    0: [S.ETUT, S.ETUT, S.REH, S.FEN, S.FEN],
    1: [S.ETUT, S.ETUT, S.ETUT, S.TUR, S.TUR],
    2: [S.ETUT, S.ETUT, S.ETUT, null, null],
    3: [S.ETUT, S.ETUT, S.INK, S.DIN, S.MAT],
    4: [S.ETUT, S.ETUT, S.ETUT, null, null],
    ...weekendGrid([S.MAT, S.MAT, S.ING, S.ING]),
  },
};

export const LGS8_EXCEL_CLASS_DEFS = [CLASS_8A, CLASS_8B, CLASS_8C, CLASS_8F] as const;

/** Planlayıcıya basılacak dolu 2026-2027 durumu (4× 8. sınıf). */
export function buildLgs8ExcelNewTermPlannerState() {
  const periodsByDay = buildPeriodsByDay();
  return {
    term: { start: TERM_START, end: TERM_END },
    days: [...LGS8_DAYS],
    periods: clonePeriods(LGS8_WEEKDAY_PERIODS),
    periodsByDay,
    groups: LGS8_EXCEL_CLASS_DEFS.map(toGroup),
  };
}

export function countLgs8ExcelLessons(state = buildLgs8ExcelNewTermPlannerState()): number {
  return state.groups.reduce((n, g) => n + Object.keys(g.schedule || {}).length, 0);
}
