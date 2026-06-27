type PlannerPeriod = { label: string; time: string };
type PlannerGroup = {
  id: string;
  name: string;
  advisor?: string;
  color?: string;
  students?: unknown[];
  schedule: Record<string, { teacher?: string; subject?: string }>;
  periods: PlannerPeriod[];
};
export type PlannerState = {
  term?: { start?: string; end?: string };
  days?: string[];
  periods?: PlannerPeriod[];
  groups?: PlannerGroup[];
};

export type ClassWeeklySlot = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  subject: string;
  teacher_id?: string;
  teacher_name?: string;
};

function normLabel(s: string): string {
  return String(s || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

function fmtHm(t: string): string {
  const raw = String(t || '').trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return raw.slice(0, 5);
  return `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`;
}

function periodTimeKey(start: string, end: string): string {
  return `${fmtHm(start)}–${fmtHm(end)}`;
}

const DEFAULT_DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const DEFAULT_PERIODS: PlannerPeriod[] = [
  { label: '1. Ders', time: '09:00–09:45' },
  { label: '2. Ders', time: '10:00–10:45' },
  { label: '3. Ders', time: '11:00–11:45' },
  { label: '4. Ders', time: '12:00–12:45' },
  { label: '5. Ders', time: '13:30–14:15' },
  { label: '6. Ders', time: '14:30–15:15' }
];

function uid(): string {
  return `id${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Canlı Grup Dersi haftalık şablonlarını planlayıcı JSON'una yazar / ilgili grubu günceller. */
export function mergeClassSlotsIntoPlanner(
  existing: PlannerState,
  className: string,
  slots: ClassWeeklySlot[]
): PlannerState {
  const base: PlannerState = JSON.parse(JSON.stringify(existing || {}));
  if (!Array.isArray(base.days) || !base.days.length) base.days = [...DEFAULT_DAYS];
  if (!Array.isArray(base.periods) || !base.periods.length) base.periods = DEFAULT_PERIODS.map((p) => ({ ...p }));
  if (!Array.isArray(base.groups)) base.groups = [];

  const periodIndexByTime = new Map<string, number>();
  const periods: PlannerPeriod[] = [];
  const sorted = [...slots].sort((a, b) => {
    const d = Number(a.day_of_week) - Number(b.day_of_week);
    if (d !== 0) return d;
    return String(a.start_time).localeCompare(String(b.start_time));
  });

  for (const s of sorted) {
    const time = periodTimeKey(s.start_time, s.end_time);
    if (!periodIndexByTime.has(time)) {
      periodIndexByTime.set(time, periods.length);
      periods.push({ label: `${periods.length + 1}. Ders`, time });
    }
  }

  const usePeriods = periods.length ? periods : base.periods.map((p) => ({ ...p }));
  if (!periodIndexByTime.size) {
    for (let i = 0; i < usePeriods.length; i++) {
      periodIndexByTime.set(usePeriods[i].time, i);
    }
  }

  const schedule: Record<string, { teacher: string; subject: string }> = {};
  for (const s of sorted) {
    const di = Number(s.day_of_week) - 1;
    if (!Number.isFinite(di) || di < 0 || di > 6) continue;
    const time = periodTimeKey(s.start_time, s.end_time);
    const pi = periodIndexByTime.get(time);
    if (pi === undefined) continue;
    schedule[`${di}_${pi}`] = {
      teacher: String(s.teacher_name || '').trim(),
      subject: String(s.subject || '').trim()
    };
  }

  const targetNorm = normLabel(className);
  let group = base.groups.find((g) => normLabel(g.name) === targetNorm);
  if (!group) {
    group = {
      id: uid(),
      name: className.trim(),
      advisor: '',
      color: '#2E4C8C',
      students: [],
      schedule: {},
      periods: usePeriods.map((p) => ({ ...p }))
    };
    base.groups.push(group);
  }

  group.name = className.trim();
  group.periods = usePeriods.map((p) => ({ ...p }));
  group.schedule = schedule;

  return base;
}
