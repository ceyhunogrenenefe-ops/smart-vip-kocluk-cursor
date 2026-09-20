import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { crmAdminShifts, type CrmShift } from '../../lib/crmInboxApi';
import type { RegCoach } from '../../lib/registrationTrackingApi';

const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

function hhmm(v: string) {
  return String(v || '').slice(0, 5);
}

/** Vardiya (nöbet) planı — kim hangi gün ve saatte görevde. Atama ve WhatsApp uyarısı buna bakar. */
export default function CrmShiftsPanel({ agents }: { agents: RegCoach[] }) {
  const [shifts, setShifts] = useState<CrmShift[]>([]);
  const [onDuty, setOnDuty] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState({ user_id: '', day_of_week: 1, start_time: '09:00', end_time: '14:00' });

  const run = async (body?: Record<string, unknown>, okMsg?: string) => {
    setBusy(true);
    try {
      const r = await crmAdminShifts(body);
      setShifts(r.data.shifts || []);
      setOnDuty(r.data.on_duty ?? null);
      if (okMsg) toast.success(okMsg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız');
    } finally {
      setBusy(false);
      setLoaded(true);
    }
  };

  useEffect(() => {
    void run();
    const t = window.setInterval(() => void run(), 5 * 60_000);
    return () => window.clearInterval(t);
  }, []);

  const byDay = useMemo(() => {
    const m = new Map<number, CrmShift[]>();
    for (const s of shifts) {
      const list = m.get(s.day_of_week) || [];
      list.push(s);
      m.set(s.day_of_week, list);
    }
    return m;
  }, [shifts]);

  const onDutyNames = (onDuty || [])
    .map((id) => shifts.find((s) => s.user_id === id)?.user_name || agents.find((a) => a.id === id)?.name || 'Temsilci')
    .filter((v, i, arr) => arr.indexOf(v) === i);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <CalendarClock className="h-5 w-5 text-emerald-600" /> Vardiya (nöbet) planı
          </h3>
          <p className="mt-1 max-w-3xl text-xs text-slate-500">
            Her temsilcinin hangi gün ve saatlerde görevli olduğunu yazın. Yeni müşteri sırası yalnız o an görevde
            olanlar arasında döner; WhatsApp uyarısı sorumlu temsilci görevde değilse o an görevde olana gider. Aynı
            saatte birden çok temsilci olabilir. Gece yarısını geçen vardiya için bitişi 02:00 gibi yazın (24:00 = gün
            sonu).
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
          <p className="font-semibold text-emerald-900">Şu an görevde</p>
          <p className="text-emerald-800">
            {onDuty == null ? 'Vardiya tanımlı değil' : onDutyNames.length ? onDutyNames.join(', ') : 'Kimse görevde değil'}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
        <label className="text-xs text-slate-600">
          Temsilci
          <select
            value={draft.user_id}
            onChange={(e) => setDraft({ ...draft, user_id: e.target.value })}
            className="mt-1 block w-44 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          >
            <option value="">Seçin…</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          Gün
          <select
            value={draft.day_of_week}
            onChange={(e) => setDraft({ ...draft, day_of_week: Number(e.target.value) })}
            className="mt-1 block w-32 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          >
            {DAYS.map((d, i) => (
              <option key={d} value={i + 1}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          Başlangıç
          <input
            type="time"
            value={draft.start_time}
            onChange={(e) => setDraft({ ...draft, start_time: e.target.value })}
            className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-slate-600">
          Bitiş
          <input
            type="time"
            value={draft.end_time}
            onChange={(e) => setDraft({ ...draft, end_time: e.target.value })}
            className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={busy || !draft.user_id}
          onClick={() => void run({ action: 'save', ...draft }, 'Vardiya eklendi')}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Ekle
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const gunler = [1, 2, 3, 4, 5, 6, 7];
            if (!draft.user_id) return;
            void (async () => {
              for (const d of gunler) {
                await crmAdminShifts({ action: 'save', ...draft, day_of_week: d }).catch(() => undefined);
              }
              await run(undefined, 'Hafta boyunca eklendi');
            })();
          }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-white disabled:opacity-60"
          title="Seçili saat aralığını Pazartesi–Pazar tüm günlere ekler"
        >
          Her güne ekle
        </button>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {DAYS.map((label, i) => {
          const day = i + 1;
          const rows = (byDay.get(day) || []).slice().sort((a, b) => a.start_time.localeCompare(b.start_time));
          return (
            <div key={label} className="rounded-xl border border-slate-200 p-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
              {rows.length === 0 ? (
                <p className="text-xs text-slate-400">—</p>
              ) : (
                <div className="space-y-1">
                  {rows.map((s) => (
                    <div
                      key={s.id}
                      className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs ${
                        onDuty?.includes(s.user_id) ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{s.user_name || 'Temsilci'}</span>{' '}
                        <span className="tabular-nums">
                          {hhmm(s.start_time)}–{hhmm(s.end_time)}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => void run({ action: 'delete', id: s.id }, 'Silindi')}
                        className="shrink-0 rounded p-0.5 text-rose-500 hover:bg-rose-50"
                        aria-label="Sil"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!loaded ? (
        <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Yükleniyor…
        </p>
      ) : null}
    </section>
  );
}
