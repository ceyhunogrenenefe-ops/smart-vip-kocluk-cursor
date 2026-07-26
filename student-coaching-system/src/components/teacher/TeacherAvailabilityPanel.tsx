import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/session';

export type AvailabilityRule = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_min?: number;
  is_active?: boolean;
};

type AvailabilityException = {
  id: string;
  exception_date: string;
  exception_type: 'available' | 'unavailable';
  start_time?: string | null;
  end_time?: string | null;
  reason?: string | null;
};

type SlotPreview = {
  day_of_week?: number;
  starts_at?: string;
  ends_at?: string;
  status?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
};

/** Display order Mon→Sun; JS dow: Sun=0 … Sat=6 */
const DAYS_MON_FIRST: { dow: number; label: string; short: string }[] = [
  { dow: 1, label: 'Pazartesi', short: 'Pzt' },
  { dow: 2, label: 'Salı', short: 'Sal' },
  { dow: 3, label: 'Çarşamba', short: 'Çar' },
  { dow: 4, label: 'Perşembe', short: 'Per' },
  { dow: 5, label: 'Cuma', short: 'Cum' },
  { dow: 6, label: 'Cumartesi', short: 'Cmt' },
  { dow: 0, label: 'Pazar', short: 'Paz' }
];

const MONTH_TR = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık'
];

function buildTimeOptions(): string[] {
  const out: string[] = [];
  for (let m = 10 * 60; m < 24 * 60; m += 30) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    out.push(`${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  }
  out.push('00:00');
  return out;
}

const TIME_OPTIONS = buildTimeOptions();
const START_OPTIONS = TIME_OPTIONS.filter((t) => t !== '00:00');
const END_OPTIONS = TIME_OPTIONS.filter((t) => t !== '10:00');

function hm(t: string) {
  return String(t || '').slice(0, 5);
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function ymdFromParts(y: number, m0: number, d: number) {
  return `${y}-${pad2(m0 + 1)}-${pad2(d)}`;
}

/** Local calendar ymd for a Date (browser local — panel TR kullanıcıları için yeterli) */
function ymdLocal(d: Date) {
  return ymdFromParts(d.getFullYear(), d.getMonth(), d.getDate());
}

function dowFromYmd(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

function monthStartYmd(year: number, month0: number) {
  return ymdFromParts(year, month0, 1);
}

type DayStatus = 'available' | 'closed' | 'empty' | 'past';

type Props = {
  /** Compact when embedded as a tab */
  embedded?: boolean;
};

export default function TeacherAvailabilityPanel({ embedded = false }: Props) {
  const today = useMemo(() => ymdLocal(new Date()), []);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [slots, setSlots] = useState<SlotPreview[]>([]);
  const [activeDay, setActiveDay] = useState(1);
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('12:00');
  const [editId, setEditId] = useState<string | null>(null);
  const [showSlots, setShowSlots] = useState(false);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(() => ymdLocal(new Date()));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = monthStartYmd(viewYear, viewMonth);
      const res = await apiFetch(`/api/teacher-availability?from=${encodeURIComponent(from)}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || j.error || res.statusText);
      setRules((j.rules || []) as AvailabilityRule[]);
      setExceptions((j.exceptions || []) as AvailabilityException[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Müsaitlik yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [viewYear, viewMonth]);

  const loadSlots = useCallback(async () => {
    try {
      const from = monthStartYmd(viewYear, viewMonth);
      const res = await apiFetch(
        `/api/teacher-availability?op=slots&days=45&from=${encodeURIComponent(from)}`
      );
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || j.error || res.statusText);
      setSlots((j.slots || []) as SlotPreview[]);
      setShowSlots(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Slot önizlemesi alınamadı');
    }
  }, [viewYear, viewMonth]);

  useEffect(() => {
    void load();
  }, [load]);

  const closedDates = useMemo(() => {
    const set = new Set<string>();
    for (const ex of exceptions) {
      if (
        ex.exception_type === 'unavailable' &&
        !ex.start_time &&
        !ex.end_time
      ) {
        set.add(String(ex.exception_date).slice(0, 10));
      }
    }
    return set;
  }, [exceptions]);

  const weeklyDowWithHours = useMemo(() => {
    const set = new Set<number>();
    for (const r of rules) set.add(Number(r.day_of_week));
    return set;
  }, [rules]);

  const dayStatus = useCallback(
    (ymd: string): DayStatus => {
      if (ymd < today) return 'past';
      if (closedDates.has(ymd)) return 'closed';
      const dow = dowFromYmd(ymd);
      if (weeklyDowWithHours.has(dow)) return 'available';
      return 'empty';
    },
    [closedDates, today, weeklyDowWithHours]
  );

  const calendarCells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    // Monday-first offset: Mon=0 … Sun=6
    const jsDow = first.getDay();
    const monFirstOffset = (jsDow + 6) % 7;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: ({ ymd: string; day: number } | null)[] = [];
    for (let i = 0; i < monFirstOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ ymd: ymdFromParts(viewYear, viewMonth, d), day: d });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  const selectedStatus = dayStatus(selectedDate);

  const dayRules = useMemo(
    () =>
      rules
        .filter((r) => Number(r.day_of_week) === activeDay)
        .sort((a, b) => hm(a.start_time).localeCompare(hm(b.start_time))),
    [rules, activeDay]
  );

  const resetForm = () => {
    setEditId(null);
    setStart('10:00');
    setEnd('12:00');
  };

  const upsert = async (force = false) => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/teacher-availability?op=upsert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editId || undefined,
          day_of_week: activeDay,
          start_time: start,
          end_time: end,
          slot_duration_min: 60,
          force
        })
      });
      const j = await res.json();
      if (res.status === 409 && j.error === 'has_bookings') {
        if (window.confirm(`${j.message || 'Dolu randevu var.'}\nYine de kaydetmek ister misiniz?`)) {
          await upsert(true);
        }
        return;
      }
      if (!res.ok) throw new Error(j.message || j.error || res.statusText);
      toast.success(editId ? 'Aralık güncellendi' : 'Aralık eklendi');
      resetForm();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kayıt başarısız');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string, force = false) => {
    if (!force && !window.confirm('Bu aralığı silmek istiyor musunuz?')) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/teacher-availability?op=delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, force })
      });
      const j = await res.json();
      if (res.status === 409 && j.error === 'has_bookings') {
        if (window.confirm(`${j.message || 'Dolu randevu var.'}\nYine de silmek ister misiniz?`)) {
          await remove(id, true);
        }
        return;
      }
      if (!res.ok) throw new Error(j.message || j.error || res.statusText);
      toast.success('Aralık silindi');
      if (editId === id) resetForm();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silinemedi');
    } finally {
      setBusy(false);
    }
  };

  const closeDay = async (date: string) => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/teacher-availability?op=close-day`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exception_date: date, reason: 'Kapalı gün' })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || j.error || res.statusText);
      toast.success(`${date} kapalı olarak işaretlendi`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gün kapatılamadı');
    } finally {
      setBusy(false);
    }
  };

  const reopenDay = async (date: string) => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/teacher-availability?op=reopen-day`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exception_date: date })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || j.error || res.statusText);
      toast.success(`${date} müsait olarak açıldı`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gün açılamadı');
    } finally {
      setBusy(false);
    }
  };

  const onDayClick = (ymd: string) => {
    setSelectedDate(ymd);
    const dow = dowFromYmd(ymd);
    setActiveDay(dow);
    resetForm();
  };

  const toggleSelectedDay = async () => {
    if (selectedDate < today) {
      toast.error('Geçmiş günler değiştirilemez');
      return;
    }
    const status = dayStatus(selectedDate);
    if (status === 'closed') {
      await reopenDay(selectedDate);
      return;
    }
    if (status === 'empty') {
      toast.error('Önce bu haftanın gününe saat aralığı ekleyin, sonra takvimden kapatabilirsiniz');
      return;
    }
    await closeDay(selectedDate);
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className={embedded ? 'space-y-4' : 'mx-auto max-w-3xl space-y-6 p-4 pb-24 sm:p-6'}>
      {!embedded ? (
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Müsaitlik Takvimim</h1>
          <p className="mt-1 text-sm text-slate-600">
            Haftalık saatlerinizi belirleyin; takvimde günleri müsait / kapalı olarak işaretleyin.
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          Takvimden günleri işaretleyin. Haftalık saat aralıkları aşağıda yönetilir (10:00–00:00).
        </p>
      )}

      {/* Month calendar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="rounded-xl border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
            aria-label="Önceki ay"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-sm font-bold text-slate-900 sm:text-base">
            {MONTH_TR[viewMonth]} {viewYear}
          </div>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="rounded-xl border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
            aria-label="Sonraki ay"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-500 sm:text-xs">
          {DAYS_MON_FIRST.map((d) => (
            <div key={d.dow}>{d.short}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {calendarCells.map((cell, i) => {
            if (!cell) return <div key={`e-${i}`} className="aspect-square" />;
            const status = dayStatus(cell.ymd);
            const selected = cell.ymd === selectedDate;
            const isToday = cell.ymd === today;
            let tone =
              'bg-slate-50 text-slate-400 border-transparent cursor-default';
            if (status === 'available') {
              tone = 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100';
            } else if (status === 'closed') {
              tone = 'bg-red-50 text-red-800 border-red-200 hover:bg-red-100';
            } else if (status === 'empty' && cell.ymd >= today) {
              tone = 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50';
            }
            return (
              <button
                key={cell.ymd}
                type="button"
                disabled={status === 'past'}
                onClick={() => onDayClick(cell.ymd)}
                className={`aspect-square rounded-xl border text-sm font-semibold transition disabled:opacity-40 ${tone} ${
                  selected ? 'ring-2 ring-[#1a3fad] ring-offset-1' : ''
                } ${isToday ? 'underline decoration-2 underline-offset-2' : ''}`}
              >
                {cell.day}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-emerald-200" /> Müsait
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-red-200" /> Kapalı
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border border-slate-300 bg-white" /> Saat yok
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
          <div className="text-sm">
            <div className="font-bold text-slate-900">{selectedDate}</div>
            <div className="text-xs text-slate-600">
              {selectedStatus === 'available'
                ? 'Haftalık saatiniz var — müsait'
                : selectedStatus === 'closed'
                  ? 'Bu gün kapalı işaretli'
                  : selectedStatus === 'past'
                    ? 'Geçmiş gün'
                    : 'Bu hafta gününde saat aralığı yok'}
            </div>
          </div>
          {selectedStatus === 'available' || selectedStatus === 'closed' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void toggleSelectedDay()}
              className={`rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${
                selectedStatus === 'closed' ? 'bg-emerald-600' : 'bg-[#e8232a]'
              }`}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : selectedStatus === 'closed' ? (
                'Müsait Yap'
              ) : (
                'Kapalı Yap'
              )}
            </button>
          ) : selectedStatus === 'empty' ? (
            <button
              type="button"
              onClick={() => {
                setActiveDay(dowFromYmd(selectedDate));
                toast('Aşağıdan bu güne saat ekleyin');
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-[#1a3fad]"
            >
              Saat ekle
            </button>
          ) : null}
        </div>
      </div>

      {/* Weekly hours */}
      <div className="flex flex-wrap gap-2">
        {DAYS_MON_FIRST.map((d) => (
          <button
            key={d.dow}
            type="button"
            onClick={() => {
              setActiveDay(d.dow);
              resetForm();
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-bold sm:text-sm ${
              activeDay === d.dow ? 'bg-[#1a3fad] text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="text-sm font-bold text-slate-900">
          {DAYS_MON_FIRST.find((d) => d.dow === activeDay)?.label} aralıkları (her hafta)
        </div>

        {dayRules.length === 0 ? (
          <p className="text-sm text-slate-500">Bu gün için aralık yok.</p>
        ) : (
          <ul className="space-y-2">
            {dayRules.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
              >
                <span className="text-sm font-semibold text-slate-800">
                  {hm(r.start_time)} – {hm(r.end_time)}
                  {r.slot_duration_min ? (
                    <span className="ml-2 text-xs font-normal text-slate-500">({r.slot_duration_min} dk)</span>
                  ) : null}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-[#1a3fad]"
                    onClick={() => {
                      setEditId(r.id);
                      setStart(hm(r.start_time) || '10:00');
                      setEnd(hm(r.end_time) || '12:00');
                    }}
                  >
                    Düzenle
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-bold text-red-600 disabled:opacity-50"
                    onClick={() => void remove(r.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Sil
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-3">
          <label className="block text-xs font-semibold text-slate-700">
            Başlangıç
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            >
              {START_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-700">
            Bitiş
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            >
              {END_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t === '00:00' ? '00:00 (gece)' : t}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void upsert()}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#1a3fad] px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {editId ? 'Güncelle' : 'Ekle'}
            </button>
            {editId ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-600"
              >
                Vazgeç
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <CalendarClock className="h-4 w-4 text-[#1a3fad]" /> Slot önizleme
          </div>
          <button
            type="button"
            onClick={() => void loadSlots()}
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-[#1a3fad]"
          >
            Önizlemeyi Yenile
          </button>
        </div>
        {!showSlots ? (
          <p className="text-sm text-slate-500">Henüz yüklenmedi. Önizlemeyi yenileyin.</p>
        ) : slots.length === 0 ? (
          <p className="text-sm text-slate-500">Gösterilecek slot yok.</p>
        ) : (
          <ul className="max-h-64 space-y-1.5 overflow-y-auto text-xs sm:text-sm">
            {slots.slice(0, 80).map((s, i) => {
              const label =
                s.starts_at && s.ends_at
                  ? `${s.starts_at} → ${s.ends_at}`
                  : `${s.date || ''} ${hm(s.start_time || '')}–${hm(s.end_time || '')}`;
              const busySlot = s.status === 'busy';
              const closedSlot = s.status === 'closed';
              return (
                <li
                  key={`${label}-${i}`}
                  className={`rounded-lg px-2.5 py-1.5 ${
                    busySlot
                      ? 'bg-red-50 text-red-800'
                      : closedSlot
                        ? 'bg-amber-50 text-amber-900'
                        : 'bg-slate-50 text-slate-700'
                  }`}
                >
                  {label}
                  {s.status ? ` · ${s.status}` : ''}
                </li>
              );
            })}
            {slots.length > 80 ? (
              <li className="text-slate-400">… ve {slots.length - 80} slot daha</li>
            ) : null}
          </ul>
        )}
      </div>
    </div>
  );
}
