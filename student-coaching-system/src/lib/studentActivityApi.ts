import { apiFetch } from './session';

export type ActivityPeriodType = 'summer' | 'school_year' | 'custom';
export type ActivityStatus = 'active' | 'passive';
export type DisplayActivityStatus = 'active' | 'passive' | 'scheduled';

export type StudentActivityPeriod = {
  id: string;
  student_id: string;
  coach_id?: string | null;
  start_date: string;
  end_date?: string | null;
  status: ActivityStatus;
  period_type: ActivityPeriodType;
  passive_reason?: string | null;
  note?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type StudentActivitySummary = {
  student_id: string;
  display_status: DisplayActivityStatus;
  display_label: string;
  scheduled_start?: string | null;
  active_on_today: boolean;
  periods: StudentActivityPeriod[];
};

export const PERIOD_TYPE_LABELS: Record<ActivityPeriodType, string> = {
  summer: 'Yaz dönemi',
  school_year: 'Eğitim dönemi',
  custom: 'Özel tarih aralığı'
};

export function padYmd(v: string): string {
  return String(v || '').trim().slice(0, 10);
}

export function dateInRange(ymd: string, startYmd: string, endYmd?: string | null): boolean {
  const d = padYmd(ymd);
  const s = padYmd(startYmd);
  const e = endYmd == null || endYmd === '' ? null : padYmd(endYmd);
  if (!d || !s) return false;
  if (d < s) return false;
  if (e && d > e) return false;
  return true;
}

/** Frontend: dönem listesinden tarihte aktif mi? (dönem yoksa true) */
export function isActiveFromPeriods(
  periods: StudentActivityPeriod[] | undefined,
  reportDate: string,
  coachId?: string
): boolean {
  const ymd = padYmd(reportDate);
  const list = periods || [];
  const relevant = list.filter((p) => {
    if (coachId && p.coach_id && String(p.coach_id) !== String(coachId)) return false;
    return dateInRange(ymd, p.start_date, p.end_date);
  });
  if (!relevant.length) {
    if (!list.length) return true;
    if (coachId) {
      const forCoach = list.filter((p) => !p.coach_id || String(p.coach_id) === String(coachId));
      if (!forCoach.length) return true;
    }
    return false;
  }
  const sorted = [...relevant].sort((a, b) =>
    padYmd(b.start_date).localeCompare(padYmd(a.start_date))
  );
  return sorted[0].status === 'active';
}

export async function fetchStudentActivity(params: {
  studentId?: string;
  coachId?: string;
}): Promise<{
  today: string;
  students: StudentActivitySummary[];
  periods_by_student: Record<string, StudentActivityPeriod[]>;
}> {
  const qs = new URLSearchParams();
  if (params.studentId) qs.set('student_id', params.studentId);
  if (params.coachId) qs.set('coach_id', params.coachId);
  const res = await apiFetch(`/api/student-activity?${qs.toString()}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || res.statusText);
  return j;
}

export async function setStudentActivityStatus(body: {
  student_id: string;
  status: ActivityStatus;
  start_date?: string;
  end_date?: string | null;
  period_type?: ActivityPeriodType;
  passive_reason?: string | null;
  note?: string | null;
  coach_id?: string;
}): Promise<{ ok: boolean; period: StudentActivityPeriod }> {
  const res = await apiFetch('/api/student-activity?op=set-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.message || res.statusText);
  return j;
}

export async function createStudentActivityPeriod(body: Record<string, unknown>) {
  const res = await apiFetch('/api/student-activity?op=create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || res.statusText);
  return j;
}
