import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Save, Table2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  cetEnsurePeriod,
  cetGetMatrix,
  cetUpsertRow,
  type CoachEnrollmentMatrix,
  type CoachEnrollmentRow
} from '../../lib/coachEnrollmentTrackerApi';

const COLUMNS: { key: keyof CoachEnrollmentRow; label: string; hint?: string }[] = [
  { key: 'student_count', label: 'Öğrenci sayısı', hint: 'Sistemden otomatik; düzenlenebilir' },
  { key: 'yaz_kayitli', label: 'Yaz kaydına kayıtlı', hint: 'Yaz kampı / yaz kaydı havuzundaki öğrenci' },
  { key: 'yaz_kayit_olan', label: 'Yaz — kaydolan', hint: 'Kaçı kaydoldu' },
  { key: 'gecis_8_9', label: '8→9 geçen', hint: '8. sınıftan 9. sınıfa geçen' },
  { key: 'gecis_8_9_kayit', label: '8→9 kaydolan', hint: 'Geçişlerden kaçı kaydoldu' },
  { key: 'veli_sayisi', label: 'Veli sayısı' },
  { key: 'referans_istenen', label: 'Referans istenen', hint: 'Kaç veliden referans istendi' },
  { key: 'referans_alinan', label: 'Referans alınan', hint: 'Kaçından referans alındı' },
  { key: 'veli_memnuniyet_video', label: 'Memnuniyet videosu', hint: 'Kaçından veli memnuniyet videosu alındı' }
];

function NumCell({
  value,
  disabled,
  onCommit
}: {
  value: number | null;
  disabled?: boolean;
  onCommit: (n: number | null) => void;
}) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  useEffect(() => {
    setDraft(value == null ? '' : String(value));
  }, [value]);

  return (
    <input
      type="number"
      min={0}
      inputMode="numeric"
      disabled={disabled}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft.trim() === '') {
          if (value !== null) onCommit(null);
          return;
        }
        const n = Math.max(0, Math.floor(Number(draft)));
        if (!Number.isFinite(n)) {
          setDraft(value == null ? '' : String(value));
          return;
        }
        if (n !== value) onCommit(n);
      }}
      className="w-full min-w-[4.5rem] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-center text-sm tabular-nums disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:disabled:bg-slate-800"
    />
  );
}

type Props = {
  isManager: boolean;
  institutionId?: string | null;
};

export default function CoachEnrollmentTrackerPanel({ isManager, institutionId }: Props) {
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<CoachEnrollmentMatrix | null>(null);
  const [tableMissing, setTableMissing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setTableMissing(null);
    try {
      if (isManager) {
        await cetEnsurePeriod({
          institution_id: institutionId || undefined,
          period_key: '2026-yaz',
          label: '2026 Yaz Kayıt Dönemi'
        }).catch(() => null);
      }
      const m = await cetGetMatrix(undefined, institutionId || undefined);
      setMatrix(m);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/table_missing|coach_enrollment/i.test(msg) || /relation.*does not exist/i.test(msg)) {
        setTableMissing(
          'Koç takip tablosu henüz kurulmadı. Supabase SQL Editor’da 2026-08-13-coach-enrollment-tracker.sql dosyasını çalıştırın.'
        );
      } else {
        toast.error(msg || 'Tablo yüklenemedi');
      }
      setMatrix(null);
    } finally {
      setLoading(false);
    }
  }, [institutionId, isManager]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = matrix?.rows || [];
  const totals = useMemo(() => {
    if (matrix?.totals) return matrix.totals;
    const t: Record<string, number> = {};
    for (const c of COLUMNS) {
      t[c.key as string] = rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
    }
    return t;
  }, [matrix, rows]);

  const saveField = async (row: CoachEnrollmentRow, key: string, value: number | null) => {
    if (!matrix?.period?.id || !isManager) return;
    setSavingId(row.coach_id);
    try {
      await cetUpsertRow({
        institution_id: institutionId || undefined,
        period_id: matrix.period.id,
        coach_id: row.coach_id,
        [key]: value
      });
      setMatrix((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: prev.rows.map((r) => (r.coach_id === row.coach_id ? { ...r, [key]: value } : r))
        };
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kayıt başarısız');
      void load();
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (tableMissing) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
        <p className="font-semibold">Kurulum gerekli</p>
        <p className="mt-1">{tableMissing}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
            <Table2 className="h-5 w-5 text-indigo-600" />
            Koç kayıt takibi
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
            {matrix?.period?.label || 'Dönem'} — yaz kaydı, 8→9 geçiş, referans ve veli memnuniyet videosu
            sayıları. Koçluk toplantısında bu tabloyu doldurun.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
        >
          <RefreshCw className="h-4 w-4" /> Yenile
        </button>
      </div>

      {!isManager ? (
        <p className="text-sm text-slate-500">Salt okunur görünüm — düzenleme yöneticidedir.</p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <table className="min-w-[1100px] w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left dark:border-slate-700 dark:bg-slate-800/80">
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-3 font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                Koç
              </th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key as string}
                  title={c.hint}
                  className="whitespace-nowrap px-2 py-3 text-center font-semibold text-slate-700 dark:text-slate-200"
                >
                  {c.label}
                </th>
              ))}
              <th className="px-2 py-3 text-center text-slate-400"> </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 2} className="px-4 py-8 text-center text-slate-500">
                  Bu kurumda koç kaydı bulunamadı.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.coach_id}
                  className="border-b border-slate-100 dark:border-slate-800"
                >
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-slate-900 dark:bg-slate-900 dark:text-slate-50">
                    {row.coach_name}
                    {savingId === row.coach_id ? (
                      <Save className="ml-2 inline h-3.5 w-3.5 animate-pulse text-indigo-500" />
                    ) : null}
                  </td>
                  {COLUMNS.map((c) => (
                    <td key={c.key as string} className="px-1.5 py-1.5">
                      <NumCell
                        value={row[c.key] as number | null}
                        disabled={!isManager}
                        onCommit={(n) => void saveField(row, c.key as string, n)}
                      />
                    </td>
                  ))}
                  <td className="px-2 text-center text-xs text-slate-400">
                    {row.student_count_auto != null ? `oto:${row.student_count_auto}` : ''}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 ? (
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold dark:border-slate-600 dark:bg-slate-800/60">
                <td className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5 dark:bg-slate-800">Toplam</td>
                {COLUMNS.map((c) => (
                  <td
                    key={c.key as string}
                    className="px-2 py-2.5 text-center tabular-nums text-slate-800 dark:text-slate-100"
                  >
                    {totals[c.key as string] ?? 0}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
