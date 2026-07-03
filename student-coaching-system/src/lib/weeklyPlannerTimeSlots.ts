export const PLANNER_GRID_STEP_OPTIONS = [10, 15, 30, 60] as const;
export type PlannerGridStepMinutes = (typeof PLANNER_GRID_STEP_OPTIONS)[number];

const GRID_STEP_STORAGE_KEY = 'weekly-planner-grid-step-minutes';

export type PlannerTimeSlot = {
  startMinutes: number;
  endMinutes: number;
  start: string;
  end: string;
  label: string;
};

export function loadPlannerGridStepMinutes(): PlannerGridStepMinutes {
  try {
    const v = parseInt(localStorage.getItem(GRID_STEP_STORAGE_KEY) || '60', 10);
    return (PLANNER_GRID_STEP_OPTIONS as readonly number[]).includes(v)
      ? (v as PlannerGridStepMinutes)
      : 60;
  } catch {
    return 60;
  }
}

export function savePlannerGridStepMinutes(step: PlannerGridStepMinutes): void {
  try {
    localStorage.setItem(GRID_STEP_STORAGE_KEY, String(step));
  } catch {
    /* ignore */
  }
}

export function minutesToHhmm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function timeToMinutes(t: string): number | null {
  const m = String(t || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  return h * 60 + min;
}

export function buildPlannerTimeSlots(opts?: {
  startHour?: number;
  endHour?: number;
  stepMinutes?: number;
}): PlannerTimeSlot[] {
  const startHour = opts?.startHour ?? 8;
  const endHour = opts?.endHour ?? 23;
  const step = opts?.stepMinutes ?? 60;
  const slots: PlannerTimeSlot[] = [];
  let m = startHour * 60;
  const end = endHour * 60;
  while (m < end) {
    const endM = Math.min(m + step, end);
    slots.push({
      startMinutes: m,
      endMinutes: endM,
      start: minutesToHhmm(m),
      end: minutesToHhmm(endM),
      label: step >= 60 ? minutesToHhmm(m) : `${minutesToHhmm(m)}–${minutesToHhmm(endM)}`,
    });
    m = endM;
  }
  return slots;
}

export function entryMatchesPlannerSlot(entryStart: string, slot: PlannerTimeSlot): boolean {
  const em = timeToMinutes(entryStart);
  if (em == null) return false;
  return em >= slot.startMinutes && em < slot.endMinutes;
}

export function plannerGridRowMinHeight(stepMinutes: number): number {
  if (stepMinutes >= 60) return 58;
  if (stepMinutes >= 30) return 36;
  if (stepMinutes >= 15) return 28;
  return 22;
}

export function buildDistinctPlannerSlots(
  dayDates: string[],
  spanStart: string,
  spanEnd: string,
  needed: number,
  stepMinutes = 60
): { date: string; startTime: string; endTime: string }[] {
  const timeSlots = buildPlannerTimeSlots({ stepMinutes });
  const out: { date: string; startTime: string; endTime: string }[] = [];
  const used = new Set<string>();
  const inSpan = dayDates.filter((d) => d >= spanStart && d <= spanEnd);
  const pushSlots = (dates: string[]) => {
    for (const date of dates) {
      for (const slot of timeSlots) {
        if (out.length >= needed) return;
        const key = `${date}_${slot.start}`;
        if (used.has(key)) continue;
        used.add(key);
        out.push({ date, startTime: slot.start, endTime: slot.end });
      }
    }
  };
  pushSlots(inSpan.length > 0 ? inSpan : dayDates);
  if (out.length < needed) pushSlots(dayDates);
  return out;
}

export function addMinutesToTimeHhmm(start: string, deltaMinutes: number): string {
  const base = timeToMinutes(start);
  if (base == null) return start;
  return minutesToHhmm(Math.min(base + deltaMinutes, 23 * 60 + 59));
}
