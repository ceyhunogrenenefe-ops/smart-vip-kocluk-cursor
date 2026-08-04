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
  lesson_amount_tl?: number;
  extra_amount_tl?: number;
};

export type TeacherPaymentExtraItem = {
  id: string;
  teacher_id: string;
  kind: string;
  label?: string | null;
  quantity: number;
  unit_price_tl: number;
  amount_tl: number;
  note?: string | null;
  item_date?: string | null;
  period_from?: string;
  period_to?: string;
};

export const TEACHER_EXTRA_KIND_OPTIONS = [
  { id: 'ders', label: 'Ders' },
  { id: 'rehberlik', label: 'Rehberlik' },
  { id: 'ozel_ders', label: 'Özel ders' },
  { id: 'soru_cozumu', label: 'Soru çözümü' },
  { id: 'diger', label: 'Diğer' }
] as const;

export function teacherExtraKindLabel(kind: string, label?: string | null): string {
  if (label && String(label).trim()) return String(label).trim();
  const hit = TEACHER_EXTRA_KIND_OPTIONS.find((k) => k.id === kind);
  return hit?.label || kind || 'Kalem';
}

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
  const [extraItems, setExtraItems] = useState<TeacherPaymentExtraItem[]>([]);
  const [extrasTableMissing, setExtrasTableMissing] = useState(false);
  const [extraBusy, setExtraBusy] = useState(false);
  const [extraForm, setExtraForm] = useState({
    teacherId: '',
    itemDate: '',
    kind: 'rehberlik',
    label: '',
    quantity: '1',
    unitPrice: '500',
    amount: '',
    note: ''
  });
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
    (
      rows: GroupLessonSummaryRow[],
      sessions: GroupLessonSummarySession[],
      extras: TeacherPaymentExtraItem[] = [],
      nameByTeacher: Record<string, string> = {}
    ) => {
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
          total_amount_tl: 0,
          lesson_amount_tl: 0,
          extra_amount_tl: 0
        };
        cur.completed_lesson_count += row.completed_lesson_count;
        cur.total_minutes += row.total_minutes;
        cur.lesson_units_40 = Math.round((cur.lesson_units_40 + row.lesson_units_40) * 100) / 100;
        cur.lesson_amount_tl = Math.round(((cur.lesson_amount_tl || 0) + row.total_amount_tl) * 100) / 100;
        cur.total_amount_tl = cur.lesson_amount_tl;
        cur.unit_price_tl = row.unit_price_tl;
        totalsMap.set(tid, cur);
      }

      const extraByTeacher = new Map<string, number>();
      for (const ex of extras) {
        const tid = String(ex.teacher_id || '').trim();
        if (!tid) continue;
        const amt = Number(ex.amount_tl);
        if (!Number.isFinite(amt)) continue;
        extraByTeacher.set(tid, Math.round(((extraByTeacher.get(tid) || 0) + amt) * 100) / 100);
      }
      for (const [tid, extraAmt] of extraByTeacher.entries()) {
        const cur = totalsMap.get(tid);
        if (cur) {
          cur.extra_amount_tl = extraAmt;
          cur.total_amount_tl = Math.round(((cur.lesson_amount_tl || 0) + extraAmt) * 100) / 100;
        } else {
          totalsMap.set(tid, {
            teacher_id: tid,
            teacher_name: nameByTeacher[tid] || tid,
            completed_lesson_count: 0,
            total_minutes: 0,
            lesson_units_40: 0,
            unit_price_tl: unitPriceForTeacher({ ...rateStore, defaultPrice: effectiveDefaultPrice }, tid),
            lesson_amount_tl: 0,
            extra_amount_tl: extraAmt,
            total_amount_tl: extraAmt
          });
        }
      }
      for (const cur of totalsMap.values()) {
        if (cur.lesson_amount_tl == null) cur.lesson_amount_tl = 0;
        if (cur.extra_amount_tl == null) cur.extra_amount_tl = 0;
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

  const teacherNameLookup = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of teacherCandidates) map[t.id] = t.name;
    for (const t of teacherTotals) map[t.teacher_id] = t.teacher_name;
    return map;
  }, [teacherCandidates, teacherTotals]);

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
        setExtraItems([]);
        onError(String(j.error || 'Grup ders ödeme özeti alınamadı'));
        return;
      }
      const rawRows = Array.isArray(j.data) ? (j.data as GroupLessonSummaryRow[]) : [];
      const rawSessions = Array.isArray(j.sessions) ? (j.sessions as GroupLessonSummarySession[]) : [];
      const rawExtras = Array.isArray(j.extra_items) ? (j.extra_items as TeacherPaymentExtraItem[]) : [];
      setExtrasTableMissing(Boolean(j.extras_table_missing));
      setExtraItems(rawExtras);
      const nameMap: Record<string, string> = {};
      for (const t of teacherCandidates) nameMap[t.id] = t.name;
      for (const row of rawRows) nameMap[row.teacher_id] = row.teacher_name;
      const enriched = enrichWithLocalRates(rawRows, rawSessions, rawExtras, nameMap);
      setSummaryRows(enriched.rows);
      setTeacherTotals(enriched.teacherTotals);
      setSummarySessions(enriched.sessions);
    } catch (e) {
      setSummaryRows([]);
      setTeacherTotals([]);
      setSummarySessions([]);
      setExtraItems([]);
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
    onError,
    teacherCandidates
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
    if (summaryRows.length === 0 && summarySessions.length === 0 && extraItems.length === 0) return;
    const enriched = enrichWithLocalRates(summaryRows, summarySessions, extraItems, teacherNameLookup);
    setSummaryRows(enriched.rows);
    setTeacherTotals(enriched.teacherTotals);
    setSummarySessions(enriched.sessions);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnızca ücret store / varsayılan / ek kalem değişince yeniden hesapla
  }, [rateStore, effectiveDefaultPrice, extraItems]);

  const computedExtraAmount = useMemo(() => {
    const q = Number(extraForm.quantity);
    const p = Number(extraForm.unitPrice);
    if (!Number.isFinite(q) || !Number.isFinite(p) || q <= 0 || p < 0) return 0;
    return Math.round(q * p * 100) / 100;
  }, [extraForm.quantity, extraForm.unitPrice]);

  useEffect(() => {
    setExtraForm((f) => {
      if (f.itemDate) return f;
      const fallback = summaryTo || new Date().toISOString().slice(0, 10);
      return { ...f, itemDate: fallback };
    });
  }, [summaryTo]);

  const addExtraItem = async () => {
    if (!summaryFrom || !summaryTo) {
      onError('Önce tarih aralığı seçin');
      return;
    }
    const teacherId = String(extraForm.teacherId || summaryTeacherId || '').trim();
    if (!teacherId) {
      onError('Öğretmen seçin');
      return;
    }
    const itemDate = String(extraForm.itemDate || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(itemDate)) {
      onError('Kalem tarihi seçin');
      return;
    }
    const quantity = Number(extraForm.quantity);
    const unitPrice = Number(extraForm.unitPrice);
    const amountRaw = String(extraForm.amount || '').trim();
    const amountTl = amountRaw ? Number(amountRaw) : computedExtraAmount;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      onError('Birim (adet) geçersiz');
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      onError('Birim fiyat geçersiz');
      return;
    }
    if (!Number.isFinite(amountTl) || amountTl < 0) {
      onError('Ücret geçersiz');
      return;
    }
    setExtraBusy(true);
    try {
      const res = await apiFetch('/api/class-live-lessons?op=teacher-extra-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacher_id: teacherId,
          period_from: summaryFrom,
          period_to: summaryTo,
          item_date: itemDate,
          kind: extraForm.kind,
          label: extraForm.kind === 'diger' ? extraForm.label : undefined,
          quantity,
          unit_price_tl: unitPrice,
          amount_tl: amountTl,
          note: extraForm.note || undefined
        })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError(String(j.hint || j.error || 'Kalem eklenemedi'));
        if (j.error === 'teacher_extras_table_missing' || j.error === 'item_date_column_missing') {
          setExtrasTableMissing(true);
        }
        return;
      }
      onNotice('Ek kalem eklendi; toplam güncellendi.');
      setExtraForm((f) => ({ ...f, label: '', note: '', amount: '', quantity: '1' }));
      await loadPaymentSummary();
    } finally {
      setExtraBusy(false);
    }
  };

  const deleteExtraItem = async (id: string) => {
    if (!window.confirm('Bu ek kalem silinsin mi?')) return;
    setExtraBusy(true);
    try {
      const res = await apiFetch('/api/class-live-lessons?op=delete-teacher-extra-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError(String(j.hint || j.error || 'Kalem silinemedi'));
        return;
      }
      onNotice('Ek kalem silindi.');
      await loadPaymentSummary();
    } finally {
      setExtraBusy(false);
    }
  };

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
          Hesaplama {GROUP_LESSON_UNIT_MINUTES} dakikalık birim ders periyoduna göre yapılır. Ödeme sırasında
          rehberlik / özel ders / soru çözümü gibi ek kalemleri birim fiyat ve ücretle ekleyebilirsiniz.
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

      {/* Ek kalem formu her zaman görünür (ödeme dönemine manuel satır) */}
      {!(teacherTotals.length > 0 || extraItems.length > 0) ? (
        <div className="rounded-lg border border-indigo-200 bg-white p-3 space-y-3">
          <h3 className="text-sm font-bold text-indigo-900">Ek kalem ekle (ödeme)</h3>
          <p className="text-xs text-slate-500">
            Bu dönemde tamamlanan grup dersi yoksa bile rehberlik / özel ders / soru çözümü kalemi ekleyebilirsiniz.
          </p>
          {extrasTableMissing ? (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              SQL tablosu eksik: <code className="font-mono">sql/2026-08-04-teacher-payment-extra-items.sql</code> ve{' '}
              <code className="font-mono">sql/2026-08-04b-teacher-payment-extra-item-date.sql</code>
            </p>
          ) : null}
          <div className="grid gap-2 md:grid-cols-7">
            <input
              type="date"
              value={extraForm.itemDate}
              onChange={(e) => setExtraForm((f) => ({ ...f, itemDate: e.target.value }))}
              className="rounded border border-slate-200 px-2 py-2 text-sm"
              title="Kalem tarihi"
            />
            <select
              value={extraForm.teacherId || summaryTeacherId}
              onChange={(e) => setExtraForm((f) => ({ ...f, teacherId: e.target.value }))}
              className="rounded border border-slate-200 px-2 py-2 text-sm md:col-span-2"
            >
              <option value="">Öğretmen seçin</option>
              {teacherCandidates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              value={extraForm.kind}
              onChange={(e) => setExtraForm((f) => ({ ...f, kind: e.target.value }))}
              className="rounded border border-slate-200 px-2 py-2 text-sm"
            >
              {TEACHER_EXTRA_KIND_OPTIONS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={extraForm.quantity}
              onChange={(e) => setExtraForm((f) => ({ ...f, quantity: e.target.value }))}
              className="rounded border border-slate-200 px-2 py-2 text-sm text-right"
              placeholder="Birim"
            />
            <input
              type="number"
              min={0}
              step={50}
              value={extraForm.unitPrice}
              onChange={(e) => setExtraForm((f) => ({ ...f, unitPrice: e.target.value }))}
              className="rounded border border-slate-200 px-2 py-2 text-sm text-right"
              placeholder="Birim fiyat"
            />
            <input
              type="number"
              min={0}
              step={50}
              value={extraForm.amount}
              onChange={(e) => setExtraForm((f) => ({ ...f, amount: e.target.value }))}
              className="rounded border border-slate-200 px-2 py-2 text-sm text-right"
              placeholder={`Ücret (${formatTryAmount(computedExtraAmount)})`}
            />
          </div>
          <button
            type="button"
            disabled={extraBusy || extrasTableMissing}
            onClick={() => void addExtraItem()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {extraBusy ? 'Ekleniyor…' : 'Kalem ekle'}
          </button>
        </div>
      ) : null}

      {teacherTotals.length > 0 || extraItems.length > 0 ? (
        <div className="space-y-3 rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-emerald-800">
                <th className="px-3 py-2" colSpan={8}>
                  Öğretmen toplamları
                </th>
              </tr>
              <tr className="bg-emerald-50/80 text-left text-xs uppercase tracking-wide text-emerald-900">
                <th className="px-3 py-2">Öğretmen</th>
                <th className="px-3 py-2 text-right">Ders</th>
                <th className="px-3 py-2 text-right">{GROUP_LESSON_UNIT_MINUTES}dk birim</th>
                <th className="px-3 py-2 text-right">Birim ücret</th>
                <th className="px-3 py-2 text-right">Grup dersi</th>
                <th className="px-3 py-2 text-right">Ek kalem</th>
                <th className="px-3 py-2 text-right">Toplam (₺)</th>
                <th className="px-3 py-2 text-center">Ödendi</th>
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
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                    {formatTryAmount(t.lesson_amount_tl || 0)} ₺
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-indigo-700">
                    {formatTryAmount(t.extra_amount_tl || 0)} ₺
                  </td>
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
                </tr>
              );
              })}
              <tr className="bg-emerald-100/60 font-bold">
                <td className="px-3 py-2" colSpan={6}>
                  Genel toplam
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-900">{formatTryAmount(grandTotal)} ₺</td>
                <td className="px-3 py-2 text-center text-xs font-semibold">
                  <div className="text-emerald-800">Ödenen: {formatTryAmount(paidTotal)} ₺</div>
                  <div className="text-amber-800">Bekleyen: {formatTryAmount(unpaidTotal)} ₺</div>
                </td>
              </tr>
            </tbody>
          </table>
          </div>

          <div className="rounded-lg border border-indigo-200 bg-white p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-indigo-900">Ek kalem ekle (ödeme)</h3>
              <p className="text-xs text-slate-500">
                Rehberlik, özel ders, soru çözümü vb. — birim × birim fiyat = ücret
              </p>
            </div>
            {extrasTableMissing ? (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                SQL tablosu eksik. Supabase’te çalıştırın:{' '}
                <code className="font-mono">sql/2026-08-04-teacher-payment-extra-items.sql</code> ve{' '}
                <code className="font-mono">sql/2026-08-04b-teacher-payment-extra-item-date.sql</code>
              </p>
            ) : null}
            <div className="grid gap-2 md:grid-cols-7">
              <input
                type="date"
                value={extraForm.itemDate}
                onChange={(e) => setExtraForm((f) => ({ ...f, itemDate: e.target.value }))}
                className="rounded border border-slate-200 px-2 py-2 text-sm"
                title="Kalem tarihi"
              />
              <select
                value={extraForm.teacherId || summaryTeacherId}
                onChange={(e) => setExtraForm((f) => ({ ...f, teacherId: e.target.value }))}
                className="rounded border border-slate-200 px-2 py-2 text-sm md:col-span-2"
              >
                <option value="">Öğretmen seçin</option>
                {teacherCandidates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <select
                value={extraForm.kind}
                onChange={(e) => setExtraForm((f) => ({ ...f, kind: e.target.value }))}
                className="rounded border border-slate-200 px-2 py-2 text-sm"
              >
                {TEACHER_EXTRA_KIND_OPTIONS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={extraForm.quantity}
                onChange={(e) => setExtraForm((f) => ({ ...f, quantity: e.target.value }))}
                className="rounded border border-slate-200 px-2 py-2 text-sm text-right"
                placeholder="Birim"
                title="Birim (adet)"
              />
              <input
                type="number"
                min={0}
                step={50}
                value={extraForm.unitPrice}
                onChange={(e) => setExtraForm((f) => ({ ...f, unitPrice: e.target.value }))}
                className="rounded border border-slate-200 px-2 py-2 text-sm text-right"
                placeholder="Birim fiyat"
                title="Birim fiyat (₺)"
              />
              <input
                type="number"
                min={0}
                step={50}
                value={extraForm.amount}
                onChange={(e) => setExtraForm((f) => ({ ...f, amount: e.target.value }))}
                className="rounded border border-slate-200 px-2 py-2 text-sm text-right"
                placeholder={`Ücret (${formatTryAmount(computedExtraAmount)})`}
                title="Ücret (boşsa birim × fiyat)"
              />
            </div>
            {extraForm.kind === 'diger' ? (
              <input
                value={extraForm.label}
                onChange={(e) => setExtraForm((f) => ({ ...f, label: e.target.value }))}
                className="w-full rounded border border-slate-200 px-2 py-2 text-sm"
                placeholder="Diğer kalem adı"
              />
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={extraForm.note}
                onChange={(e) => setExtraForm((f) => ({ ...f, note: e.target.value }))}
                className="flex-1 min-w-[180px] rounded border border-slate-200 px-2 py-2 text-sm"
                placeholder="Not (opsiyonel)"
              />
              <button
                type="button"
                disabled={extraBusy || extrasTableMissing}
                onClick={() => void addExtraItem()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {extraBusy ? 'Ekleniyor…' : 'Kalem ekle'}
              </button>
            </div>

            {extraItems.length > 0 ? (
              <div className="overflow-x-auto rounded border border-slate-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-left text-slate-500 uppercase tracking-wide">
                      <th className="px-2 py-1.5">Tarih</th>
                      <th className="px-2 py-1.5">Öğretmen</th>
                      <th className="px-2 py-1.5">Kalem</th>
                      <th className="px-2 py-1.5 text-right">Birim</th>
                      <th className="px-2 py-1.5 text-right">Birim fiyat</th>
                      <th className="px-2 py-1.5 text-right">Ücret</th>
                      <th className="px-2 py-1.5">Not</th>
                      <th className="px-2 py-1.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {extraItems.map((ex) => (
                      <tr key={ex.id}>
                        <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">
                          {ex.item_date || '—'}
                        </td>
                        <td className="px-2 py-1.5">{teacherNameLookup[ex.teacher_id] || ex.teacher_id}</td>
                        <td className="px-2 py-1.5 font-medium">{teacherExtraKindLabel(ex.kind, ex.label)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatLessonUnits(Number(ex.quantity))}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatTryAmount(Number(ex.unit_price_tl))} ₺</td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{formatTryAmount(Number(ex.amount_tl))} ₺</td>
                        <td className="px-2 py-1.5 text-slate-500">{ex.note || '—'}</td>
                        <td className="px-2 py-1.5 text-right">
                          <button
                            type="button"
                            disabled={extraBusy}
                            onClick={() => void deleteExtraItem(ex.id)}
                            className="rounded p-1 text-red-600 hover:bg-red-50"
                            title="Sil"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Bu dönemde henüz ek kalem yok.</p>
            )}
          </div>
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
