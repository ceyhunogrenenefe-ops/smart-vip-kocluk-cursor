import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CalendarDays,
  CreditCard,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Wallet
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { formatClassLevelLabel } from '../../types';
import { normalizeWhatsAppPhoneForSend } from '../../lib/whatsappOutbound';
import {
  buildPaymentWhatsAppMessage,
  createPaymentAccount,
  createStudentPayment,
  deleteStudentPayment,
  listPaymentAccounts,
  listStudentPayments,
  patchStudentPayment,
  ACCOUNT_TYPE_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_TYPE_LABELS,
  type PaymentAccount,
  type PaymentAccountType,
  type PaymentStatus,
  type PaymentTrackerStats,
  type PaymentType,
  type StudentPaymentRecord
} from '../../lib/studentPaymentTrackerApi';
import { classifyTaksit, formatTrShortDate, type TaksitDurum } from '../../lib/taksitMuhasebe';
import {
  AppModal,
  AppModalBody,
  AppModalFooter,
  AppModalHeader
} from '../ui/AppModal';

function formatTry(n: number) {
  return `${Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₺`;
}

function statusBadge(status: PaymentStatus) {
  switch (status) {
    case 'paid':
      return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200';
    case 'partial':
      return 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100';
    case 'unpaid':
      return 'bg-amber-100 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100';
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
  }
}

function vadeDurumEtiket(d: TaksitDurum): { text: string; cls: string } {
  switch (d) {
    case 'paid':
      return { text: 'Ödendi', cls: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200' };
    case 'overdue':
      return { text: 'Vadesi geçti', cls: 'bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-200' };
    case 'due_week':
      return { text: '≤7 gün', cls: 'bg-amber-100 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100' };
    case 'due_month':
      return { text: '≤30 gün', cls: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100' };
    default:
      return { text: 'Gelecek', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' };
  }
}

function rowVadeDurum(r: StudentPaymentRecord): TaksitDurum {
  const odendi = r.status === 'paid';
  const vade = String(r.due_date || '').slice(0, 10);
  if (!vade) return odendi ? 'paid' : 'future';
  return classifyTaksit(vade, odendi);
}

const emptyForm = {
  student_id: '',
  payment_type: 'yazili' as PaymentType,
  payment_account_id: '',
  title: '',
  amount_total: '',
  amount_paid: '0',
  due_date: '',
  installment_count: '1',
  contact_phone: '',
  contact_name: '',
  notes: ''
};

export default function StudentPaymentTrackerPanel() {
  const { effectiveUser } = useAuth();
  const { students, coaches, activeInstitutionId } = useApp();
  const isSuper = effectiveUser?.role === 'super_admin';

  const institutionId = String(
    isSuper
      ? activeInstitutionId || effectiveUser?.institution_id || ''
      : effectiveUser?.institution_id || activeInstitutionId || ''
  ).trim();

  const [rows, setRows] = useState<StudentPaymentRecord[]>([]);
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [stats, setStats] = useState<PaymentTrackerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [schemaHint, setSchemaHint] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [q, setQ] = useState('');
  const [channel, setChannel] = useState<PaymentAccountType>('bank');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCoach, setFilterCoach] = useState('');
  const [filterAccount, setFilterAccount] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<StudentPaymentRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const [accountOpen, setAccountOpen] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountForm, setAccountForm] = useState({
    label: '',
    bank_name: '',
    account_holder: '',
    account_type: 'bank' as PaymentAccountType,
    iban: '',
    notes: ''
  });

  const scopedStudents = useMemo(() => {
    if (!institutionId) return students;
    return students.filter((s) => !s.institutionId || s.institutionId === institutionId);
  }, [students, institutionId]);

  const scopedCoaches = useMemo(() => {
    if (!institutionId) return coaches;
    return coaches.filter((c) => !c.institutionId || c.institutionId === institutionId);
  }, [coaches, institutionId]);

  const channelAccounts = useMemo(
    () => accounts.filter((a) => (a.account_type || 'bank') === channel),
    [accounts, channel]
  );

  const channelLabel = ACCOUNT_TYPE_LABELS[channel];
  const isCreditCard = channel === 'credit_card';

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    setSchemaHint(null);
    try {
      const [rec, acc] = await Promise.all([
        listStudentPayments({
          institutionId: institutionId || undefined,
          status: filterStatus || undefined,
          paymentType: filterType || undefined,
          coachId: filterCoach || undefined,
          paymentAccountId: filterAccount || undefined,
          accountType: channel,
          dueFrom: dueFrom || undefined,
          dueTo: dueTo || undefined,
          onlyOverdue: onlyOverdue || undefined,
          q: q.trim() || undefined
        }),
        listPaymentAccounts(institutionId || undefined, channel)
      ]);
      if (rec.hint === 'student_payment_tracker_sql_missing' || acc.hint === 'student_payment_tracker_sql_missing') {
        setSchemaHint(
          'Supabase SQL Editor’da `student-coaching-system/sql/2026-08-05-student-payment-tracker.sql` ve `2026-08-06-student-payment-installments.sql` dosyalarını çalıştırın.'
        );
      }
      setRows(rec.data);
      setStats(rec.stats);
      setAccounts(acc.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [institutionId, filterStatus, filterType, filterCoach, filterAccount, channel, dueFrom, dueTo, onlyOverdue, q]);

  useEffect(() => {
    setFilterAccount('');
  }, [channel]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setEditingRow(null);
    setForm(emptyForm);
  };

  const openCreate = () => {
    setEditingId(null);
    setEditingRow(null);
    setForm({ ...emptyForm, payment_account_id: '' });
    setFormOpen(true);
  };

  const openEdit = (row: StudentPaymentRecord) => {
    setEditingId(row.id);
    setEditingRow(row);
    setForm({
      student_id: row.student_id,
      payment_type: row.payment_type,
      payment_account_id: row.payment_account_id || '',
      title: row.title || '',
      amount_total: String(row.amount_total ?? ''),
      amount_paid: String(row.amount_paid ?? '0'),
      due_date: row.due_date ? String(row.due_date).slice(0, 10) : '',
      installment_count: '1',
      contact_phone: row.contact_phone || row.contact_phone_resolved || '',
      contact_name: row.contact_name || '',
      notes: row.notes || ''
    });
    setFormOpen(true);
  };

  const openAccountModal = (type: PaymentAccountType) => {
    setChannel(type);
    setAccountForm({
      label: '',
      bank_name: '',
      account_holder: '',
      account_type: type,
      iban: '',
      notes: ''
    });
    setAccountOpen(true);
  };

  const onPickStudent = (studentId: string) => {
    const st = scopedStudents.find((s) => s.id === studentId);
    setForm((f) => ({
      ...f,
      student_id: studentId,
      contact_phone: st?.parentPhone || st?.phone || f.contact_phone,
      contact_name: st?.parentName || f.contact_name
    }));
  };

  const submitRecord = async () => {
    if (!editingId && !form.student_id) {
      toast.error('Öğrenci seçin');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await patchStudentPayment({
          id: editingId,
          payment_type: form.payment_type,
          payment_account_id: form.payment_account_id || null,
          title: form.title || null,
          amount_total: Number(form.amount_total || 0),
          amount_paid: Number(form.amount_paid || 0),
          due_date: form.due_date || null,
          contact_phone: form.contact_phone || null,
          contact_name: form.contact_name || null,
          notes: form.notes || null
        });
        toast.success('Ödeme kaydı güncellendi');
      } else {
        const installmentCount = Math.max(1, Math.min(48, Math.round(Number(form.installment_count) || 1)));
        await createStudentPayment({
          student_id: form.student_id,
          institution_id: institutionId || null,
          payment_type: form.payment_type,
          payment_account_id: form.payment_account_id || null,
          title: form.title || null,
          amount_total: Number(form.amount_total || 0),
          amount_paid: Number(form.amount_paid || 0),
          due_date: form.due_date || null,
          installment_count: installmentCount,
          contact_phone: form.contact_phone || null,
          contact_name: form.contact_name || null,
          notes: form.notes || null
        });
        toast.success(installmentCount > 1 ? `${installmentCount} taksit oluşturuldu` : 'Ödeme kaydı eklendi');
      }
      closeForm();
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : editingId ? 'Güncellenemedi' : 'Kayıt başarısız');
    } finally {
      setSaving(false);
    }
  };

  const submitAccount = async () => {
    if (!accountForm.label.trim()) {
      toast.error('Hesap adı gerekli');
      return;
    }
    setAccountSaving(true);
    try {
      await createPaymentAccount({
        label: accountForm.label.trim(),
        bank_name: accountForm.bank_name || null,
        account_holder: accountForm.account_holder || null,
        account_type: accountForm.account_type,
        iban: accountForm.iban || null,
        notes: accountForm.notes || null,
        institution_id: institutionId || null
      });
      toast.success('Ödeme hesabı eklendi');
      setAccountOpen(false);
      setAccountForm({ label: '', bank_name: '', account_holder: '', account_type: 'bank', iban: '', notes: '' });
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hesap eklenemedi');
    } finally {
      setAccountSaving(false);
    }
  };

  const togglePaid = async (row: StudentPaymentRecord, paid: boolean) => {
    try {
      await patchStudentPayment({
        id: row.id,
        amount_paid: paid ? row.amount_total : 0,
        status: paid ? 'paid' : 'unpaid'
      });
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi');
    }
  };

  const markPaid = async (row: StudentPaymentRecord) => {
    try {
      await patchStudentPayment({
        id: row.id,
        amount_paid: row.amount_total,
        status: 'paid'
      });
      toast.success('Ödendi işaretlendi');
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi');
    }
  };

  const updatePaidAmount = async (row: StudentPaymentRecord, paidStr: string) => {
    const paid = Number(paidStr);
    if (Number.isNaN(paid) || paid < 0) return;
    try {
      await patchStudentPayment({ id: row.id, amount_paid: paid });
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi');
    }
  };

  const removeRow = async (row: StudentPaymentRecord) => {
    if (!window.confirm(`${row.student_name} — ${PAYMENT_TYPE_LABELS[row.payment_type]} kaydını silmek istiyor musunuz?`)) {
      return;
    }
    try {
      await deleteStudentPayment(row.id);
      toast.success('Kayıt silindi');
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silinemedi');
    }
  };

  const openWhatsApp = (row: StudentPaymentRecord) => {
    const phone = normalizeWhatsAppPhoneForSend(row.contact_phone_resolved || row.contact_phone || '');
    if (!phone) {
      toast.error('Telefon numarası yok');
      return;
    }
    const text = buildPaymentWhatsAppMessage(row);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wallet className="h-5 w-5 text-emerald-600" />
            Öğrenci ödeme takip
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Banka hesabı ve kredi kartı ödemeleri ayrı takip edilir · taksit · tarih aralığı · WhatsApp
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void reload()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            <RefreshCw className="h-4 w-4" /> Yenile
          </button>
          {isCreditCard ? (
            <button
              type="button"
              onClick={() => openAccountModal('credit_card')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200"
            >
              <CreditCard className="h-4 w-4" /> Kredi kartı ekle
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openAccountModal('bank')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <Building2 className="h-4 w-4" /> Banka hesabı ekle
            </button>
          )}
          <button
            type="button"
            onClick={openCreate}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-white ${
              isCreditCard ? 'bg-violet-600 hover:bg-violet-700' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            <Plus className="h-4 w-4" /> {isCreditCard ? 'Kart ödemesi' : 'Hesap ödemesi'}
          </button>
        </div>
      </div>

      <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800">
        <button
          type="button"
          onClick={() => setChannel('bank')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${
            channel === 'bank'
              ? 'bg-white text-emerald-800 shadow-sm dark:bg-slate-900 dark:text-emerald-200'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
          }`}
        >
          <Building2 className="h-4 w-4" /> Banka hesabı
        </button>
        <button
          type="button"
          onClick={() => setChannel('credit_card')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${
            channel === 'credit_card'
              ? 'bg-white text-violet-800 shadow-sm dark:bg-slate-900 dark:text-violet-200'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
          }`}
        >
          <CreditCard className="h-4 w-4" /> Kredi kartı
        </button>
      </div>

      {schemaHint ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-semibold flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> Veritabanı kurulumu gerekli
          </p>
          <p className="mt-1 text-xs">{schemaHint}</p>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>
      ) : null}

      {stats ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {[
            { label: 'Toplam kayıt', value: String(stats.total), sub: formatTry(stats.total_sum) },
            { label: 'Ödenmedi', value: String(stats.unpaid), sub: '' },
            { label: 'Vadesi geçen', value: String(stats.overdue ?? 0), sub: '' },
            { label: 'Kısmi', value: String(stats.partial), sub: '' },
            { label: 'Ödendi', value: String(stats.paid), sub: formatTry(stats.paid_sum) },
            { label: 'Kalan borç', value: formatTry(stats.remaining_sum), sub: '' }
          ].map((c) => (
            <div
              key={c.label}
              className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{c.label}</p>
              <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{c.value}</p>
              {c.sub ? <p className="text-xs text-slate-500 mt-0.5">{c.sub}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/40">
        <label className="text-xs text-slate-500">
          Ara
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Öğrenci, koç, hesap, telefon…"
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          />
        </label>
        <label className="text-xs text-slate-500">
          Vade başlangıç
          <input
            type="date"
            value={dueFrom}
            onChange={(e) => setDueFrom(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          />
        </label>
        <label className="text-xs text-slate-500">
          Vade bitiş
          <input
            type="date"
            value={dueTo}
            onChange={(e) => setDueTo(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          />
        </label>
        <label className="text-xs text-slate-500">
          Ödeme türü
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="">Tümü</option>
            {Object.entries(PAYMENT_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          Durum
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="">Tümü</option>
            <option value="unpaid">Ödenmedi</option>
            <option value="partial">Kısmi</option>
            <option value="paid">Ödendi</option>
          </select>
        </label>
        <label className="text-xs text-slate-500">
          {isCreditCard ? 'Kredi kartı' : 'Banka hesabı'}
          <select
            value={filterAccount}
            onChange={(e) => setFilterAccount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="">Tümü</option>
            {channelAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          Koç
          <select
            value={filterCoach}
            onChange={(e) => setFilterCoach(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="">Tümü</option>
            {scopedCoaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-end gap-2 text-xs text-slate-600 pb-2 sm:col-span-2">
          <input
            type="checkbox"
            checked={onlyOverdue}
            onChange={(e) => setOnlyOverdue(e.target.checked)}
            className="rounded border-slate-300"
          />
          Sadece vadesi geçenler
        </label>
      </div>

      {channelAccounts.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 self-center">
            {isCreditCard ? 'Kredi kartları:' : 'Banka hesapları:'}
          </span>
          {channelAccounts.map((a) => (
            <span
              key={a.id}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
                isCreditCard
                  ? 'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200'
                  : 'border-slate-200 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200'
              }`}
              title={[a.bank_name, a.account_holder, a.iban].filter(Boolean).join(' · ')}
            >
              {isCreditCard ? (
                <CreditCard className="h-3 w-3 text-violet-600" />
              ) : (
                <Building2 className="h-3 w-3 text-emerald-600" />
              )}
              {a.label}
            </span>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40">
          Henüz {channelLabel.toLowerCase()} tanımlı değil. «{isCreditCard ? 'Kredi kartı ekle' : 'Banka hesabı ekle'}» ile başlayın.
        </p>
      )}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40">
          Bu kanalda henüz ödeme kaydı yok. «{isCreditCard ? 'Kart ödemesi' : 'Hesap ödemesi'}» ile ekleyin.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800">
              <tr>
                <th className="px-3 py-2.5 w-10">Ödendi</th>
                <th className="px-3 py-2.5">Öğrenci</th>
                <th className="px-3 py-2.5">Sınıf / Koç</th>
                <th className="px-3 py-2.5">Tür</th>
                <th className="px-3 py-2.5">{isCreditCard ? 'Kart' : 'Hesap'}</th>
                <th className="px-3 py-2.5">Vade</th>
                <th className="px-3 py-2.5 text-right">Tutar</th>
                <th className="px-3 py-2.5 text-right">Ödenen</th>
                <th className="px-3 py-2.5 text-right">Kalan</th>
                <th className="px-3 py-2.5">Durum</th>
                <th className="px-3 py-2.5 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const vadeDurum = rowVadeDurum(r);
                const vadeEtiket = vadeDurumEtiket(vadeDurum);
                return (
                <tr key={r.id} className="border-b border-slate-50 last:border-0 dark:border-slate-800">
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={r.status === 'paid'}
                      onChange={(e) => void togglePaid(r, e.target.checked)}
                      title="Ödendi işaretle"
                      className="rounded border-slate-300"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-slate-900 dark:text-white">{r.student_name}</div>
                    <div className="text-[11px] text-slate-500">
                      {r.contact_phone_resolved || r.contact_phone || '—'}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                    <div>{r.class_level != null ? formatClassLevelLabel(r.class_level) : '—'}</div>
                    <div className="text-[11px] text-slate-500">{r.coach_name || '—'}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div>{PAYMENT_TYPE_LABELS[r.payment_type] || r.payment_type}</div>
                    {r.title ? <div className="text-[11px] text-slate-500">{r.title}</div> : null}
                    {r.installment_no && r.installment_count ? (
                      <span className="mt-0.5 inline-flex rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-200">
                        Taksit {r.installment_no}/{r.installment_count}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400">
                    {r.account_label || '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    {r.due_date ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-xs text-slate-700 dark:text-slate-300">
                          <CalendarDays className="h-3 w-3 text-slate-400" />
                          {formatTrShortDate(String(r.due_date).slice(0, 10))}
                        </div>
                        <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${vadeEtiket.cls}`}>
                          {vadeEtiket.text}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium">{formatTry(r.amount_total)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      defaultValue={r.amount_paid}
                      key={`${r.id}-${r.amount_paid}`}
                      onBlur={(e) => void updatePaidAmount(r, e.target.value)}
                      className="w-24 rounded border border-slate-200 px-1.5 py-1 text-right text-xs tabular-nums dark:border-slate-600 dark:bg-slate-800"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-rose-700 dark:text-rose-300">
                    {formatTry(r.remaining ?? 0)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadge(r.status)}`}>
                      {PAYMENT_STATUS_LABELS[r.status] || r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <button
                        type="button"
                        title="Düzenle"
                        onClick={() => openEdit(r)}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="WhatsApp"
                        onClick={() => openWhatsApp(r)}
                        className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </button>
                      {r.status !== 'paid' ? (
                        <button
                          type="button"
                          onClick={() => void markPaid(r)}
                          className="rounded-lg px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                        >
                          Ödendi
                        </button>
                      ) : null}
                      <button
                        type="button"
                        title="Sil"
                        onClick={() => void removeRow(r)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AppModal open={formOpen} onClose={closeForm} panelClassName="max-w-lg">
        <AppModalHeader>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {editingId
              ? 'Ödeme kaydını düzenle'
              : isCreditCard
                ? 'Yeni kredi kartı ödemesi'
                : 'Yeni banka hesabı ödemesi'}
          </h3>
          <button type="button" className="text-sm text-slate-500" onClick={closeForm}>
            Kapat
          </button>
        </AppModalHeader>
        <AppModalBody>
          <div className="grid gap-3 sm:grid-cols-2">
            {editingRow?.installment_no && editingRow?.installment_count ? (
              <p className="text-xs text-indigo-700 dark:text-indigo-300 sm:col-span-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 dark:border-indigo-900 dark:bg-indigo-950/30">
                Taksit {editingRow.installment_no}/{editingRow.installment_count} — yalnızca bu satır güncellenir.
              </p>
            ) : null}
            {editingId ? (
              <div className="text-xs text-slate-600 sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-600 dark:bg-slate-800/60">
                <span className="text-slate-500">Öğrenci</span>
                <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-white">
                  {editingRow?.student_name || form.student_id}
                </p>
              </div>
            ) : (
              <label className="text-xs text-slate-600 sm:col-span-2">
                Öğrenci
                <select
                  value={form.student_id}
                  onChange={(e) => onPickStudent(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                >
                  <option value="">Seçin</option>
                  {scopedStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.classLevel != null ? ` · ${formatClassLevelLabel(s.classLevel)}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="text-xs text-slate-600">
              Ödeme türü
              <select
                value={form.payment_type}
                onChange={(e) => setForm((f) => ({ ...f, payment_type: e.target.value as PaymentType }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              >
                {Object.entries(PAYMENT_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-600">
              {isCreditCard ? 'Kredi kartı' : 'Banka hesabı'}
              <select
                value={form.payment_account_id}
                onChange={(e) => setForm((f) => ({ ...f, payment_account_id: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              >
                <option value="">Seçin{channelAccounts.length ? '' : ' — önce kart/hesap ekleyin'}</option>
                {channelAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-600 sm:col-span-2">
              Açıklama
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Örn. 1. dönem yazılı / Matematik seti"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
            <label className="text-xs text-slate-600">
              Toplam tutar (₺)
              <input
                type="number"
                min={0}
                value={form.amount_total}
                onChange={(e) => setForm((f) => ({ ...f, amount_total: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
            {!editingId ? (
              <label className="text-xs text-slate-600">
                Taksit sayısı
                <input
                  type="number"
                  min={1}
                  max={48}
                  value={form.installment_count}
                  onChange={(e) => setForm((f) => ({ ...f, installment_count: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                />
              </label>
            ) : null}
            <label className="text-xs text-slate-600">
              Ödenen (₺){!editingId ? ' — tek kayıt / 1. taksit' : ''}
              <input
                type="number"
                min={0}
                value={form.amount_paid}
                onChange={(e) => setForm((f) => ({ ...f, amount_paid: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
            <label className="text-xs text-slate-600">
              {editingId ? 'Vade' : 'İlk vade'}
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
            <label className="text-xs text-slate-600">
              İletişim adı
              <input
                value={form.contact_name}
                onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                placeholder="Veli adı"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
            <label className="text-xs text-slate-600">
              İletişim (WhatsApp)
              <input
                value={form.contact_phone}
                onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
                placeholder="05xx…"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
            <label className="text-xs text-slate-600 sm:col-span-2">
              Not
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
          </div>
        </AppModalBody>
        <AppModalFooter>
          <button
            type="button"
            onClick={closeForm}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium dark:border-slate-600"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void submitRecord()}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
              isCreditCard ? 'bg-violet-600' : 'bg-emerald-600'
            }`}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {editingId ? 'Güncelle' : 'Kaydet'}
          </button>
        </AppModalFooter>
      </AppModal>

      <AppModal open={accountOpen} onClose={() => setAccountOpen(false)} panelClassName="max-w-md">
        <AppModalHeader>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {accountForm.account_type === 'credit_card' ? 'Kredi kartı ekle' : 'Banka hesabı ekle'}
          </h3>
          <button type="button" className="text-sm text-slate-500" onClick={() => setAccountOpen(false)}>
            Kapat
          </button>
        </AppModalHeader>
        <AppModalBody>
          <div className="grid gap-3">
            <label className="text-xs text-slate-600">
              {accountForm.account_type === 'credit_card' ? 'Kart adı' : 'Hesap adı'} *
              <input
                value={accountForm.label}
                onChange={(e) => setAccountForm((f) => ({ ...f, label: e.target.value }))}
                placeholder={
                  accountForm.account_type === 'credit_card'
                    ? 'Örn. TEB — Songül Öğrenenefe — Kredi Kartı'
                    : 'Örn. Ziraat Bankası — Songül Öğrenenefe'
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
            <label className="text-xs text-slate-600">
              Banka / kurum
              <input
                value={accountForm.bank_name}
                onChange={(e) => setAccountForm((f) => ({ ...f, bank_name: e.target.value }))}
                placeholder={accountForm.account_type === 'credit_card' ? 'TEB / Garanti…' : 'Ziraat / Enpara…'}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
            <input type="hidden" value={accountForm.account_type} readOnly />
            <label className="text-xs text-slate-600">
              Kart / hesap sahibi
              <input
                value={accountForm.account_holder}
                onChange={(e) => setAccountForm((f) => ({ ...f, account_holder: e.target.value }))}
                placeholder="Songül Öğrenenefe"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
            {accountForm.account_type === 'bank' ? (
              <label className="text-xs text-slate-600">
                IBAN
                <input
                  value={accountForm.iban}
                  onChange={(e) => setAccountForm((f) => ({ ...f, iban: e.target.value }))}
                  placeholder="TR…"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                />
              </label>
            ) : null}
            <label className="text-xs text-slate-600">
              Not
              <input
                value={accountForm.notes}
                onChange={(e) => setAccountForm((f) => ({ ...f, notes: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
          </div>
        </AppModalBody>
        <AppModalFooter>
          <button
            type="button"
            onClick={() => setAccountOpen(false)}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium dark:border-slate-600"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={accountSaving}
            onClick={() => void submitAccount()}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
              accountForm.account_type === 'credit_card' ? 'bg-violet-600' : 'bg-indigo-600'
            }`}
          >
            {accountSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Ekle
          </button>
        </AppModalFooter>
      </AppModal>
    </div>
  );
}
