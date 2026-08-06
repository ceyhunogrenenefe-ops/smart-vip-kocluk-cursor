import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { CLASS_LEVELS, formatClassLevelLabel } from '../../types';
import { formatTryAmount } from '../../lib/groupLessonPaymentUnits';
import { todayYmdLocal } from '../../lib/taksitMuhasebe';
import {
  createStudentPayment,
  PAYMENT_TYPE_LABELS,
  type PaymentType
} from '../../lib/studentPaymentTrackerApi';
import {
  fetchClassPaymentReport,
  type ClassReportStudent
} from '../../lib/muhasebeLedgerApi';
import {
  AppModal,
  AppModalBody,
  AppModalFooter,
  AppModalHeader
} from '../ui/AppModal';

const REPORT_TYPES: PaymentType[] = [
  'donem_kayit',
  'yaz_kayit',
  'kitap',
  'yazili',
  'kurs',
  'ozel_ders',
  'dis_gelir',
  'diger'
];

function currentMonthYm() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

function typeAmount(row: ClassReportStudent, type: string) {
  return Number(row.totals.by_type?.[type] || 0);
}

export default function MuhasebeClassReportPanel() {
  const { effectiveUser } = useAuth();
  const { activeInstitutionId, students } = useApp();
  const isSuper = effectiveUser?.role === 'super_admin';
  const institutionId = String(
    isSuper
      ? activeInstitutionId || effectiveUser?.institution_id || ''
      : effectiveUser?.institution_id || activeInstitutionId || ''
  ).trim();

  const [classLevel, setClassLevel] = useState<string>('YKS-Sayısal');
  const [month, setMonth] = useState(currentMonthYm);
  const [filterMonth, setFilterMonth] = useState(false);
  const [rows, setRows] = useState<ClassReportStudent[]>([]);
  const [summary, setSummary] = useState({ total: 0, paid: 0, remaining: 0, student_count: 0 });
  const [paymentCount, setPaymentCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    student_id: '',
    student_name: '',
    is_external: false,
    payment_type: 'kitap' as PaymentType,
    title: '',
    amount_total: '',
    amount_paid: '',
    due_date: todayYmdLocal(),
    notes: ''
  });

  const reload = useCallback(async () => {
    if (!classLevel) return;
    setLoading(true);
    try {
      const data = await fetchClassPaymentReport({
        classLevel,
        institutionId: institutionId || undefined,
        allTime: !filterMonth,
        month: filterMonth ? month : undefined
      });
      setRows(data.students);
      setSummary(data.summary);
      setPaymentCount(data.payment_count || 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Rapor yüklenemedi');
      setRows([]);
      setPaymentCount(0);
    } finally {
      setLoading(false);
    }
  }, [classLevel, institutionId, month, filterMonth]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openAddForStudent = (row: ClassReportStudent) => {
    setForm({
      student_id: row.student_id || '',
      student_name: row.student_name,
      is_external: !row.student_id || Boolean(row.is_external),
      payment_type: 'kitap',
      title: '',
      amount_total: '',
      amount_paid: '',
      due_date: todayYmdLocal(),
      notes: ''
    });
    setFormOpen(true);
  };

  const openAddBlank = () => {
    setForm({
      student_id: '',
      student_name: '',
      is_external: false,
      payment_type: 'kitap',
      title: '',
      amount_total: '',
      amount_paid: '',
      due_date: todayYmdLocal(),
      notes: ''
    });
    setFormOpen(true);
  };

  const classStudents = useMemo(() => {
    return students.filter((s) => {
      if (institutionId && s.institutionId && s.institutionId !== institutionId) return false;
      return String(s.classLevel) === String(classLevel);
    });
  }, [students, classLevel, institutionId]);

  const submitLine = async () => {
    const total = Number(form.amount_total);
    if (!Number.isFinite(total) || total < 0) {
      toast.error('Geçerli tutar girin');
      return;
    }
    const paid = form.amount_paid === '' ? total : Number(form.amount_paid);
    if (!Number.isFinite(paid) || paid < 0) {
      toast.error('Geçerli ödenen tutar girin');
      return;
    }

    const isExternal = form.is_external || !form.student_id;
    if (isExternal && !form.student_name.trim()) {
      toast.error('Öğrenci / kişi adı gerekli');
      return;
    }
    if (!isExternal && !form.student_id) {
      toast.error('Öğrenci seçin');
      return;
    }

    setSaving(true);
    try {
      await createStudentPayment({
        is_external: isExternal,
        student_id: isExternal ? null : form.student_id,
        external_student_name: isExternal ? form.student_name.trim() : null,
        class_level: classLevel,
        institution_id: institutionId || null,
        payment_type: form.payment_type,
        title: form.title || null,
        amount_total: total,
        amount_paid: paid,
        due_date: form.due_date || todayYmdLocal(),
        notes: form.notes || null
      });
      toast.success('Ödeme kalemi eklendi');
      setFormOpen(false);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kayıt başarısız');
    } finally {
      setSaving(false);
    }
  };

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Sınıf bazlı gelir raporu</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Muhasebe → Öğrenci ödemelerindeki tüm kayıtlar bu sınıfa göre listelenir. Eksik kalemi elle ekleyebilirsiniz.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddBlank}
          className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" /> Kalem ekle
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/40">
        <label className="text-xs text-slate-500">
          Sınıf
          <select
            value={classLevel}
            onChange={(e) => setClassLevel(e.target.value)}
            className="mt-1 block min-w-[180px] rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          >
            {CLASS_LEVELS.map((c) => (
              <option key={String(c.value)} value={String(c.value)}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 pb-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filterMonth}
            onChange={(e) => setFilterMonth(e.target.checked)}
            className="rounded border-slate-300"
          />
          Sadece seçili ay
        </label>
        {filterMonth ? (
          <label className="text-xs text-slate-500">
            Ay
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="mt-1 block rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
          </label>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-5">
        {[
          { label: 'Öğrenci', value: String(summary.student_count) },
          { label: 'Ödeme kaydı', value: String(paymentCount) },
          { label: 'Tahakkuk', value: `${formatTryAmount(summary.total)} ₺` },
          { label: 'Ödenen', value: `${formatTryAmount(summary.paid)} ₺` },
          { label: 'Kalan', value: `${formatTryAmount(summary.remaining)} ₺` }
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{c.label}</p>
            <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{c.value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40">
          {formatClassLevelLabel(classLevel as never)} sınıfında öğrenci / ödeme kaydı yok.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800">
              <tr>
                <th className="px-3 py-2.5">Öğrenci</th>
                <th className="px-3 py-2.5 text-right">Dönem</th>
                <th className="px-3 py-2.5 text-right">Yaz</th>
                <th className="px-3 py-2.5 text-right">Kitap</th>
                <th className="px-3 py-2.5 text-right">Yazılı</th>
                <th className="px-3 py-2.5 text-right">Toplam</th>
                <th className="px-3 py-2.5 text-right">Ödenen</th>
                <th className="px-3 py-2.5 text-right">Kalan</th>
                <th className="px-3 py-2.5 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const key = String(r.student_id || r.student_name);
                const open = expanded.has(key);
                return (
                  <React.Fragment key={key}>
                    <tr className="border-b border-slate-50 dark:border-slate-800">
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => toggleExpand(key)}
                          className="inline-flex items-center gap-1 font-medium text-slate-900 dark:text-white"
                        >
                          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          {r.student_name}
                        </button>
                        {r.is_external ? (
                          <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                            Dışarıdan
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatTryAmount(typeAmount(r, 'donem_kayit'))}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatTryAmount(typeAmount(r, 'yaz_kayit'))}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatTryAmount(typeAmount(r, 'kitap'))}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatTryAmount(typeAmount(r, 'yazili'))}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                        {formatTryAmount(r.totals.total)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                        {formatTryAmount(r.totals.paid)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-rose-700 dark:text-rose-300">
                        {formatTryAmount(r.totals.remaining)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => openAddForStudent(r)}
                          className="rounded-lg px-2 py-1 text-[11px] font-semibold text-teal-700 hover:bg-teal-50 dark:text-teal-300"
                        >
                          + Kalem
                        </button>
                      </td>
                    </tr>
                    {open ? (
                      <tr className="bg-slate-50/80 dark:bg-slate-800/40">
                        <td colSpan={9} className="px-3 py-2">
                          {r.payments.length === 0 ? (
                            <p className="text-xs text-slate-500">Bu öğrencide ödeme kalemi yok.</p>
                          ) : (
                            <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-200">
                              {r.payments.map((p) => (
                                <li key={p.id} className="flex flex-wrap gap-x-3 gap-y-0.5">
                                  <span className="font-semibold">
                                    {PAYMENT_TYPE_LABELS[p.payment_type as PaymentType] || p.payment_type}
                                  </span>
                                  {p.title ? <span className="text-slate-500">{p.title}</span> : null}
                                  <span className="tabular-nums">
                                    {formatTryAmount(p.amount_total)} ₺ · ödenen {formatTryAmount(p.amount_paid)} ₺
                                  </span>
                                  {p.due_date ? <span className="text-slate-400">vade {p.due_date}</span> : null}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AppModal open={formOpen} onClose={() => setFormOpen(false)} panelClassName="max-w-lg">
        <AppModalHeader>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Ödeme kalemi ekle — {formatClassLevelLabel(classLevel as never)}
          </h3>
          <button type="button" className="text-sm text-slate-500" onClick={() => setFormOpen(false)}>
            Kapat
          </button>
        </AppModalHeader>
        <AppModalBody>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-600 sm:col-span-2">
              Öğrenci
              <select
                value={form.is_external ? '__external__' : form.student_id}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '__external__') {
                    setForm((f) => ({ ...f, is_external: true, student_id: '', student_name: f.student_name }));
                  } else {
                    const st = classStudents.find((s) => s.id === v);
                    setForm((f) => ({
                      ...f,
                      is_external: false,
                      student_id: v,
                      student_name: st?.name || ''
                    }));
                  }
                }}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              >
                <option value="">Seçin</option>
                {classStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                <option value="__external__">Dışarıdan / listede yok</option>
              </select>
            </label>
            {form.is_external ? (
              <label className="text-xs text-slate-600 sm:col-span-2">
                Ad soyad *
                <input
                  value={form.student_name}
                  onChange={(e) => setForm((f) => ({ ...f, student_name: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                />
              </label>
            ) : null}
            <label className="text-xs text-slate-600">
              Kalem türü
              <select
                value={form.payment_type}
                onChange={(e) => setForm((f) => ({ ...f, payment_type: e.target.value as PaymentType }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              >
                {REPORT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {PAYMENT_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-600">
              Tarih
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
            <label className="text-xs text-slate-600 sm:col-span-2">
              Açıklama
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Örn. Matematik seti / 2026 yaz kaydı"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
            <label className="text-xs text-slate-600">
              Tutar (₺)
              <input
                type="number"
                min={0}
                value={form.amount_total}
                onChange={(e) => setForm((f) => ({ ...f, amount_total: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
            <label className="text-xs text-slate-600">
              Ödenen (₺) — boşsa tutarın tamamı
              <input
                type="number"
                min={0}
                value={form.amount_paid}
                onChange={(e) => setForm((f) => ({ ...f, amount_paid: e.target.value }))}
                placeholder="Tamamı için boş bırakın"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
          </div>
        </AppModalBody>
        <AppModalFooter>
          <button
            type="button"
            onClick={() => setFormOpen(false)}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium dark:border-slate-600"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void submitLine()}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Kaydet
          </button>
        </AppModalFooter>
      </AppModal>
    </div>
  );
}
