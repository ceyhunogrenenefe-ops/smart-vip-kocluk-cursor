import { apiFetch } from './session';

export type PayrollRates = {
  group_unit_price_tl: number;
  private_unit_price_tl: number;
  guidance_unit_price_tl: number;
};

export type PayrollExtraItem = {
  id: string;
  label: string;
  amount_tl: number;
  note?: string | null;
  created_at?: string;
};

export type PayrollDeclaration = {
  id: string;
  status: string;
  submitted_at: string | null;
  declared: { group: number; private: number; guidance: number; other: number };
  mismatch: boolean;
};

export type PayrollTeacherCard = {
  teacher_id: string;
  teacher_name: string;
  /** CRM'deki aylık çalışma beyanı — dönem tam bir takvim ayıysa dolu gelir */
  declaration?: PayrollDeclaration | null;
  system: {
    group_units: number;
    private_units: number;
    guidance_units: number;
    group_session_count: number;
    private_session_count: number;
    guidance_session_count: number;
    total_minutes: number;
  };
  approved: {
    group_units: number;
    private_units: number;
    guidance_units: number;
  };
  rates: PayrollRates;
  default_rates: PayrollRates;
  extras: PayrollExtraItem[];
  computed: {
    lesson_gross_tl: number;
    extras_tl: number;
    total_tl: number;
    total_units: number;
    total_hours: number;
  };
  settlement: {
    id: string;
    status: 'draft' | 'paid' | string;
    locked: boolean;
    paid_at?: string | null;
    paid_by?: string | null;
    expense_item_id?: string | null;
    total_tl?: number;
  } | null;
};

export type PayrollSummary = {
  from: string;
  to: string;
  unit_period_minutes: number;
  teachers: PayrollTeacherCard[];
  overview: {
    total_units: number;
    total_hours: number;
    gross_tl: number;
    extras_tl: number;
    net_tl: number;
    paid_tl: number;
    unpaid_tl: number;
    lesson_tl: number;
    guidance_tl: number;
    lesson_units: number;
    guidance_units: number;
    teacher_count: number;
  };
  default_rates?: {
    group_unit_price_tl: number;
    private_unit_price_tl: number;
    guidance_unit_price_tl: number;
  };
  declaration_period?: string | null;
  schema_hint?: string | null;
};

function qs(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  return sp.toString();
}

export async function fetchTeacherPayrollSummary(opts: {
  from: string;
  to: string;
  teacherId?: string;
  institutionId?: string;
}): Promise<PayrollSummary> {
  const q = qs({
    from: opts.from,
    to: opts.to,
    teacher_id: opts.teacherId,
    institution_id: opts.institutionId
  });
  const res = await apiFetch(`/api/teacher-payroll?${q}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.hint || 'Hakediş özeti yüklenemedi');
  return j as PayrollSummary;
}

/** Varsayilan birim ucretler — ogretmene ozel tarife yoksa bunlar kullanilir. */
export async function saveTeacherPayrollDefaultRates(body: {
  group_unit_price_tl: number;
  private_unit_price_tl: number;
  guidance_unit_price_tl: number;
}) {
  const res = await apiFetch('/api/teacher-payroll?op=save-settings', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || 'Birim ücretler kaydedilemedi');
  return j as {
    ok: boolean;
    default_rates: { group_unit_price_tl: number; private_unit_price_tl: number; guidance_unit_price_tl: number };
    message?: string;
  };
}

export async function saveTeacherPayrollRates(body: {
  teacher_id: string;
  group_unit_price_tl: number;
  private_unit_price_tl: number;
  guidance_unit_price_tl: number;
  institution_id?: string | null;
}) {
  const res = await apiFetch('/api/teacher-payroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'save-rates', ...body })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.hint || 'Ücretler kaydedilemedi');
  return j;
}

/** CRM beyanindaki sayilari onayli sayi olarak hakedise aktarir. */
export async function applyTeacherDeclaration(body: {
  teacher_id: string;
  from: string;
  to: string;
  institution_id?: string;
}) {
  const res = await apiFetch('/api/teacher-payroll?op=apply-declaration', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.hint || j.error || 'Beyan aktarılamadı');
  return j;
}

export async function saveTeacherPayrollDraft(body: Record<string, unknown>) {
  const res = await apiFetch('/api/teacher-payroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'save-draft', ...body })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.hint || 'Taslak kaydedilemedi');
  return j;
}

export async function addTeacherPayrollExtra(body: {
  teacher_id: string;
  from: string;
  to: string;
  label: string;
  amount_tl: number;
  note?: string;
  institution_id?: string | null;
}) {
  const res = await apiFetch('/api/teacher-payroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'add-extra', ...body })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.hint || 'Kalem eklenemedi');
  return j;
}

export async function deleteTeacherPayrollExtra(id: string) {
  const res = await apiFetch('/api/teacher-payroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'delete-extra', id })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.hint || 'Kalem silinemedi');
  return j;
}

export async function payTeacherPayroll(body: Record<string, unknown>) {
  const res = await apiFetch('/api/teacher-payroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'pay', ...body })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.hint || 'Ödeme işlenemedi');
  return j;
}

export async function unpayTeacherPayroll(body: {
  teacher_id: string;
  from: string;
  to: string;
  institution_id?: string | null;
}) {
  const res = await apiFetch('/api/teacher-payroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'unpay', ...body })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.hint || 'Ödeme geri alınamadı');
  return j;
}

export function formatPayrollTry(n: number) {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2
  }).format(Number(n) || 0);
}
