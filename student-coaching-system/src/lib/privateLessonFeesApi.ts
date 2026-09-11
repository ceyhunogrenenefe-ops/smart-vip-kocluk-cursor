import { apiFetch } from './session';

export type PrivateLessonFeeStatus = 'unpaid' | 'partial' | 'paid';

export type PrivateLessonFeeTeacher = {
  teacher_id: string;
  teacher_name: string;
  hours: number;
};

export type PrivateLessonFeePaymentAccount = {
  id: string;
  label: string;
  bank_name?: string | null;
  account_holder?: string | null;
  iban?: string | null;
  account_type?: string | null;
};

export type PrivateLessonFeeRow = {
  row_key: string;
  student_id: string | null;
  external_student_name?: string | null;
  is_external?: boolean;
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
  payment_account_id?: string | null;
  payment_account?: PrivateLessonFeePaymentAccount | null;
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

export function privateLessonFeeRowKey(row: {
  row_key?: string | null;
  student_id?: string | null;
  external_student_name?: string | null;
  fee_row_id?: string | null;
  id?: string | null;
}): string {
  if (row.row_key) return String(row.row_key);
  const sid = String(row.student_id || '').trim();
  if (sid) return `s:${sid}`;
  const name = String(row.external_student_name || '').trim().toLocaleLowerCase('tr');
  if (name) return `e:${name}`;
  const id = String(row.fee_row_id || row.id || '').trim();
  return id ? `id:${id}` : '';
}

export function formatPaymentAccountLabel(acc?: PrivateLessonFeePaymentAccount | null): string {
  if (!acc) return '—';
  const bank = String(acc.bank_name || '').trim();
  const label = String(acc.label || '').trim();
  if (bank && label && bank !== label) return `${label} · ${bank}`;
  return label || bank || acc.id;
}

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
  const rawRows = (Array.isArray(j.rows) ? j.rows : []) as PrivateLessonFeeRow[];
  return {
    month: String(j.month || params.month),
    from: String(j.from || ''),
    to: String(j.to || ''),
    rows: rawRows.map((r) => ({
      ...r,
      row_key: privateLessonFeeRowKey(r),
      student_id: r.student_id ? String(r.student_id) : null,
      is_external: Boolean(r.is_external || (!r.student_id && r.external_student_name))
    })),
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
  student_id?: string | null;
  is_external?: boolean;
  external_student_name?: string | null;
  fee_row_id?: string | null;
  month: string;
  institution_id?: string | null;
  hours_override?: number | null;
  unit_price_tl?: number;
  amount_collected_tl?: number;
  collection_status?: PrivateLessonFeeStatus | string;
  payment_account_id?: string | null;
  notes?: string | null;
}) {
  const res = await apiFetch('/api/private-lesson-fees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await parseJson(res);
  if (!res.ok) {
    if (j.error === 'schema_missing' && j.hint) {
      throw new Error(`Şema eksik — Supabase’te \`${String(j.hint)}\` çalıştırın`);
    }
    throw new Error(String(j.error || 'Kayıt kaydedilemedi'));
  }
  return j;
}

export async function deletePrivateLessonFee(body: {
  fee_row_id?: string | null;
  student_id?: string | null;
  external_student_name?: string | null;
  month?: string;
  institution_id?: string | null;
}) {
  const res = await apiFetch('/api/private-lesson-fees', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await parseJson(res);
  if (!res.ok) {
    if (j.error === 'schema_missing' && j.hint) {
      throw new Error(`Şema eksik — Supabase’te \`${String(j.hint)}\` çalıştırın`);
    }
    throw new Error(String(j.error || 'Kayıt silinemedi'));
  }
  return j;
}
