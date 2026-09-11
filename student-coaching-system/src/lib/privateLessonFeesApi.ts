import { apiFetch } from './session';

export type PrivateLessonFeeStatus = 'unpaid' | 'partial' | 'paid';

export type PrivateLessonFeeTeacher = {
  teacher_id: string;
  teacher_name: string;
  hours: number;
};

export type PrivateLessonFeeRow = {
  student_id: string;
  student_name: string;
  teachers: PrivateLessonFeeTeacher[];
  system_hours: number;
  hours_override: number | null;
  hours: number;
  unit_price_tl: number;
  total_tl: number;
  amount_collected_tl: number;
  remaining_tl: number;
  collection_status: PrivateLessonFeeStatus | string;
  notes?: string | null;
  fee_row_id?: string | null;
};

export type PrivateLessonFeeSummary = {
  student_count: number;
  system_hours: number;
  hours: number;
  total_tl: number;
  collected_tl: number;
  remaining_tl: number;
};

export type PrivateLessonFeesResponse = {
  month: string;
  from: string;
  to: string;
  rows: PrivateLessonFeeRow[];
  summary: PrivateLessonFeeSummary;
  hint?: string | null;
};

export const PRIVATE_LESSON_FEE_STATUS_LABELS: Record<PrivateLessonFeeStatus, string> = {
  unpaid: 'Tahsil edilmedi',
  partial: 'Kısmi tahsilat',
  paid: 'Tahsil edildi'
};

async function parseJson(res: Response) {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export async function fetchPrivateLessonFees(params: {
  month: string;
  institutionId?: string;
}): Promise<PrivateLessonFeesResponse> {
  const qs = new URLSearchParams({ month: params.month });
  if (params.institutionId) qs.set('institution_id', params.institutionId);
  const res = await apiFetch(`/api/private-lesson-fees?${qs}`);
  const j = await parseJson(res);
  if (!res.ok) throw new Error(String(j.error || 'Özel ders ücretleri yüklenemedi'));
  return {
    month: String(j.month || params.month),
    from: String(j.from || ''),
    to: String(j.to || ''),
    rows: (Array.isArray(j.rows) ? j.rows : []) as PrivateLessonFeeRow[],
    summary: (j.summary || {
      student_count: 0,
      system_hours: 0,
      hours: 0,
      total_tl: 0,
      collected_tl: 0,
      remaining_tl: 0
    }) as PrivateLessonFeeSummary,
    hint: (j.hint as string | null | undefined) || null
  };
}

export async function upsertPrivateLessonFee(body: {
  student_id: string;
  month: string;
  institution_id?: string | null;
  hours_override?: number | null;
  unit_price_tl?: number;
  amount_collected_tl?: number;
  collection_status?: PrivateLessonFeeStatus | string;
  notes?: string | null;
}) {
  const res = await apiFetch('/api/private-lesson-fees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await parseJson(res);
  if (!res.ok) throw new Error(String(j.error || 'Kayıt kaydedilemedi'));
  return j;
}
