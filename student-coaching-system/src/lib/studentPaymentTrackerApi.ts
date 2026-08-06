import { apiFetch } from './session';

export type PaymentType = 'yazili' | 'kitap' | 'kurs' | 'ozel_ders' | 'dis_gelir' | 'diger';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'cancelled';
export type PaymentAccountType = 'bank' | 'credit_card';

export type PaymentAccount = {
  id: string;
  institution_id?: string | null;
  label: string;
  bank_name?: string | null;
  account_holder?: string | null;
  iban?: string | null;
  account_type?: PaymentAccountType;
  notes?: string | null;
  active?: boolean;
  sort_order?: number;
};

export type StudentPaymentRecord = {
  id: string;
  institution_id?: string | null;
  student_id?: string | null;
  external_student_name?: string | null;
  is_external?: boolean;
  coach_id?: string | null;
  class_level?: string | null;
  payment_type: PaymentType;
  payment_account_id?: string | null;
  title?: string | null;
  amount_total: number;
  amount_paid: number;
  remaining?: number;
  currency?: string;
  status: PaymentStatus;
  due_date?: string | null;
  paid_at?: string | null;
  contact_phone?: string | null;
  contact_name?: string | null;
  notes?: string | null;
  student_name?: string;
  student_email?: string | null;
  student_phone?: string | null;
  parent_phone?: string | null;
  parent_name?: string | null;
  coach_name?: string | null;
  account_label?: string | null;
  account_bank?: string | null;
  account_holder?: string | null;
  account_iban?: string | null;
  account_type?: PaymentAccountType | null;
  installment_group_id?: string | null;
  installment_no?: number | null;
  installment_count?: number | null;
  contact_phone_resolved?: string | null;
};

export type PaymentTrackerStats = {
  total: number;
  unpaid: number;
  partial: number;
  paid: number;
  overdue?: number;
  remaining_sum: number;
  paid_sum: number;
  total_sum: number;
};

export const ACCOUNT_TYPE_LABELS: Record<PaymentAccountType, string> = {
  bank: 'Banka hesabı',
  credit_card: 'Kredi kartı'
};

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  yazili: 'Yazılı ödemesi',
  kitap: 'Kitap ödemesi',
  kurs: 'Kurs / kayıt',
  ozel_ders: 'Özel ders',
  dis_gelir: 'Dışarıdan gelir',
  diger: 'Diğer'
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Ödenmedi',
  partial: 'Kısmi',
  paid: 'Ödendi',
  cancelled: 'İptal'
};

async function parseJson(res: Response) {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export async function listPaymentAccounts(institutionId?: string, accountType?: PaymentAccountType) {
  const qs = new URLSearchParams({ op: 'accounts' });
  if (institutionId) qs.set('institution_id', institutionId);
  if (accountType) qs.set('account_type', accountType);
  const res = await apiFetch(`/api/student-payment-tracker?${qs}`);
  const j = await parseJson(res);
  if (!res.ok && j.hint !== 'student_payment_tracker_sql_missing') {
    throw new Error(String(j.error || 'Hesaplar yüklenemedi'));
  }
  return {
    data: (Array.isArray(j.data) ? j.data : []) as PaymentAccount[],
    hint: j.hint as string | undefined
  };
}

export async function listStudentPayments(params: {
  institutionId?: string;
  status?: string;
  paymentType?: string;
  studentId?: string;
  coachId?: string;
  paymentAccountId?: string;
  accountType?: PaymentAccountType;
  dueFrom?: string;
  dueTo?: string;
  onlyOverdue?: boolean;
  q?: string;
} = {}) {
  const qs = new URLSearchParams();
  if (params.institutionId) qs.set('institution_id', params.institutionId);
  if (params.status) qs.set('status', params.status);
  if (params.paymentType) qs.set('payment_type', params.paymentType);
  if (params.studentId) qs.set('student_id', params.studentId);
  if (params.coachId) qs.set('coach_id', params.coachId);
  if (params.paymentAccountId) qs.set('payment_account_id', params.paymentAccountId);
  if (params.accountType) qs.set('account_type', params.accountType);
  if (params.dueFrom) qs.set('due_from', params.dueFrom);
  if (params.dueTo) qs.set('due_to', params.dueTo);
  if (params.onlyOverdue) qs.set('only_overdue', '1');
  if (params.q) qs.set('q', params.q);
  const res = await apiFetch(`/api/student-payment-tracker?${qs}`);
  const j = await parseJson(res);
  if (!res.ok && j.hint !== 'student_payment_tracker_sql_missing') {
    throw new Error(String(j.error || 'Ödemeler yüklenemedi'));
  }
  return {
    data: (Array.isArray(j.data) ? j.data : []) as StudentPaymentRecord[],
    stats: (j.stats || null) as PaymentTrackerStats | null,
    hint: j.hint as string | undefined
  };
}

export async function createPaymentAccount(body: Partial<PaymentAccount> & { label: string }) {
  const res = await apiFetch('/api/student-payment-tracker', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'account', ...body })
  });
  const j = await parseJson(res);
  if (!res.ok) throw new Error(String(j.error || 'Hesap eklenemedi'));
  return j.data as PaymentAccount;
}

export async function createStudentPayment(body: Record<string, unknown>) {
  const res = await apiFetch('/api/student-payment-tracker', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await parseJson(res);
  if (!res.ok) throw new Error(String(j.error || 'Kayıt eklenemedi'));
  return j.data as StudentPaymentRecord;
}

export async function patchStudentPayment(body: Record<string, unknown>) {
  const res = await apiFetch('/api/student-payment-tracker', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await parseJson(res);
  if (!res.ok) throw new Error(String(j.error || 'Güncellenemedi'));
  return j.data as StudentPaymentRecord;
}

export async function deleteStudentPayment(id: string, hard = false) {
  const qs = new URLSearchParams({ id });
  if (hard) qs.set('hard', '1');
  const res = await apiFetch(`/api/student-payment-tracker?${qs}`, { method: 'DELETE' });
  const j = await parseJson(res);
  if (!res.ok) throw new Error(String(j.error || 'Silinemedi'));
}

export function buildPaymentWhatsAppMessage(row: StudentPaymentRecord): string {
  const typeLabel = PAYMENT_TYPE_LABELS[row.payment_type] || row.payment_type;
  const remaining = row.remaining ?? Math.max(0, Number(row.amount_total) - Number(row.amount_paid));
  const lines = [
    `Merhaba${row.contact_name ? ` ${row.contact_name}` : ''},`,
    '',
    `*Online VIP Dershane* — ödeme hatırlatması`,
    `Öğrenci: ${row.student_name || row.external_student_name || row.student_id || '—'}`,
    `Tür: ${typeLabel}${row.title ? ` (${row.title})` : ''}`,
    `Toplam: ${Number(row.amount_total).toLocaleString('tr-TR')} ₺`,
    `Ödenen: ${Number(row.amount_paid).toLocaleString('tr-TR')} ₺`,
    `Kalan borç: ${Number(remaining).toLocaleString('tr-TR')} ₺`
  ];
  if (row.account_label) {
    lines.push('', `Hesap: ${row.account_label}`);
    if (row.account_iban) lines.push(`IBAN: ${row.account_iban}`);
  }
  if (row.due_date) {
    lines.push(`Vade: ${new Date(row.due_date + 'T12:00:00').toLocaleDateString('tr-TR')}`);
  }
  if (row.installment_no && row.installment_count) {
    lines.push(`Taksit: ${row.installment_no}/${row.installment_count}`);
  }
  lines.push('', 'Bilgi için yazabilirsiniz. İyi günler.');
  return lines.join('\n');
}
