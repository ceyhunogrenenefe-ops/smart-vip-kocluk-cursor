import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GraduationCap, Loader2, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { formatTryAmount } from '../../lib/groupLessonPaymentUnits';
import {
  fetchPrivateLessonFees,
  PRIVATE_LESSON_FEE_STATUS_LABELS,
  upsertPrivateLessonFee,
  type PrivateLessonFeeRow,
  type PrivateLessonFeeStatus,
  type PrivateLessonFeeSummary
} from '../../lib/privateLessonFeesApi';

function currentMonthYm() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

type Draft = {
  hours: string;
  unit_price_tl: string;
  amount_collected_tl: string;
  collection_status: string;
  dirty: boolean;
};

function draftFromRow(row: PrivateLessonFeeRow): Draft {
  return {
    hours: String(row.hours ?? 0),
    unit_price_tl: String(row.unit_price_tl ?? 0),
    amount_collected_tl: String(row.amount_collected_tl ?? 0),
    collection_status: String(row.collection_status || 'unpaid'),
    dirty: false
  };
}

function liveTotal(draft: Draft) {
  const h = Number(draft.hours) || 0;
  const p = Number(draft.unit_price_tl) || 0;
  return Math.round(h * p * 100) / 100;
}

export default function PrivateLessonFeesPanel() {
  const { effectiveUser } = useAuth();
  const { activeInstitutionId } = useApp();
  const isSuper = effectiveUser?.role === 'super_admin';
  const institutionId = String(
    isSuper
      ? activeInstitutionId || effectiveUser?.institution_id || ''
      : effectiveUser?.institution_id || activeInstitutionId || ''
  ).trim();

  const [month, setMonth] = useState(currentMonthYm);
  const [rows, setRows] = useState<PrivateLessonFeeRow[]>([]);
  const [summary, setSummary] = useState<PrivateLessonFeeSummary | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [schemaHint, setSchemaHint] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setSchemaHint(null);
    try {
      const data = await fetchPrivateLessonFees({
        month,
        institutionId: institutionId || undefined
      });
      if (data.hint) {
        setSchemaHint(`Supabase SQL Editor’da \`${data.hint}\` dosyasını çalıştırın.`);
      }
      setRows(data.rows);
      setSummary(data.summary);
      const next: Record<string, Draft> = {};
      for (const row of data.rows) next[row.student_id] = draftFromRow(row);
      setDrafts(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Liste yüklenemedi');
      setRows([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [institutionId, month]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const patchDraft = (studentId: string, patch: Partial<Draft>) => {
    setDrafts((prev) => {
      const row = rows.find((r) => r.student_id === studentId);
      const base = prev[studentId] || (row ? draftFromRow(row) : null);
      if (!base) return prev;
      return { ...prev, [studentId]: { ...base, ...patch, dirty: true } };
    });
  };

  const saveRow = async (row: PrivateLessonFeeRow) => {
    const draft = drafts[row.student_id];
    if (!draft) return;
    const hours = Number(draft.hours);
    const unit = Number(draft.unit_price_tl);
    const collected = Number(draft.amount_collected_tl);
    if (!Number.isFinite(hours) || hours < 0) {
      toast.error('Geçerli ders saati girin');
      return;
    }
    if (!Number.isFinite(unit) || unit < 0) {
      toast.error('Geçerli birim ücret girin');
      return;
    }
    if (!Number.isFinite(collected) || collected < 0) {
      toast.error('Geçerli tahsilat tutarı girin');
      return;
    }

    setSavingId(row.student_id);
    try {
      const hoursOverride =
        Math.abs(hours - Number(row.system_hours || 0)) < 0.001 ? null : hours;
      await upsertPrivateLessonFee({
        student_id: row.student_id,
        month,
        institution_id: institutionId || null,
        hours_override: hoursOverride,
        unit_price_tl: unit,
        amount_collected_tl: collected,
        collection_status: draft.collection_status
      });
      toast.success('Kaydedildi');
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kayıt başarısız');
    } finally {
      setSavingId(null);
    }
  };

  const totals = useMemo(() => {
    let billed = 0;
    let collected = 0;
    for (const row of rows) {
      const d = drafts[row.student_id];
      if (d) {
        billed += liveTotal(d);
        collected += Number(d.amount_collected_tl) || 0;
      } else {
        billed += Number(row.total_tl) || 0;
        collected += Number(row.amount_collected_tl) || 0;
      }
    }
    return {
      billed: Math.round(billed * 100) / 100,
      collected: Math.round(collected * 100) / 100
    };
  }, [rows, drafts]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
            <GraduationCap className="h-5 w-5 text-indigo-600" />
            Özel Ders Ücretleri
          </h2>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            Tamamlanan özel ders saatlerinden hesaplanır. Öğretmen hakediş kayıtlarına dokunulmaz — yalnızca
            veli tahsilatı takip edilir.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-500">
            Ay
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="mt-1 block rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
          </label>
          <button
            type="button"
            onClick={() => void reload()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            <RefreshCw className="h-4 w-4" />
            Yenile
          </button>
        </div>
      </div>

      {schemaHint ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          {schemaHint}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-900 dark:bg-indigo-950/30">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
            Aylık toplam özel ders tutarı
          </p>
          <p className="mt-1 text-2xl font-bold text-indigo-900 dark:text-indigo-100">
            {formatTryAmount(totals.billed)} ₺
          </p>
          <p className="mt-1 text-xs text-indigo-800/80 dark:text-indigo-200/80">
            {summary?.student_count ?? rows.length} öğrenci · {formatTryAmount(summary?.hours ?? 0)} saat
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Aylık toplam özel ders tahsilatı
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-900 dark:text-emerald-100">
            {formatTryAmount(totals.collected)} ₺
          </p>
          <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-200/80">
            Genel bakış gelirine dahil edilir
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Kalan alacak</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
            {formatTryAmount(Math.max(0, totals.billed - totals.collected))} ₺
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Sistem saati (otomatik): {formatTryAmount(summary?.system_hours ?? 0)}
          </p>
        </div>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
        </p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700">
          Bu ay için özel ders öğrencisi / tamamlanan ders bulunamadı.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800">
              <tr>
                <th className="px-3 py-2.5">Öğrenci</th>
                <th className="px-3 py-2.5">Öğretmen(ler)</th>
                <th className="px-3 py-2.5">Ders saati</th>
                <th className="px-3 py-2.5">Birim ücret</th>
                <th className="px-3 py-2.5">Toplam</th>
                <th className="px-3 py-2.5">Tahsilat</th>
                <th className="px-3 py-2.5">Durum</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const draft = drafts[row.student_id] || draftFromRow(row);
                const total = liveTotal(draft);
                return (
                  <tr key={row.student_id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                      {row.student_name}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">
                      {row.teachers.length
                        ? row.teachers.map((t) => t.teacher_name).join(', ')
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        min={0}
                        step={0.25}
                        value={draft.hours}
                        onChange={(e) => patchDraft(row.student_id, { hours: e.target.value })}
                        className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950"
                      />
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        Otomatik: {formatTryAmount(row.system_hours)}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={draft.unit_price_tl}
                        onChange={(e) => patchDraft(row.student_id, { unit_price_tl: e.target.value })}
                        className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950"
                      />
                    </td>
                    <td className="px-3 py-2.5 font-semibold tabular-nums text-slate-900 dark:text-white">
                      {formatTryAmount(total)} ₺
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={draft.amount_collected_tl}
                        onChange={(e) =>
                          patchDraft(row.student_id, { amount_collected_tl: e.target.value })
                        }
                        className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={draft.collection_status}
                        onChange={(e) =>
                          patchDraft(row.student_id, { collection_status: e.target.value })
                        }
                        className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950"
                      >
                        {(Object.keys(PRIVATE_LESSON_FEE_STATUS_LABELS) as PrivateLessonFeeStatus[]).map(
                          (k) => (
                            <option key={k} value={k}>
                              {PRIVATE_LESSON_FEE_STATUS_LABELS[k]}
                            </option>
                          )
                        )}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        disabled={savingId === row.student_id || !draft.dirty}
                        onClick={() => void saveRow(row)}
                        className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {savingId === row.student_id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                        Kaydet
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
