import { apiFetch } from './session';

export type CoachStatRow = {
  coach_id: string;
  coach_name: string;
  coach_email: string | null;
  institution_id: string | null;
  student_count: number;
  report_fill_rate: number | null;
  report_filled_slots: number;
  report_expected_slots: number;
  report_students_rate: number | null;
  report_students_filled: number;
  attendance_rate: number | null;
  attendance_present: number;
  attendance_total: number;
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

export type CoachStatsResponse = {
  from: string;
  to: string;
  day_count: number;
  institution_id: string | null;
  summary: {
    coach_count: number;
    student_count: number;
    avg_report_fill_rate: number | null;
    avg_attendance_rate: number | null;
    avg_deneme_entry_rate: number | null;
    avg_deneme_join_rate: number | null;
    avg_planner_goal_rate: number | null;
    avg_meeting_completion_rate: number | null;
    avg_composite_score: number | null;
  };
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
}): Promise<CoachStatsResponse> {
  const res = await apiFetch(
    `/api/coach-stats${qs({
      from: opts.from,
      to: opts.to,
      institution_id: opts.institutionId || undefined
    })}`
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Koç istatistikleri alınamadı (${res.status})`);
  }
  return res.json();
}
