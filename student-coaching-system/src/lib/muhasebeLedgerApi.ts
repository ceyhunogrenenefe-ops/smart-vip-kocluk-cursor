import { apiFetch } from './session';
import type { PaymentType } from './studentPaymentTrackerApi';

export type ExpenseCategory =
  | 'kira'
  | 'faturalar'
  | 'maas'
  | 'reklam'
  | 'malzeme'
  | 'yazilim'
  | 'ulasim'
  | 'vergi'
  | 'diger';

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  kira: 'Kira',
  faturalar: 'Faturalar',
  maas: 'Maaş / personel',
  reklam: 'Reklam',
  malzeme: 'Malzeme',
  yazilim: 'Yazılım / abonelik',
  ulasim: 'Ulaşım',
  vergi: 'Vergi / resmi',
  diger: 'Diğer'
};

export type InstitutionExpenseItem = {
  id: string;
  institution_id?: string | null;
  item_date: string;
  category: ExpenseCategory;
  title: string;
  amount_tl: number;
  note?: string | null;
};

export type MuhasebePnL = {
  from: string;
  to: string;
  gelir: {
    ogrenci: number;
    diger: number;
    toplam: number;
    tahakkuk_toplam: number;
    kalan_alacak: number;
    by_type: Record<string, number>;
  };
  gider: {
    ogretmen_ders: number;
    ogretmen_ekstra: number;
    ogretmen: number;
    diger: number;
    toplam: number;
  };
  kar: number;
  expenses: InstitutionExpenseItem[];
  hint?: string | null;
};

export type ClassReportPayment = {
  id: string;
  payment_type: PaymentType | string;
  title?: string | null;
  amount_total: number;
  amount_paid: number;
  remaining: number;
  status: string;
  due_date?: string | null;
};

export type ClassReportStudent = {
  student_id: string | null;
  student_name: string;
  class_level?: string | null;
  contact_phone?: string | null;
  is_external?: boolean;
  payments: ClassReportPayment[];
  totals: {
    total: number;
    paid: number;
    remaining: number;
    by_type: Record<string, number>;
  };
};

async function parseJson(res: Response) {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export async function fetchMuhasebePnL(params: {
  institutionId?: string;
  month?: string;
  from?: string;
  to?: string;
}) {
  const qs = new URLSearchParams();
  if (params.institutionId) qs.set('institution_id', params.institutionId);
  if (params.month) qs.set('month', params.month);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  const res = await apiFetch(`/api/muhasebe-ledger?${qs}`);
  const j = await parseJson(res);
  if (!res.ok && j.hint !== 'muhasebe_ledger_sql_missing') {
    throw new Error(String(j.error || 'Özet yüklenemedi'));
  }
  return j as unknown as MuhasebePnL;
}

export async function createInstitutionExpense(body: {
  title: string;
  amount_tl: number;
  item_date: string;
  category?: ExpenseCategory;
  note?: string | null;
  institution_id?: string | null;
}) {
  const res = await apiFetch('/api/muhasebe-ledger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await parseJson(res);
  if (!res.ok) throw new Error(String(j.error || 'Gider eklenemedi'));
  return j.data as InstitutionExpenseItem;
}

export async function deleteInstitutionExpense(id: string) {
  const qs = new URLSearchParams({ id });
  const res = await apiFetch(`/api/muhasebe-ledger?${qs}`, { method: 'DELETE' });
  const j = await parseJson(res);
  if (!res.ok) throw new Error(String(j.error || 'Gider silinemedi'));
}

export async function fetchClassPaymentReport(params: {
  classLevel: string;
  institutionId?: string;
  month?: string;
  from?: string;
  to?: string;
}) {
  const qs = new URLSearchParams({ op: 'class-report', class_level: params.classLevel });
  if (params.institutionId) qs.set('institution_id', params.institutionId);
  if (params.month) qs.set('month', params.month);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  const res = await apiFetch(`/api/muhasebe-ledger?${qs}`);
  const j = await parseJson(res);
  if (!res.ok) throw new Error(String(j.error || 'Sınıf raporu yüklenemedi'));
  return {
    class_level: String(j.class_level || params.classLevel),
    from: String(j.from || ''),
    to: String(j.to || ''),
    students: (Array.isArray(j.students) ? j.students : []) as ClassReportStudent[],
    summary: (j.summary || { total: 0, paid: 0, remaining: 0, student_count: 0 }) as {
      total: number;
      paid: number;
      remaining: number;
      student_count: number;
    }
  };
}
