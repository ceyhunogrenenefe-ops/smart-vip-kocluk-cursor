import { apiFetch } from './session';

export type CoachStatRow = {
  coach_id: string;
  coach_name: string;
  coach_email: string | null;
  institution_id: string | null;
  student_count: number;
  active_student_count?: number;
  report_fill_rate: number | null;
  report_filled_slots: number;
  report_expected_slots: number;
  report_students_rate: number | null;
  report_students_filled: number;
  attendance_rate: number | null;
  attendance_present: number;
  attendance_total: number;
  absence_rate?: number | null;
  attendance_absent?: number;
  deneme_entry_rate: number | null;
  deneme_students: number;
  deneme_join_rate: number | null;
  deneme_join_students: number;
  planner_goal_rate: number | null;
  planner_goal_completed: number;
  planner_goal_target: number;
  planner_students_met_rate: number | null;
  planner_students_with_goals: number;
  planner_students_met: number;
  meeting_completion_rate: number | null;
  meetings_completed: number;
  meetings_total: number;
  avg_solved_per_student: number | null;
  solved_total: number;
  composite_score: number | null;
};

export type CoachStatsExamDay = {
  date: string;
  weekday: string;
  exam_names: string[];
  participants: number;
  active_students: number;
  rate: number | null;
};

export type CoachStatsResponse = {
  from: string;
  to: string;
  day_count: number;
  institution_id: string | null;
  filters?: {
    coach_id: string | null;
    class_id: string | null;
  };
  summary: {
    coach_count: number;
    student_count: number;
    active_student_count?: number;
    deneme_participants?: number;
    deneme_participation_rate?: number | null;
    avg_report_fill_rate: number | null;
    avg_attendance_rate: number | null;
    avg_absence_rate?: number | null;
    avg_deneme_entry_rate: number | null;
    avg_deneme_join_rate: number | null;
    avg_planner_goal_rate: number | null;
    avg_meeting_completion_rate: number | null;
    avg_composite_score: number | null;
  };
  exam_days?: CoachStatsExamDay[];
  coaches: CoachStatRow[];
  metric_notes?: Record<string, string>;
};

function qs(params: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export async function fetchCoachStats(opts: {
  from: string;
  to: string;
  institutionId?: string | null;
  coachId?: string | null;
  classId?: string | null;
}): Promise<CoachStatsResponse> {
  const res = await apiFetch(
    `/api/coach-stats${qs({
      from: opts.from,
      to: opts.to,
      institution_id: opts.institutionId || undefined,
      coach_id: opts.coachId || undefined,
      class_id: opts.classId || undefined
    })}`
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Koç istatistikleri alınamadı (${res.status})`);
  }
  return res.json();
}

export type CoachStatsClassOption = { id: string; name: string };

export async function fetchCoachStatsClassOptions(
  institutionId?: string | null
): Promise<CoachStatsClassOption[]> {
  const res = await apiFetch(
    `/api/class-live-lessons${qs({
      scope: 'classes',
      institution_id: institutionId || undefined
    })}`
  );
  if (!res.ok) return [];
  const j = await res.json().catch(() => ({}));
  const rows = (j?.data || j?.classes || []) as Array<{ id?: string; name?: string }>;
  return rows
    .filter((r) => r?.id)
    .map((r) => ({ id: String(r.id), name: String(r.name || 'Sınıf') }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}
