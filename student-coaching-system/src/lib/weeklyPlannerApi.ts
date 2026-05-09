import { apiFetch } from './session';

export interface CoachWeeklyGoalRow {
  id: string;
  student_id: string;
  coach_id: string | null;
  institution_id: string | null;
  subject: string;
  title: string;
  target_quantity: number;
  week_start_date: string;
  quantity_unit: string;
  created_at: string;
  updated_at: string;
}

export interface WeeklyPlannerEntryRow {
  id: string;
  student_id: string;
  institution_id: string | null;
  coach_goal_id: string | null;
  subject: string;
  title: string;
  planned_quantity: number;
  completed_quantity: number;
  planner_date: string;
  start_time: string;
  end_time: string;
  status: 'planned' | 'completed' | 'partial' | 'missed';
  created_at: string;
  updated_at: string;
}

function unwrap<T>(payload: unknown): T {
  if (payload != null && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export async function fetchCoachWeeklyGoals(studentId: string, weekStart: string): Promise<CoachWeeklyGoalRow[]> {
  const q = `?student_id=${encodeURIComponent(studentId)}&week_start=${encodeURIComponent(weekStart)}`;
  const res = await apiFetch(`/api/coach-weekly-goals${q}`);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((payload as { error?: string })?.error || `API (${res.status})`);
  const data = unwrap<CoachWeeklyGoalRow[]>(payload);
  return Array.isArray(data) ? data : [];
}

export async function createCoachWeeklyGoal(body: {
  student_id: string;
  subject: string;
  title: string;
  target_quantity: number;
  week_start_date: string;
  quantity_unit?: string;
}): Promise<CoachWeeklyGoalRow> {
  const res = await apiFetch('/api/coach-weekly-goals', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((payload as { error?: string })?.error || `API (${res.status})`);
  return unwrap<CoachWeeklyGoalRow>(payload);
}

export async function deleteCoachWeeklyGoal(id: string): Promise<void> {
  const res = await apiFetch(`/api/coach-weekly-goals?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((payload as { error?: string })?.error || `API (${res.status})`);
}

export async function fetchWeeklyPlannerEntries(
  studentId: string,
  from: string,
  to: string
): Promise<WeeklyPlannerEntryRow[]> {
  const q =
    `?student_id=${encodeURIComponent(studentId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const res = await apiFetch(`/api/weekly-planner-entries${q}`);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((payload as { error?: string })?.error || `API (${res.status})`);
  const data = unwrap<WeeklyPlannerEntryRow[]>(payload);
  return Array.isArray(data) ? data : [];
}

export async function createWeeklyPlannerEntry(
  body: Partial<WeeklyPlannerEntryRow> & {
    student_id: string;
    planner_date: string;
    start_time: string;
    end_time: string;
    title: string;
    subject: string;
    planned_quantity: number;
    coach_goal_id?: string | null;
  }
): Promise<WeeklyPlannerEntryRow> {
  const res = await apiFetch('/api/weekly-planner-entries', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((payload as { error?: string })?.error || `API (${res.status})`);
  return unwrap<WeeklyPlannerEntryRow>(payload);
}

export async function patchWeeklyPlannerEntry(
  id: string,
  patch: Partial<{
    planner_date: string;
    start_time: string;
    end_time: string;
    title: string;
    subject: string;
    planned_quantity: number;
    completed_quantity: number;
    status: WeeklyPlannerEntryRow['status'];
    coach_goal_id: string | null;
  }>
): Promise<WeeklyPlannerEntryRow> {
  const res = await apiFetch(`/api/weekly-planner-entries?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((payload as { error?: string })?.error || `API (${res.status})`);
  return unwrap<WeeklyPlannerEntryRow>(payload);
}

export async function deleteWeeklyPlannerEntry(id: string): Promise<void> {
  const res = await apiFetch(`/api/weekly-planner-entries?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((payload as { error?: string })?.error || `API (${res.status})`);
}
