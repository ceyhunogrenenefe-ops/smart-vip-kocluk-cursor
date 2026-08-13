import { apiFetch } from './session';

export type CoachEnrollmentPeriod = {
  id: string;
  institution_id: string;
  period_key: string;
  label: string;
  is_active?: boolean;
};

export type CoachEnrollmentRow = {
  coach_id: string;
  coach_name: string;
  metric_id?: string | null;
  student_count: number | null;
  student_count_auto?: number;
  yaz_kayitli: number | null;
  yaz_kayit_olan: number | null;
  gecis_8_9: number | null;
  gecis_8_9_kayit: number | null;
  veli_sayisi: number | null;
  referans_istenen: number | null;
  referans_alinan: number | null;
  veli_memnuniyet_video: number | null;
  notes?: string | null;
  updated_at?: string | null;
};

export type CoachEnrollmentMatrix = {
  period: CoachEnrollmentPeriod | null;
  rows: CoachEnrollmentRow[];
  totals: Record<string, number> | null;
  can_edit?: boolean;
  error?: string;
  message?: string;
  sql_file?: string;
};

async function cetFetch<T = Record<string, unknown>>(
  op: string,
  opts: { method?: string; body?: string; query?: Record<string, string> } = {}
): Promise<T> {
  const sp = new URLSearchParams({ op, ...(opts.query || {}) });
  const res = await apiFetch(`/api/coach-enrollment-tracker?${sp.toString()}`, {
    method: opts.method || 'GET',
    body: opts.body
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok) {
    const err = new Error(j.message || j.error || `HTTP ${res.status}`);
    Object.assign(err, j);
    throw err;
  }
  return j;
}

export async function cetGetPeriods(institutionId?: string) {
  return cetFetch<{ data: CoachEnrollmentPeriod[] }>('periods', {
    query: institutionId ? { institution_id: institutionId } : undefined
  });
}

export async function cetEnsurePeriod(body: {
  institution_id?: string;
  period_key?: string;
  label?: string;
}) {
  return cetFetch<{ data: CoachEnrollmentPeriod; created: boolean }>('ensure-period', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export async function cetGetMatrix(periodId?: string, institutionId?: string) {
  const query: Record<string, string> = {};
  if (periodId) query.period_id = periodId;
  if (institutionId) query.institution_id = institutionId;
  return cetFetch<CoachEnrollmentMatrix>('matrix', { query });
}

export async function cetUpsertRow(body: Record<string, unknown>) {
  return cetFetch<{ data: Record<string, unknown> }>('upsert-row', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}
