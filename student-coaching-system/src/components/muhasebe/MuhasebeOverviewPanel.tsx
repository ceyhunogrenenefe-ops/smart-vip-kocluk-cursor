import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { formatTryAmount } from '../../lib/groupLessonPaymentUnits';
import { todayYmdLocal } from '../../lib/taksitMuhasebe';
import { PAYMENT_TYPE_LABELS } from '../../lib/studentPaymentTrackerApi';
import {
  createInstitutionExpense,
  deleteInstitutionExpense,
  EXPENSE_CATEGORY_LABELS,
  fetchMuhasebePnL,
  type ExpenseCategory,
  type MuhasebePnL
} from '../../lib/muhasebeLedgerApi';

function currentMonthYm() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

type Props = {
  onGoTab?: (tab: 'ogrenci-odeme' | 'ogretmen' | 'sinif-rapor') => void;
};

export default function MuhasebeOverviewPanel({ onGoTab }: Props) {
  const { effectiveUser } = useAuth();
  const { activeInstitutionId } = useApp();
  const isSuper = effectiveUser?.role === 'super_admin';
  const institutionId = String(
    isSuper
      ? activeInstitutionId || effectiveUser?.institution_id || ''
      : effectiveUser?.institution_id || activeInstitutionId || ''
  ).trim();

  const [month, setMonth] = useState(currentMonthYm);
  const [pnl, setPnl] = useState<MuhasebePnL | null>(null);
  const [loading, setLoading] = useState(true);
  const [schemaHint, setSchemaHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: '',
    amount_tl: '',
    item_date: todayYmdLocal(),
    category: 'diger' as ExpenseCategory,
    note: ''
  });

  const reload = useCallback(async () => {
    setLoading(true);
    setSchemaHint(null);
    try {
      const data = await fetchMuhasebePnL({
        institutionId: institutionId || undefined,
        month
      });
      if (data.hint === 'muhasebe_ledger_sql_missing') {
        setSchemaHint(
          'Supabase SQL Editor’da `student-coaching-system/sql/2026-08-06-muhasebe-ledger.sql` dosyasını çalıştırın.'
        );
      }
      setPnl(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Özet yüklenemedi');
      setPnl(null);
    } finally {
      setLoading(false);
    }
  }, [institutionId, month]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const submitExpense = async () => {
    if (!form.title.trim()) {
      toast.error('Gider başlığı gerekli');
      return;
    }
    const amount = Number(form.amount_tl);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Geçerli tutar girin');
      return;
    }
    setBusy(true);
    try {
      await createInstitutionExpense({
        title: form.title.trim(),
        amount_tl: amount,
        item_date: form.item_date || todayYmdLocal(),
        category: form.category,
        note: form.note || null,
        institution_id: institutionId || null
      });
      toast.success('Ekstra gider eklendi');
      setForm((f) => ({ ...f, title: '', amount_tl: '', note: '' }));
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gider eklenemedi');
    } finally {
      setBusy(false);
    }
  };

  const removeExpense = async (id: string) => {
    if (!window.confirm('Bu gider silinsin mi?')) return;
    setBusy(true);
    try {
      await deleteInstitutionExpense(id);
      toast.success('Gider silindi');
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silinemedi');
    } finally {
      setBusy(false);
    }
  };

  const typeBreakdown = useMemo(() => {
    const by = pnl?.gelir?.by_type || {};
    return Object.entries(by)
      .filter(([, v]) => Number(v) > 0)
      .sort((a, b) => Number(b[1]) - Number(a[1]));
  }, [pnl]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wallet className="h-5 w-5 text-emerald-600" />
            Aylık muhasebe özeti
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Öğrenci gelirleri − öğretmen ve ekstra giderler = dönem kârı
          </p>
        </div>
        <label className="text-xs text-slate-500">
          Ay
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          />
        </label>
      </div>

      {schemaHint ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          {schemaHint}
        </div>
      ) : null}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
        </p>
      ) : pnl ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                Toplam gelir
              </p>
              <p className="mt-1 text-2xl font-bold text-emerald-900 dark:text-emerald-100">
                {formatTryAmount(pnl.gelir.toplam)} ₺
              </p>
              <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-200/80">
                Öğrenci {formatTryAmount(pnl.gelir.ogrenci)} · Diğer {formatTryAmount(pnl.gelir.diger)}
              </p>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-900 dark:bg-rose-950/30">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                Toplam gider
              </p>
              <p className="mt-1 text-2xl font-bold text-rose-900 dark:text-rose-100">
                {formatTryAmount(pnl.gider.toplam)} ₺
              </p>
              <p className="mt-1 text-xs text-rose-800/80 dark:text-rose-200/80">
                Öğretmen {formatTryAmount(pnl.gider.ogretmen)} · Diğer {formatTryAmount(pnl.gider.diger)}
              </p>
            </div>
            <div
              className={`rounded-2xl border p-4 ${
                pnl.kar >= 0
                  ? 'border-sky-200 bg-sky-50/70 dark:border-sky-900 dark:bg-sky-950/30'
                  : 'border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30'
              }`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 flex items-center gap-1">
                {pnl.kar >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                Dönem kârı
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                {formatTryAmount(pnl.kar)} ₺
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {pnl.from} — {pnl.to}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Kalan alacak</p>
              <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                {formatTryAmount(pnl.gelir.kalan_alacak)} ₺
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Tahakkuk {formatTryAmount(pnl.gelir.tahakkuk_toplam)} ₺
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Gelir kırılımı</h3>
              <ul className="mt-3 space-y-2 text-sm">
                <li className="flex justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-300">Öğrenci ödemeleri</span>
                  <span className="font-semibold tabular-nums">{formatTryAmount(pnl.gelir.ogrenci)} ₺</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-300">Diğer / dışarıdan gelir</span>
                  <span className="font-semibold tabular-nums">{formatTryAmount(pnl.gelir.diger)} ₺</span>
                </li>
                {typeBreakdown.map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-2 text-xs text-slate-500">
                    <span>{PAYMENT_TYPE_LABELS[k as keyof typeof PAYMENT_TYPE_LABELS] || k}</span>
                    <span className="tabular-nums">{formatTryAmount(Number(v))} ₺</span>
                  </li>
                ))}
              </ul>
              {onGoTab ? (
                <button
                  type="button"
                  onClick={() => onGoTab('ogrenci-odeme')}
                  className="mt-3 text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
                >
                  Öğrenci ödemelerine git →
                </button>
              ) : null}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Gider kırılımı</h3>
              <ul className="mt-3 space-y-2 text-sm">
                <li className="flex justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-300">Öğretmen (ders)</span>
                  <span className="font-semibold tabular-nums">{formatTryAmount(pnl.gider.ogretmen_ders)} ₺</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-300">Öğretmen (ekstra kalem)</span>
                  <span className="font-semibold tabular-nums">{formatTryAmount(pnl.gider.ogretmen_ekstra)} ₺</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-300">Diğer giderler</span>
                  <span className="font-semibold tabular-nums">{formatTryAmount(pnl.gider.diger)} ₺</span>
                </li>
              </ul>
              {onGoTab ? (
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => onGoTab('ogretmen')}
                    className="text-xs font-semibold text-indigo-700 hover:underline dark:text-indigo-300"
                  >
                    Öğretmen ödemelerine git →
                  </button>
                  <button
                    type="button"
                    onClick={() => onGoTab('sinif-rapor')}
                    className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300"
                  >
                    Sınıf raporuna git →
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Ekstra giderler</h3>
              <p className="text-xs text-slate-500">Kira, fatura, malzeme vb. — öğretmen dışı</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <label className="text-xs text-slate-500 lg:col-span-2">
                Başlık
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Örn. Ofis kirası"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                />
              </label>
              <label className="text-xs text-slate-500">
                Kategori
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                >
                  {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-500">
                Tarih
                <input
                  type="date"
                  value={form.item_date}
                  onChange={(e) => setForm((f) => ({ ...f, item_date: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                />
              </label>
              <label className="text-xs text-slate-500">
                Tutar (₺)
                <input
                  type="number"
                  min={0}
                  value={form.amount_tl}
                  onChange={(e) => setForm((f) => ({ ...f, amount_tl: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-slate-500 flex-1 min-w-[160px]">
                Not (opsiyonel)
                <input
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => void submitExpense()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> Gider ekle
              </button>
            </div>

            {(pnl.expenses || []).length === 0 ? (
              <p className="text-sm text-slate-500">Bu ayda ekstra gider yok.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800">
                    <tr>
                      <th className="px-3 py-2 text-left">Tarih</th>
                      <th className="px-3 py-2 text-left">Kategori</th>
                      <th className="px-3 py-2 text-left">Başlık</th>
                      <th className="px-3 py-2 text-right">Tutar</th>
                      <th className="px-3 py-2 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pnl.expenses || []).map((ex) => (
                      <tr key={ex.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">{ex.item_date}</td>
                        <td className="px-3 py-2">
                          {EXPENSE_CATEGORY_LABELS[ex.category] || ex.category}
                        </td>
                        <td className="px-3 py-2">
                          <div>{ex.title}</div>
                          {ex.note ? <div className="text-[11px] text-slate-500">{ex.note}</div> : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">
                          {formatTryAmount(Number(ex.amount_tl))} ₺
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void removeExpense(ex.id)}
                            className="rounded p-1.5 text-red-600 hover:bg-red-50"
                            title="Sil"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-500">Özet yüklenemedi.</p>
      )}
    </div>
  );
}
