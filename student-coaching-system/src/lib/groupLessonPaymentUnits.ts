export const GROUP_LESSON_UNIT_MINUTES = 40;

export const GROUP_LESSON_UNIT_PRICE_PRESETS = [400, 500, 600, 700] as const;

export type GroupLessonUnitPricePreset = (typeof GROUP_LESSON_UNIT_PRICE_PRESETS)[number];

const RATES_STORAGE_KEY = 'group_lesson_teacher_unit_rates_v1';

export type TeacherUnitRatesStore = {
  defaultPrice: number;
  byTeacher: Record<string, number>;
};

export function roundLessonUnits(n: number): number {
  return Math.round(Number(n || 0) * 100) / 100;
}

export function formatLessonUnits(n: number): string {
  return roundLessonUnits(n).toLocaleString('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

export function formatTryAmount(n: number): string {
  return roundLessonUnits(n).toLocaleString('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

export function loadTeacherUnitRates(): TeacherUnitRatesStore {
  if (typeof window === 'undefined') {
    return { defaultPrice: 500, byTeacher: {} };
  }
  try {
    const raw = window.localStorage.getItem(RATES_STORAGE_KEY);
    if (!raw) return { defaultPrice: 500, byTeacher: {} };
    const parsed = JSON.parse(raw) as Partial<TeacherUnitRatesStore>;
    return {
      defaultPrice: Number(parsed.defaultPrice) > 0 ? Number(parsed.defaultPrice) : 500,
      byTeacher: parsed.byTeacher && typeof parsed.byTeacher === 'object' ? parsed.byTeacher : {}
    };
  } catch {
    return { defaultPrice: 500, byTeacher: {} };
  }
}

export function saveTeacherUnitRates(store: TeacherUnitRatesStore): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(store));
}

export function unitPriceForTeacher(store: TeacherUnitRatesStore, teacherId: string): number {
  const custom = store.byTeacher[String(teacherId || '').trim()];
  if (custom != null && Number(custom) > 0) return Number(custom);
  return store.defaultPrice > 0 ? store.defaultPrice : 500;
}

const PAYOUTS_STORAGE_KEY = 'group_lesson_teacher_payouts_v1';

export type TeacherPayoutRecord = {
  teacher_id: string;
  period_from: string;
  period_to: string;
  amount_tl?: number | null;
  paid_at?: string | null;
  paid_by?: string | null;
  paid: boolean;
};

function payoutKey(teacherId: string, from: string, to: string): string {
  return `${teacherId}|${from}|${to}`;
}

export function loadLocalTeacherPayouts(from: string, to: string): Map<string, TeacherPayoutRecord> {
  const map = new Map<string, TeacherPayoutRecord>();
  if (typeof window === 'undefined' || !from || !to) return map;
  try {
    const raw = window.localStorage.getItem(PAYOUTS_STORAGE_KEY);
    if (!raw) return map;
    const rows = JSON.parse(raw) as TeacherPayoutRecord[];
    if (!Array.isArray(rows)) return map;
    for (const row of rows) {
      if (row.period_from === from && row.period_to === to && row.paid) {
        map.set(String(row.teacher_id), row);
      }
    }
  } catch {
    /* ignore */
  }
  return map;
}

export function saveLocalTeacherPayout(record: TeacherPayoutRecord): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(PAYOUTS_STORAGE_KEY);
    const rows: TeacherPayoutRecord[] = raw ? (JSON.parse(raw) as TeacherPayoutRecord[]) : [];
    const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
    const key = payoutKey(record.teacher_id, record.period_from, record.period_to);
    const next = list.filter(
      (r) => payoutKey(r.teacher_id, r.period_from, r.period_to) !== key
    );
    if (record.paid) next.push(record);
    window.localStorage.setItem(PAYOUTS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
