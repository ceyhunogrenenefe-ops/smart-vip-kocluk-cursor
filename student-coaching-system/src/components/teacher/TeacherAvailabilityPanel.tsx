import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/session';

type AvailabilityRule = {
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
};

type Booking = {
  id: string;
  starts_at: string;
  ends_at: string;
  status?: string;
};

type CellStatus = 'free' | 'empty' | 'closed' | 'busy' | 'past';

const DAY_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const DAY_LONG = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

/** Saat satırları: 10:00 → 23:00 (son dilim 23:00–00:00) */
const HOUR_STARTS = Array.from({ length: 14 }, (_, i) => 10 + i);

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function minutesToHm(mins: number) {
  if (mins >= 24 * 60) return '00:00';
  return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
}

function parseHm(t: string | null | undefined) {
  const s = String(t || '').slice(0, 5);
  const [h, m] = s.split(':').map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function endMinutes(endTime: string | null | undefined) {
  const s = String(endTime || '').slice(0, 5);
  if (s === '00:00') return 24 * 60;
  return parseHm(s);
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

/** Pazartesi başlangıçlı haftanın ymd listesi */
function weekDatesFromOffset(weekOffset: number): string[] {
  const now = new Date();
  const day = now.getDay(); // 0 Sun
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  });
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function dowFromYmd(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

function formatDayHeader(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return {
    short: DAY_SHORT[date.getDay()],
    long: DAY_LONG[date.getDay()],
    dayNum: d,
    monthNum: m
  };
}

function hourRange(hourStart: number) {
  const start = hourStart * 60;
  const end = start + 60;
  return { startTime: minutesToHm(start), endTime: minutesToHm(end), start, end };
}

function resolveCellStatus(opts: {
  rules: AvailabilityRule[];
  exceptions: AvailabilityException[];
  bookings: Booking[];
  ymd: string;
  hourStart: number;
  today: string;
}): CellStatus {
  const { rules, exceptions, bookings, ymd, hourStart, today } = opts;
  const { start, end, startTime } = hourRange(hourStart);
  const [y, mo, d] = ymd.split('-').map(Number);
  const cellDate = new Date(y, mo - 1, d, hourStart, 0, 0);
  if (ymd < today || cellDate.getTime() <= Date.now()) return 'past';

  const dayClosed = exceptions.some(
    (ex) =>
      String(ex.exception_date).slice(0, 10) === ymd &&
      ex.exception_type === 'unavailable' &&
      !ex.start_time &&
      !ex.end_time
  );
  if (dayClosed) return 'closed';

  const partialClosed = exceptions.some((ex) => {
    if (String(ex.exception_date).slice(0, 10) !== ymd) return false;
    if (ex.exception_type !== 'unavailable' || !ex.start_time || !ex.end_time) return false;
    const cs = parseHm(ex.start_time);
    const ce = endMinutes(ex.end_time);
    return cs != null && ce != null && rangesOverlap(start, end, cs, ce);
  });
  if (partialClosed) return 'closed';

  const dow = dowFromYmd(ymd);
  const coveredByWeekly = rules.some((r) => {
    if (Number(r.day_of_week) !== dow) return false;
    const rs = parseHm(r.start_time);
    const re = endMinutes(r.end_time);
    return rs != null && re != null && rs <= start && end <= re;
  });
  const coveredByExtra = exceptions.some((ex) => {
    if (String(ex.exception_date).slice(0, 10) !== ymd) return false;
    if (ex.exception_type !== 'available') return false;
    const rs = parseHm(ex.start_time);
    const re = endMinutes(ex.end_time);
    return rs != null && re != null && rs <= start && end <= re;
  });
  if (!coveredByWeekly && !coveredByExtra) return 'empty';

  const startsAt = cellDate.getTime();
  const endsAt = startsAt + 60 * 60 * 1000;
  for (const b of bookings) {
    const bs = new Date(b.starts_at).getTime();
    const be = new Date(b.ends_at).getTime();
    if (startsAt < be && bs < endsAt) return 'busy';
  }

  void startTime;
  return 'free';
}

type Props = {
  embedded?: boolean;
};

export default function TeacherAvailabilityPanel({ embedded = false }: Props) {
  const today = useMemo(() => todayYmd(), []);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);

  const weekDates = useMemo(() => weekDatesFromOffset(weekOffset), [weekOffset]);
  const weekFrom = weekDates[0];
  const weekTo = weekDates[6];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/teacher-availability?from=${encodeURIComponent(weekFrom)}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || j.error || res.statusText);
      setRules((j.rules || []) as AvailabilityRule[]);
      setExceptions((j.exceptions || []) as AvailabilityException[]);
      setBookings((j.bookings || []) as Booking[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Müsaitlik yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [weekFrom]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleCell = async (ymd: string, hourStart: number) => {
    const status = resolveCellStatus({ rules, exceptions, bookings, ymd, hourStart, today });
    if (status === 'past') {
      toast.error('Geçmiş saat değiştirilemez');
      return;
    }
    if (status === 'busy') {
      toast.error('Bu saatte rezervasyon var');
      return;
    }

    const { startTime, endTime } = hourRange(hourStart);
    const key = `${ymd}-${startTime}`;
    setBusyKey(key);
    try {
      const res = await apiFetch('/api/teacher-availability?op=toggle-slot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: ymd, start_time: startTime, end_time: endTime })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || j.error || res.statusText);
      if (j.rules) setRules(j.rules as AvailabilityRule[]);
      if (j.exceptions) setExceptions(j.exceptions as AvailabilityException[]);
      else await load();
      toast.success(j.action === 'opened' ? 'Müsait' : 'Müsait değil');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi');
    } finally {
      setBusyKey(null);
    }
  };

  const weekLabel = useMemo(() => {
    const a = formatDayHeader(weekFrom);
    const b = formatDayHeader(weekTo);
    return `${a.dayNum}.${a.monthNum} – ${b.dayNum}.${b.monthNum}.${weekTo.slice(0, 4)}`;
  }, [weekFrom, weekTo]);

  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className={embedded ? 'space-y-4' : 'mx-auto max-w-5xl space-y-5 p-4 pb-24 sm:p-6'}>
      {!embedded ? (
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Müsaitlik Takvimim</h1>
          <p className="mt-1 text-sm text-slate-600">
            Ders programı gibi işaretleyin. Hücreye tıklayın: müsait ↔ müsait değil. Sonraki haftaya
            geçince aynı saatler otomatik gelir; değiştirmezseniz aynen devam eder.
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          Saat satırı × gün sütunu. Tıklayınca <strong>müsait</strong> / <strong>müsait değil</strong>.
          Haftalık şablon sonraki haftalara aktarılır.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setWeekOffset((w) => w - 1)}
          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
        >
          <ChevronLeft className="h-4 w-4" /> Önceki hafta
        </button>
        <div className="text-center">
          <div className="text-sm font-bold text-slate-900">{weekLabel}</div>
          {weekOffset !== 0 ? (
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="mt-0.5 text-xs font-semibold text-[#1a3fad]"
            >
              Bu haftaya dön
            </button>
          ) : (
            <div className="text-xs text-slate-500">Bu hafta</div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setWeekOffset((w) => w + 1)}
          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
        >
          Sonraki hafta <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="sticky left-0 z-10 w-16 bg-slate-50 px-2 py-3 text-left text-xs font-bold text-slate-500">
                Saat
              </th>
              {weekDates.map((ymd) => {
                const h = formatDayHeader(ymd);
                const isToday = ymd === today;
                return (
                  <th
                    key={ymd}
                    className={`px-1 py-3 text-center ${isToday ? 'bg-[#1a3fad]/10' : ''}`}
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {h.short}
                    </div>
                    <div className={`text-base font-bold ${isToday ? 'text-[#1a3fad]' : 'text-slate-900'}`}>
                      {h.dayNum}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {pad2(h.monthNum)}.{ymd.slice(0, 4)}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {HOUR_STARTS.map((hour) => {
              const { startTime, endTime } = hourRange(hour);
              return (
                <tr key={hour} className="border-b border-slate-100">
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-2 py-1 text-xs font-semibold text-slate-600">
                    {startTime}
                    <span className="block text-[10px] font-normal text-slate-400">
                      {endTime === '00:00' ? '00:00' : endTime}
                    </span>
                  </td>
                  {weekDates.map((ymd) => {
                    const status = resolveCellStatus({
                      rules,
                      exceptions,
                      bookings,
                      ymd,
                      hourStart: hour,
                      today
                    });
                    const key = `${ymd}-${startTime}`;
                    const spinning = busyKey === key;
                    const clickable = status === 'free' || status === 'empty' || status === 'closed';
                    let cls =
                      'h-12 w-full rounded-lg border text-[11px] font-bold transition disabled:cursor-default ';
                    if (status === 'free') {
                      cls += 'border-emerald-300 bg-emerald-100 text-emerald-900 hover:bg-emerald-200';
                    } else if (status === 'empty' || status === 'closed') {
                      cls += 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100';
                    } else if (status === 'busy') {
                      cls += 'border-amber-300 bg-amber-50 text-amber-900';
                    } else {
                      cls += 'border-transparent bg-slate-100/60 text-slate-300';
                    }
                    const label =
                      status === 'free'
                        ? 'Müsait'
                        : status === 'busy'
                          ? 'Dolu'
                          : status === 'past'
                            ? '—'
                            : 'Değil';
                    return (
                      <td key={key} className="px-1 py-1">
                        <button
                          type="button"
                          disabled={!clickable || !!busyKey}
                          onClick={() => void toggleCell(ymd, hour)}
                          className={cls}
                          title={`${ymd} ${startTime}–${endTime}`}
                        >
                          {spinning ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : label}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-emerald-200" /> Müsait
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-slate-200 bg-slate-50" /> Müsait değil
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-amber-100" /> Rezervasyonlu
        </span>
      </div>
    </div>
  );
}
