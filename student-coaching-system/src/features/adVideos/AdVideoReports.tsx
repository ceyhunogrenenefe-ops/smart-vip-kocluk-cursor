import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { adVideosApi, type AdVideoStats, type BriefTask, type DailySummary } from './api';
import { addDays, fmtDateTime, fmtDay, todayKey, weekStart } from './format';

const card = 'rounded-2xl border border-slate-200 bg-white p-3 shadow-sm';

function Tile({ label, value, tone = 'slate' }: { label: string; value: number; tone?: 'slate' | 'sky' | 'indigo' | 'emerald' | 'amber' | 'rose' }) {
  const tones: Record<string, string> = {
    slate: 'text-slate-900',
    sky: 'text-sky-700',
    indigo: 'text-indigo-700',
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    rose: 'text-rose-700'
  };
  return (
    <div className={card}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tones[tone]}`}>{value}</p>
    </div>
  );
}

function TaskLinks({ items, onOpen, empty = '—', show = (t: BriefTask) => t.title }: { items: BriefTask[]; onOpen: (id: string) => void; empty?: string; show?: (t: BriefTask) => string }) {
  if (!items.length) return <span className="text-slate-400">{empty}</span>;
  return (
    <ul className="space-y-0.5">
      {items.map((t) => (
        <li key={t.id}>
          <button type="button" onClick={() => onOpen(t.id)} className="text-left text-indigo-700 hover:underline">
            {show(t)}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Öğretmen bazında haftalık özet + haftalık öğretmen raporu (yazdırılabilir) */
export function AdVideoStatsView({ onOpen, initialWeek }: { onOpen: (id: string) => void; initialWeek?: string }) {
  const [week, setWeek] = useState(weekStart(initialWeek || todayKey()));
  const [data, setData] = useState<AdVideoStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    adVideosApi
      .stats(week)
      .then(setData)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [week]);

  return (
    <div className="space-y-4 print:space-y-2">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button type="button" onClick={() => setWeek(addDays(week, -7))} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50" aria-label="Önceki hafta">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <input type="date" value={week} onChange={(e) => e.target.value && setWeek(weekStart(e.target.value))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <button type="button" onClick={() => setWeek(addDays(week, 7))} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50" aria-label="Sonraki hafta">
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="text-sm text-slate-600">
          {fmtDay(week)} – {fmtDay(addDays(week, 6))}
        </span>
        <button type="button" onClick={() => window.print()} className="ml-auto inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <Printer className="h-4 w-4" /> Haftalık raporu yazdır
        </button>
      </div>
      <h2 className="hidden text-lg font-bold print:block">
        Reklam videoları haftalık öğretmen raporu · {fmtDay(week)} – {fmtDay(addDays(week, 6))}
      </h2>

      {loading || !data ? (
        <div className="flex justify-center py-12 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <Tile label="Planlanan" value={data.totals.week.planned} />
            <Tile label="Çekilen" value={data.totals.week.shot} tone="sky" />
            <Tile label="İlk teslim" value={data.totals.week.first_submitted} tone="indigo" />
            <Tile label="Onaylanan" value={data.totals.week.approved} tone="emerald" />
            <Tile label="Teslim bekleyen" value={data.totals.shot_awaiting_submission} tone="amber" />
            <Tile label="Montaj bekleyen" value={data.totals.edits_waiting || 0} tone="amber" />
            <Tile label="Yorumlara açık" value={data.totals.open_for_comments || 0} tone="indigo" />
            <Tile label="İnceleme bekleyen" value={data.totals.awaiting_review} tone="indigo" />
            <Tile label="Geciken" value={data.totals.overdue} tone="rose" />
            <Tile label="Yaklaşan çekim" value={data.totals.upcoming_shoots} />
          </div>
          <p className="text-xs text-slate-500">
            Haftalık sayılar: çekim gerçekleşen çekim tarihinden, ilk teslim ilk teslim zamanından, onay onay tarihinden. Düzeltme yüklemeleri sayılmaz.
          </p>

          {/* Mobil: kart; masaüstü: tablo */}
          <div className="space-y-2 md:hidden">
            {data.rows.map((r) => (
              <div key={r.teacher_id} className={card}>
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-900">{r.teacher_name}</p>
                  <p className="text-xs text-slate-500">Son çekim: {fmtDay(r.last_shoot_date)}</p>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1 text-center text-xs">
                  {[
                    ['Plan', r.week.planned],
                    ['Çekim', r.week.shot],
                    ['İlk teslim', r.week.first_submitted],
                    ['Onay', r.week.approved]
                  ].map(([k, v]) => (
                    <div key={k as string} className="rounded-lg bg-slate-50 py-1.5">
                      <p className="text-slate-500">{k}</p>
                      <p className="text-base font-bold tabular-nums text-slate-900">{v}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-2 space-y-1 text-xs">
                  {r.shot_awaiting_submission.length ? <div><b>Teslim bekleyen:</b> <TaskLinks items={r.shot_awaiting_submission} onOpen={onOpen} /></div> : null}
                  {r.awaiting_review.length || r.revision_requested.length ? (
                    <div>
                      <b>İnceleme / düzeltme:</b> <TaskLinks items={[...r.awaiting_review, ...r.revision_requested]} onOpen={onOpen} />
                    </div>
                  ) : null}
                  {r.overdue.length ? <div className="text-rose-700"><b>Geciken:</b> <TaskLinks items={r.overdue} onOpen={onOpen} /></div> : null}
                  {r.upcoming_shoots.length ? (
                    <div>
                      <b>Yaklaşan:</b> <TaskLinks items={r.upcoming_shoots} onOpen={onOpen} show={(t) => `${fmtDateTime(t.planned_shoot_at)} · ${t.title}`} />
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block print:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Öğretmen</th>
                  <th className="px-3 py-2 font-medium">Son çekim</th>
                  <th className="px-2 py-2 text-center font-medium">Plan</th>
                  <th className="px-2 py-2 text-center font-medium">Çekim</th>
                  <th className="px-2 py-2 text-center font-medium">İlk teslim</th>
                  <th className="px-2 py-2 text-center font-medium">Onay</th>
                  <th className="px-3 py-2 font-medium">Çekildi, teslim bekliyor</th>
                  <th className="px-3 py-2 font-medium">İnceleme / düzeltme bekleyen</th>
                  <th className="px-3 py-2 font-medium">Geciken</th>
                  <th className="px-3 py-2 font-medium">Yaklaşan çekim</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.teacher_id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2 font-medium text-slate-900">{r.teacher_name}</td>
                    <td className="px-3 py-2 text-slate-600">{fmtDay(r.last_shoot_date)}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{r.week.planned}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{r.week.shot}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{r.week.first_submitted}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{r.week.approved}</td>
                    <td className="px-3 py-2 text-xs"><TaskLinks items={r.shot_awaiting_submission} onOpen={onOpen} /></td>
                    <td className="px-3 py-2 text-xs">
                      <TaskLinks
                        items={[...r.awaiting_review, ...r.revision_requested]}
                        onOpen={onOpen}
                        show={(t) => `${t.title}${t.status === 'revision_requested' ? ' (düzeltme)' : ''}`}
                      />
                    </td>
                    <td className="px-3 py-2 text-xs text-rose-700"><TaskLinks items={r.overdue} onOpen={onOpen} /></td>
                    <td className="px-3 py-2 text-xs">
                      <TaskLinks items={r.upcoming_shoots} onOpen={onOpen} show={(t) => `${fmtDateTime(t.planned_shoot_at)} · ${t.title}`} />
                    </td>
                  </tr>
                ))}
                {!data.rows.length ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-10 text-center text-slate-500">Henüz görev yok.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/** Günlük özet (bildirimdeki bağlantı buraya açılır) */
export function AdVideoDailyView({ onOpen, initialDate }: { onOpen: (id: string) => void; initialDate?: string }) {
  const [date, setDate] = useState(initialDate || todayKey());
  const [s, setS] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    adVideosApi
      .daily(date)
      .then((r) => setS(r.summary))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [date]);

  const block = (title: string, items: BriefTask[], show: (t: BriefTask) => string, tone = 'text-slate-900') => (
    <div className={card}>
      <p className={`mb-2 text-sm font-semibold ${tone}`}>
        {title} <span className="tabular-nums">({items.length})</span>
      </p>
      <TaskLinks items={items} onOpen={onOpen} show={show} empty="Yok" />
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setDate(addDays(date, -1))} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50" aria-label="Önceki gün">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <button type="button" onClick={() => setDate(addDays(date, 1))} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50" aria-label="Sonraki gün">
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="text-sm text-slate-600">{fmtDay(date)}</span>
      </div>
      {loading || !s ? (
        <div className="flex justify-center py-12 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {block('O gün teslim edilenler', s.delivered, (t) => `${t.teacher_name} — ${t.title}${t.is_revision ? ' (düzeltme)' : ''} · ${fmtDateTime(t.last_uploaded_at).slice(-5)}`)}
          {block('Yeni ham teslimler', s.delivered.filter((t) => !t.is_revision), (t) => `${t.teacher_name} — ${t.title}`)}
          {block('İnceleme bekleyen montajlar', s.awaiting_review, (t) => `${t.teacher_name} — ${t.title}`, 'text-indigo-800')}
          {block('Yorumlara açık', s.open_for_comments || [], (t) => `${t.teacher_name} — ${t.title}`, 'text-indigo-800')}
          {block('Gecikenler', s.overdue, (t) => `${t.teacher_name} — ${t.title} · son teslim ${fmtDateTime(t.due_at)}`, 'text-rose-700')}
          {block(`Ertesi gün (${fmtDay(s.tomorrow)}) planlanan çekimler`, s.tomorrow_shoots, (t) => `${fmtDateTime(t.planned_shoot_at).slice(-5)} ${t.teacher_name} — ${t.title}`)}
        </div>
      )}
    </div>
  );
}
