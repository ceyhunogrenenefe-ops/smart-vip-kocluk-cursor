import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Loader2, Plus, Trash2, XCircle } from 'lucide-react';
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
const DAYS_MON_FIRST: { dow: number; label: string }[] = [
  { dow: 1, label: 'Pazartesi' },
  { dow: 2, label: 'Salı' },
  { dow: 3, label: 'Çarşamba' },
  { dow: 4, label: 'Perşembe' },
  { dow: 5, label: 'Cuma' },
  { dow: 6, label: 'Cumartesi' },
  { dow: 0, label: 'Pazar' }
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

type Props = {
  /** Compact when embedded as a tab */
  embedded?: boolean;
};

export default function TeacherAvailabilityPanel({ embedded = false }: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [slots, setSlots] = useState<SlotPreview[]>([]);
  const [activeDay, setActiveDay] = useState(1);
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('12:00');
  const [editId, setEditId] = useState<string | null>(null);
  const [closeDate, setCloseDate] = useState('');
  const [showSlots, setShowSlots] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/teacher-availability');
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || j.error || res.statusText);
      setRules((j.rules || []) as AvailabilityRule[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Müsaitlik yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSlots = useCallback(async () => {
    try {
      const res = await apiFetch('/api/teacher-availability?op=slots');
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || j.error || res.statusText);
      setSlots((j.slots || []) as SlotPreview[]);
      setShowSlots(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Slot önizlemesi alınamadı');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dayRules = useMemo(
    () => rules.filter((r) => Number(r.day_of_week) === activeDay).sort((a, b) => hm(a.start_time).localeCompare(hm(b.start_time))),
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

  const closeDay = async () => {
    if (!closeDate) {
      toast.error('Tarih seçin');
      return;
    }
    if (!window.confirm(`${closeDate} gününü kapatmak istiyor musunuz?`)) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/teacher-availability?op=close-day`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exception_date: closeDate, reason: 'Kapalı gün' })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || j.error || res.statusText);
      toast.success('Gün kapatıldı');
      setCloseDate('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gün kapatılamadı');
    } finally {
      setBusy(false);
    }
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
            Haftalık müsaitlik aralıklarınızı belirleyin (10:00–00:00). Özel ders vitrininde bu saatler gösterilir.
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          Haftalık müsaitlik (10:00–00:00). Günleri Pazartesi→Pazar sırasıyla yönetin.
        </p>
      )}

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
          {DAYS_MON_FIRST.find((d) => d.dow === activeDay)?.label} aralıkları
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
        <div className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900">
          <XCircle className="h-4 w-4 text-[#e8232a]" /> Gün kapat
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={closeDate}
            onChange={(e) => setCloseDate(e.target.value)}
          />
          <button
            type="button"
            disabled={busy || !closeDate}
            onClick={() => void closeDay()}
            className="rounded-xl bg-[#e8232a] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            Günü Kapat
          </button>
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
              return (
                <li
                  key={`${label}-${i}`}
                  className={`rounded-lg px-2.5 py-1.5 ${
                    busySlot ? 'bg-red-50 text-red-800' : 'bg-slate-50 text-slate-700'
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
