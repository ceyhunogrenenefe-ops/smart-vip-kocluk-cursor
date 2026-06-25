import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { apiFetch } from '../../lib/session';
import {
  GROUP_LESSON_UNIT_MINUTES,
  GROUP_LESSON_UNIT_PRICE_PRESETS,
  formatLessonUnits,
  formatTryAmount,
  loadLocalTeacherPayouts,
  loadTeacherUnitRates,
  saveLocalTeacherPayout,
  saveTeacherUnitRates,
  unitPriceForTeacher,
  type TeacherPayoutRecord,
  type TeacherUnitRatesStore
} from '../../lib/groupLessonPaymentUnits';

export type GroupLessonSummaryRow = {
  teacher_id: string;
  class_id: string;
  teacher_name: string;
  class_name: string;
  completed_lesson_count: number;
  total_minutes: number;
  total_hours: number;
  lesson_units_40: number;
  unit_price_tl: number;
  total_amount_tl: number;
};

export type GroupLessonTeacherTotal = {
  teacher_id: string;
  teacher_name: string;
  completed_lesson_count: number;
  total_minutes: number;
  lesson_units_40: number;
  unit_price_tl: number;
  total_amount_tl: number;
};

export type GroupLessonSummarySession = {
  id: string;
  lesson_date: string;
  start_time: string;
  end_time: string;
  subject: string;
  teacher_id: string;
  class_id: string;
  teacher_name: string;
  class_name: string;
  total_minutes: number;
  lesson_units_40: number;
  unit_price_tl: number;
  line_amount_tl: number;
};

type TeacherOption = { id: string; name: string };
type ClassOption = { id: string; name: string };

export type GroupLessonPaymentSummaryProps = {
  teacherCandidates: TeacherOption[];
  classes: ClassOption[];
  summaryFrom: string;
  summaryTo: string;
  summaryTeacherId: string;
  summaryClassId: string;
  onSummaryFromChange: (v: string) => void;
  onSummaryToChange: (v: string) => void;
  onSummaryTeacherIdChange: (v: string) => void;
  onSummaryClassIdChange: (v: string) => void;
  onEditSession: (session: GroupLessonSummarySession) => void;
  onError: (msg: string) => void;
  onNotice: (msg: string) => void;
  summaryRefreshKey?: number;
};

export function GroupLessonPaymentSummary({
  teacherCandidates,
  classes,
  summaryFrom,
  summaryTo,
  summaryTeacherId,
  summaryClassId,
  onSummaryFromChange,
  onSummaryToChange,
  onSummaryTeacherIdChange,
  onSummaryClassIdChange,
  onEditSession,
  onError,
  onNotice,
  summaryRefreshKey = 0
}: GroupLessonPaymentSummaryProps) {
  const [summaryRows, setSummaryRows] = useState<GroupLessonSummaryRow[]>([]);
  const [teacherTotals, setTeacherTotals] = useState<GroupLessonTeacherTotal[]>([]);
  const [summarySessions, setSummarySessions] = useState<GroupLessonSummarySession[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [showSessionDetails, setShowSessionDetails] = useState(true);
  const [payoutByTeacher, setPayoutByTeacher] = useState<Map<string, TeacherPayoutRecord>>(new Map());
  const [payoutBusyId, setPayoutBusyId] = useState('');
  const [rateStore, setRateStore] = useState<TeacherUnitRatesStore>(() => loadTeacherUnitRates());
  const [defaultPriceMode, setDefaultPriceMode] = useState<string>(() => {
    const p = loadTeacherUnitRates().defaultPrice;
    return GROUP_LESSON_UNIT_PRICE_PRESETS.includes(p as (typeof GROUP_LESSON_UNIT_PRICE_PRESETS)[number])
      ? String(p)
      : 'custom';
  });
  const [customDefaultPrice, setCustomDefaultPrice] = useState(String(loadTeacherUnitRates().defaultPrice || 500));

  useEffect(() => {
    saveTeacherUnitRates(rateStore);
  }, [rateStore]);

  const effectiveDefaultPrice = useMemo(() => {
    if (defaultPriceMode !== 'custom') return Number(defaultPriceMode) || 500;
    const n = Number(customDefaultPrice);
    return Number.isFinite(n) && n > 0 ? n : 500;
  }, [defaultPriceMode, customDefaultPrice]);

  const applyDefaultPrice = useCallback((price: number) => {
    setRateStore((prev) => ({ ...prev, defaultPrice: price }));
  }, []);

  useEffect(() => {
    applyDefaultPrice(effectiveDefaultPrice);
  }, [effectiveDefaultPrice, applyDefaultPrice]);

  const loadPayoutsFromServer = useCallback(async () => {
    if (!summaryFrom || !summaryTo) {
      setPayoutByTeacher(new Map());
      return;
    }
    try {
      const qs = new URLSearchParams({
        scope: 'teacher-payouts',
        from: summaryFrom,
        to: summaryTo
      });
      const res = await apiFetch(`/api/class-live-lessons?${qs.toString()}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(j.data)) {
        setPayoutByTeacher(loadLocalTeacherPayouts(summaryFrom, summaryTo));
        return;
      }
      const map = new Map<string, TeacherPayoutRecord>();
      for (const row of j.data as TeacherPayoutRecord[]) {
        const tid = String(row.teacher_id || '').trim();
        if (tid) map.set(tid, { ...row, paid: true });
      }
      setPayoutByTeacher(map);
    } catch {
      setPayoutByTeacher(loadLocalTeacherPayouts(summaryFrom, summaryTo));
    }
  }, [summaryFrom, summaryTo]);

  const toggleTeacherPayout = useCallback(
    async (teacherId: string, amountTl: number, nextPaid: boolean) => {
      const tid = String(teacherId || '').trim();
      if (!tid || !summaryFrom || !summaryTo) return;
      setPayoutBusyId(tid);
      try {
        const res = await apiFetch('/api/class-live-lessons', {
          method: 'PATCH',
          body: JSON.stringify({
            op: 'teacher-payout',
            teacher_id: tid,
            period_from: summaryFrom,
            period_to: summaryTo,
            amount_tl: amountTl,
            paid: nextPaid
          })
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (nextPaid) {
            const local: TeacherPayoutRecord = {
              teacher_id: tid,
              period_from: summaryFrom,
              period_to: summaryTo,
              amount_tl: amountTl,
              paid_at: new Date().toISOString(),
              paid: true
            };
            saveLocalTeacherPayout(local);
            setPayoutByTeacher((prev) => new Map(prev).set(tid, local));
            onNotice(String(j.hint || j.error || 'Ödeme yerel olarak işaretlendi.'));
          } else {
            saveLocalTeacherPayout({
              teacher_id: tid,
              period_from: summaryFrom,
              period_to: summaryTo,
              paid: false
            });
            setPayoutByTeacher((prev) => {
              const next = new Map(prev);
              next.delete(tid);
              return next;
            });
          }
          return;
        }
        if (nextPaid) {
          const row = (j.data || {}) as TeacherPayoutRecord;
          setPayoutByTeacher((prev) =>
            new Map(prev).set(tid, {
              teacher_id: tid,
              period_from: summaryFrom,
              period_to: summaryTo,
              amount_tl: amountTl,
              paid_at: row.paid_at || new Date().toISOString(),
              paid_by: row.paid_by || null,
              paid: true
            })
          );
          onNotice('Öğretmen ödemesi ödendi olarak işaretlendi.');
        } else {
          setPayoutByTeacher((prev) => {
            const next = new Map(prev);
            next.delete(tid);
            return next;
          });
          onNotice('Ödeme işareti kaldırıldı.');
        }
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Ödeme durumu kaydedilemedi');
      } finally {
        setPayoutBusyId('');
      }
    },
    [summaryFrom, summaryTo, onError, onNotice]
  );

  const loadRatesFromServer = useCallback(async () => {
    try {
      const res = await apiFetch('/api/class-live-lessons?scope=teacher-rates');
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(j.data)) return;
      const byTeacher: Record<string, number> = {};
      for (const row of j.data as { teacher_id?: string; unit_price_tl?: number }[]) {
        const tid = String(row.teacher_id || '').trim();
        const price = Number(row.unit_price_tl);
        if (tid && Number.isFinite(price) && price > 0) byTeacher[tid] = price;
      }
      setRateStore((prev) => ({ ...prev, byTeacher: { ...prev.byTeacher, ...byTeacher } }));
    } catch {
      /* localStorage yedek */
    }
  }, []);

  const saveTeacherRate = useCallback(
    async (teacherId: string, unitPrice: number) => {
      const tid = String(teacherId || '').trim();
      if (!tid || !(unitPrice > 0)) return;
      setRateStore((prev) => ({
        ...prev,
        byTeacher: { ...prev.byTeacher, [tid]: unitPrice }
      }));
      try {
        const res = await apiFetch('/api/class-live-lessons', {
          method: 'PATCH',
          body: JSON.stringify({ op: 'teacher-rates', teacher_id: tid, unit_price_tl: unitPrice })
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          onNotice(
            String(j.hint || j.error || 'Ücret kaydedildi (yerel); sunucu tablosu yoksa SQL migration çalıştırın.')
          );
        }
      } catch {
        /* yerel kayıt yeterli */
      }
    },
    [onNotice]
  );

  const enrichWithLocalRates = useCallback(
    (rows: GroupLessonSummaryRow[], sessions: GroupLessonSummarySession[]) => {
      const withRates = rows.map((r) => {
        const unitPrice = unitPriceForTeacher({ ...rateStore, defaultPrice: effectiveDefaultPrice }, r.teacher_id);
        const lessonUnits = r.lesson_units_40;
        return {
          ...r,
          unit_price_tl: unitPrice,
          total_amount_tl: Math.round(lessonUnits * unitPrice * 100) / 100
        };
      });
      const totalsMap = new Map<string, GroupLessonTeacherTotal>();
      for (const row of withRates) {
        const tid = row.teacher_id;
        const cur = totalsMap.get(tid) || {
          teacher_id: tid,
          teacher_name: row.teacher_name,
          completed_lesson_count: 0,
          total_minutes: 0,
          lesson_units_40: 0,
          unit_price_tl: row.unit_price_tl,
          total_amount_tl: 0
        };
        cur.completed_lesson_count += row.completed_lesson_count;
        cur.total_minutes += row.total_minutes;
        cur.lesson_units_40 = Math.round((cur.lesson_units_40 + row.lesson_units_40) * 100) / 100;
        cur.total_amount_tl = Math.round((cur.total_amount_tl + row.total_amount_tl) * 100) / 100;
        cur.unit_price_tl = row.unit_price_tl;
        totalsMap.set(tid, cur);
      }
      const sessionsEnriched = sessions.map((s) => {
        const unitPrice = unitPriceForTeacher({ ...rateStore, defaultPrice: effectiveDefaultPrice }, s.teacher_id);
        return {
          ...s,
          unit_price_tl: unitPrice,
          line_amount_tl: Math.round(s.lesson_units_40 * unitPrice * 100) / 100
        };
      });
      return {
        rows: withRates,
        teacherTotals: [...totalsMap.values()].sort((a, b) =>
          a.teacher_name.localeCompare(b.teacher_name, 'tr')
        ),
        sessions: sessionsEnriched
      };
    },
    [rateStore, effectiveDefaultPrice]
  );

  const loadPaymentSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const qs = new URLSearchParams({ scope: 'summary', include_sessions: '1' });
      if (summaryFrom) qs.set('from', summaryFrom);
      if (summaryTo) qs.set('to', summaryTo);
      if (summaryTeacherId) qs.set('teacher_id', summaryTeacherId);
      if (summaryClassId) qs.set('class_id', summaryClassId);
      const res = await apiFetch(`/api/class-live-lessons?${qs.toString()}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSummaryRows([]);
        setTeacherTotals([]);
        setSummarySessions([]);
        onError(String(j.error || 'Grup ders ödeme özeti alınamadı'));
        return;
      }
      const rawRows = Array.isArray(j.data) ? (j.data as GroupLessonSummaryRow[]) : [];
      const rawSessions = Array.isArray(j.sessions) ? (j.sessions as GroupLessonSummarySession[]) : [];
      const enriched = enrichWithLocalRates(rawRows, rawSessions);
      setSummaryRows(enriched.rows);
      setTeacherTotals(enriched.teacherTotals);
      setSummarySessions(enriched.sessions);
    } catch (e) {
      setSummaryRows([]);
      setTeacherTotals([]);
      setSummarySessions([]);
      onError(e instanceof Error ? e.message : 'Grup ders ödeme özeti alınamadı');
    } finally {
      setSummaryLoading(false);
    }
  }, [
    summaryFrom,
    summaryTo,
    summaryTeacherId,
    summaryClassId,
    enrichWithLocalRates,
    onError
  ]);

  useEffect(() => {
    void loadPayoutsFromServer();
  }, [loadPayoutsFromServer, summaryRefreshKey]);

  useEffect(() => {
    void loadRatesFromServer();
  }, [loadRatesFromServer]);

  useEffect(() => {
    void loadPaymentSummary();
  }, [loadPaymentSummary, summaryRefreshKey]);

  useEffect(() => {
    if (summaryRows.length === 0 && summarySessions.length === 0) return;
    const enriched = enrichWithLocalRates(summaryRows, summarySessions);
    setSummaryRows(enriched.rows);
    setTeacherTotals(enriched.teacherTotals);
    setSummarySessions(enriched.sessions);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnızca ücret store / varsayılan değişince yeniden hesapla
  }, [rateStore, effectiveDefaultPrice]);

  const grandTotal = useMemo(
    () => teacherTotals.reduce((acc, t) => acc + t.total_amount_tl, 0),
    [teacherTotals]
  );

  const paidTotal = useMemo(
    () =>
      teacherTotals.reduce((acc, t) => {
        if (payoutByTeacher.has(t.teacher_id)) return acc + t.total_amount_tl;
        return acc;
      }, 0),
    [teacherTotals, payoutByTeacher]
  );

  const unpaidTotal = useMemo(() => Math.max(0, grandTotal - paidTotal), [grandTotal, paidTotal]);

  const formatPaidAt = (iso: string | null | undefined) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('tr-TR');
  };

  const deleteSummarySession = async (session: GroupLessonSummarySession) => {
    if (
      !window.confirm(
        `${session.lesson_date} ${String(session.start_time).slice(0, 5)} — ${session.subject} oturumu silinsin mi?`
      )
    ) {
      return;
    }
    const res = await apiFetch(`/api/class-live-lessons?session_id=${encodeURIComponent(session.id)}`, {
      method: 'DELETE'
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      onError(String(j.error || 'Oturum silinemedi'));
      return;
    }
    onNotice('Oturum silindi; özet yenilendi.');
    await loadPaymentSummary();
  };

  const renderTeacherPriceCell = (teacherId: string, current: number) => {
    const presetMatch = GROUP_LESSON_UNIT_PRICE_PRESETS.find((p) => p === current);
    const mode = presetMatch ? String(presetMatch) : 'custom';
    return (
      <div className="flex flex-wrap items-center justify-end gap-1">
        <select
          value={mode}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'custom') return;
            void saveTeacherRate(teacherId, Number(v));
          }}
          className="rounded border border-slate-200 px-1.5 py-1 text-xs"
        >
          {GROUP_LESSON_UNIT_PRICE_PRESETS.map((p) => (
            <option key={p} value={String(p)}>
              {p} ₺
            </option>
          ))}
          <option value="custom">Özel</option>
        </select>
        {mode === 'custom' ? (
          <input
            type="number"
            min={1}
            step={50}
            defaultValue={current}
            onBlur={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n > 0) void saveTeacherRate(teacherId, n);
            }}
            className="w-20 rounded border border-slate-200 px-1.5 py-1 text-xs text-right"
          />
        ) : null}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
      <div>
        <h2 className="font-semibold text-slate-800">Grup dersi ödeme özeti (tamamlanan)</h2>
        <p className="text-xs text-slate-500 mt-1">
          Hesaplama {GROUP_LESSON_UNIT_MINUTES} dakikalık birim ders periyoduna göre yapılır (ör. 40 dk = 1 birim, 80
          dk = 2 birim). Admin ve süper admin oturumları düzenleyebilir veya silebilir.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
        <span className="text-xs font-semibold text-indigo-900 w-full sm:w-auto">Varsayılan birim ücret:</span>
        {GROUP_LESSON_UNIT_PRICE_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              setDefaultPriceMode(String(p));
              setCustomDefaultPrice(String(p));
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              effectiveDefaultPrice === p
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-indigo-800 border border-indigo-200'
            }`}
          >
            {p} ₺
          </button>
        ))}
        <label className="flex items-center gap-1 text-xs text-indigo-900">
          Özel:
          <input
            type="number"
            min={1}
            value={customDefaultPrice}
            onChange={(e) => {
              setCustomDefaultPrice(e.target.value);
              setDefaultPriceMode('custom');
            }}
            className="w-24 rounded border border-indigo-200 px-2 py-1 text-right"
          />
          ₺
        </label>
      </div>

      <div className="grid md:grid-cols-5 gap-2">
        <input
          type="date"
          value={summaryFrom}
          onChange={(e) => onSummaryFromChange(e.target.value)}
          className="border border-slate-200 rounded px-3 py-2"
        />
        <input
          type="date"
          value={summaryTo}
          onChange={(e) => onSummaryToChange(e.target.value)}
          className="border border-slate-200 rounded px-3 py-2"
        />
        <select
          value={summaryTeacherId}
          onChange={(e) => onSummaryTeacherIdChange(e.target.value)}
          className="border border-slate-200 rounded px-3 py-2"
        >
          <option value="">Tüm öğretmenler</option>
          {teacherCandidates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={summaryClassId}
          onChange={(e) => onSummaryClassIdChange(e.target.value)}
          className="border border-slate-200 rounded px-3 py-2"
        >
          <option value="">Tüm sınıflar</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void loadPaymentSummary()}
          className="px-4 py-2 rounded bg-indigo-600 text-white text-sm"
        >
          {summaryLoading ? 'Yükleniyor...' : 'Özeti getir'}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Öğretmen</th>
              <th className="px-3 py-2">Sınıf</th>
              <th className="px-3 py-2 text-right">Ders</th>
              <th className="px-3 py-2 text-right">{GROUP_LESSON_UNIT_MINUTES}dk birim</th>
              <th className="px-3 py-2 text-right">Birim ücret</th>
              <th className="px-3 py-2 text-right">Toplam (₺)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {summaryRows.length === 0 && !summaryLoading ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-slate-500">
                  Seçilen tarih aralığında tamamlanan grup dersi bulunamadı.
                </td>
              </tr>
            ) : (
              summaryRows.map((r) => (
                <tr key={`${r.teacher_id}-${r.class_id}`}>
                  <td className="px-3 py-2">{r.teacher_name}</td>
                  <td className="px-3 py-2">{r.class_name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.completed_lesson_count}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-indigo-700">
                    {formatLessonUnits(r.lesson_units_40)}
                  </td>
                  <td className="px-3 py-2">{renderTeacherPriceCell(r.teacher_id, r.unit_price_tl)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700">
                    {formatTryAmount(r.total_amount_tl)} ₺
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {teacherTotals.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-emerald-100 bg-emerald-50/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-emerald-800">
                <th className="px-3 py-2" colSpan={7}>
                  Öğretmen toplamları
                </th>
              </tr>
              <tr className="bg-emerald-50/80 text-left text-xs uppercase tracking-wide text-emerald-900">
                <th className="px-3 py-2">Öğretmen</th>
                <th className="px-3 py-2 text-right">Ders</th>
                <th className="px-3 py-2 text-right">{GROUP_LESSON_UNIT_MINUTES}dk birim</th>
                <th className="px-3 py-2 text-right">Birim ücret</th>
                <th className="px-3 py-2 text-right">Toplam (₺)</th>
                <th className="px-3 py-2 text-center">Ödendi</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-100/80">
              {teacherTotals.map((t) => {
                const payout = payoutByTeacher.get(t.teacher_id);
                const isPaid = Boolean(payout?.paid);
                return (
                <tr key={t.teacher_id} className={isPaid ? 'bg-emerald-50/40' : undefined}>
                  <td className="px-3 py-2 font-medium">{t.teacher_name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.completed_lesson_count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatLessonUnits(t.lesson_units_40)}</td>
                  <td className="px-3 py-2">{renderTeacherPriceCell(t.teacher_id, t.unit_price_tl)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-800">
                    {formatTryAmount(t.total_amount_tl)} ₺
                  </td>
                  <td className="px-3 py-2 text-center">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={isPaid}
                        disabled={payoutBusyId === t.teacher_id}
                        onChange={(e) => void toggleTeacherPayout(t.teacher_id, t.total_amount_tl, e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                      />
                      {isPaid ? (
                        <span className="text-emerald-700">
                          Ödendi{payout?.paid_at ? ` · ${formatPaidAt(payout.paid_at)}` : ''}
                        </span>
                      ) : (
                        <span className="text-amber-700">Bekliyor</span>
                      )}
                    </label>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500 tabular-nums">{t.total_minutes} dk</td>
                </tr>
              );
              })}
              <tr className="bg-emerald-100/60 font-bold">
                <td className="px-3 py-2" colSpan={4}>
                  Genel toplam
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-900">{formatTryAmount(grandTotal)} ₺</td>
                <td className="px-3 py-2 text-center text-xs font-semibold">
                  <div className="text-emerald-800">Ödenen: {formatTryAmount(paidTotal)} ₺</div>
                  <div className="text-amber-800">Bekleyen: {formatTryAmount(unpaidTotal)} ₺</div>
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}

      <div>
        <button
          type="button"
          onClick={() => setShowSessionDetails((v) => !v)}
          className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700 hover:text-indigo-700"
        >
          {showSessionDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          Oturum detayı — düzenle / sil ({summarySessions.length})
        </button>
      </div>

      {showSessionDetails ? (
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 z-[1]">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Tarih</th>
                <th className="px-3 py-2">Saat</th>
                <th className="px-3 py-2">Konu</th>
                <th className="px-3 py-2">Öğretmen</th>
                <th className="px-3 py-2">Sınıf</th>
                <th className="px-3 py-2 text-right">Birim</th>
                <th className="px-3 py-2 text-right">Tutar</th>
                <th className="px-3 py-2 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summarySessions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-center text-slate-500">
                    Oturum yok.
                  </td>
                </tr>
              ) : (
                summarySessions.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">{s.lesson_date}</td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                      {String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)}
                    </td>
                    <td className="px-3 py-2">{s.subject}</td>
                    <td className="px-3 py-2">{s.teacher_name}</td>
                    <td className="px-3 py-2">{s.class_name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatLessonUnits(s.lesson_units_40)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatTryAmount(s.line_amount_tl)} ₺</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          title="Düzenle"
                          onClick={() => onEditSession(s)}
                          className="rounded p-1.5 text-indigo-600 hover:bg-indigo-50"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Sil"
                          onClick={() => void deleteSummarySession(s)}
                          className="rounded p-1.5 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export default GroupLessonPaymentSummary;
