import { apiFetch } from './session';

export interface StudentScreenTimeRow {
  id: string;
  student_id: string;
  institution_id: string | null;
  log_date: string;
  screen_minutes: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function unwrap<T>(payload: unknown): T {
  if (payload != null && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export async function fetchScreenTimeLogs(
  studentId: string,
  from: string,
  to: string
): Promise<StudentScreenTimeRow[]> {
  const q = `?student_id=${encodeURIComponent(studentId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const res = await apiFetch(`/api/student-screen-time${q}`);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((payload as { error?: string })?.error || `API (${res.status})`);
  const data = unwrap<StudentScreenTimeRow[]>(payload);
  return Array.isArray(data) ? data : [];
}

export async function upsertScreenTimeLog(body: {
  student_id: string;
  log_date: string;
  screen_minutes: number;
  notes?: string | null;
}): Promise<StudentScreenTimeRow> {
  const res = await apiFetch('/api/student-screen-time', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((payload as { error?: string })?.error || `API (${res.status})`);
  return unwrap<StudentScreenTimeRow>(payload);
}
