import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlarmClock, CheckCircle2, Clock, Loader2, MessageCircle, RefreshCw, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { crmTodayBoard, type CrmBoardTask, type CrmBoardWaiting, type CrmSla, type CrmTodayBoard } from '../../lib/crmInboxApi';
import { contactTitle } from '../../lib/crmContactDisplay';
import { rtCompleteTask, rtListCoaches, type RegCoach } from '../../lib/registrationTrackingApi';
import { STAGE_LABELS } from '../../lib/registrationTrackingConfig';

const SLA_STYLE: Record<CrmSla, { dot: string; chip: string; label: string }> = {
  green: { dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-800 border-emerald-200', label: '0–5 dk' },
  yellow: { dot: 'bg-amber-400', chip: 'bg-amber-50 text-amber-800 border-amber-200', label: '5–15 dk' },
  orange: { dot: 'bg-orange-500', chip: 'bg-orange-50 text-orange-800 border-orange-200', label: '15–30 dk' },
  red: { dot: 'bg-rose-600', chip: 'bg-rose-50 text-rose-800 border-rose-200', label: '30+ dk' }
};

const CHANNEL_LABEL: Record<string, string> = { whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook' };

function fmtWait(min: number) {
  if (min < 60) return `${min} dk`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} sa ${min % 60} dk`;
  return `${Math.floor(h / 24)} gün ${h % 24} sa`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function Kpi({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone: string }) {
  return (
    <div className={`rounded-2xl border bg-white p-3 shadow-sm ${tone}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 font-serif text-2xl font-semibold text-slate-900 tabular-nums">{value}</p>
      {hint ? <p className="text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

function WaitingRow({ w, showAgent }: { w: CrmBoardWaiting; showAgent: boolean }) {
  const st = SLA_STYLE[w.sla];
  return (
    <Link
      to={`/crm/inbox?c=${encodeURIComponent(w.conversation_id)}`}
      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50"
    >
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${st.dot}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium text-slate-900">{contactTitle(w)}</span>
          <span className="rounded bg-slate-100 px-1.5 py-px text-[10px] text-slate-600">
            {CHANNEL_LABEL[w.channel] || w.channel}
          </span>
          {w.is_ad ? (
            <span className="rounded bg-violet-50 px-1.5 py-px text-[10px] font-medium text-violet-700" title={w.ad_label || ''}>
              Reklam
            </span>
          ) : null}
          {showAgent ? (
            <span className="text-[10px] text-slate-500">· {w.assigned_name || 'Atanmamış'}</span>
          ) : null}
        </div>
        {w.preview ? <p className="truncate text-xs text-slate-500">{w.preview}</p> : null}
      </div>
      <span className={`shrink-0 rounded-lg border px-2 py-0.5 text-xs font-semibold tabular-nums ${st.chip}`}>
        {fmtWait(w.waiting_minutes)}
      </span>
    </Link>
  );
}

function TaskRow({ t, overdue, onDone }: { t: CrmBoardTask; overdue: boolean; onDone: (t: CrmBoardTask) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
      <button
        type="button"
        onClick={() => onDone(t)}
        className="shrink-0 rounded-full p-0.5 text-slate-400 hover:text-emerald-600"
        title="Tamamlandı olarak işaretle"
      >
        <CheckCircle2 className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{t.title}</p>
        <p className="truncate text-xs text-slate-500">
          {t.lead_id ? (
            <Link to={`/crm?rt_lead=${encodeURIComponent(t.lead_id)}`} className="text-emerald-700 hover:underline">
              {t.lead_name || 'Lead'}
            </Link>
          ) : (
            'Lead yok'
          )}
          {t.lead_stage ? ` · ${STAGE_LABELS[t.lead_stage] || t.lead_stage}` : ''}
          {t.auto_generated ? ' · otomatik takip' : ''}
        </p>
      </div>
      <span
        className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-medium tabular-nums ${
          overdue ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-700'
        }`}
      >
        {fmtTime(t.due_at)}
      </span>
    </div>
  );
}

/** FAZ 6 — Temsilci: Bugünkü İşlerim. Yönetici: aynı ekran + ekip SLA tablosu ve filtreler. */
export default function CrmTodayPage() {
  const [board, setBoard] = useState<CrmTodayBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState('');
  const [channel, setChannel] = useState('');
  const [ad, setAd] = useState('');
  const [slaFilter, setSlaFilter] = useState<CrmSla | ''>('');
  const [agents, setAgents] = useState<RegCoach[]>([]);

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      crmTodayBoard({ agent: agent || undefined, channel: channel || undefined, ad: ad || undefined })
        .then((r) => setBoard(r.data))
        .catch((e) => {
          if (!silent) toast.error(e instanceof Error ? e.message : 'Liste alınamadı');
        })
        .finally(() => setLoading(false));
    },
    [agent, channel, ad]
  );

  useEffect(() => {
    load();
    const t = window.setInterval(() => load(true), 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!board?.is_admin || agents.length) return;
    rtListCoaches()
      .then((r) => setAgents(r.data || []))
      .catch(() => undefined);
  }, [board?.is_admin, agents.length]);

  const waiting = useMemo(
    () => (board?.waiting || []).filter((w) => !slaFilter || w.sla === slaFilter),
    [board, slaFilter]
  );

  const completeTask = async (t: CrmBoardTask) => {
    try {
      await rtCompleteTask({ task_id: t.id, result: 'Tamamlandı' });
      toast.success('Görev tamamlandı');
      load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Görev güncellenemedi');
    }
  };

  const isAdmin = Boolean(board?.is_admin);
  const teamView = board?.scope === 'team';
  const tot = board?.totals;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-semibold text-slate-900">
            {teamView ? 'Satış paneli — bugün' : 'Bugünkü işlerim'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Cevap bekleyen müşteriler, gecikmiş ve bugünkü görevler, bugün gelen lead’ler. Liste dakikada bir yenilenir.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin ? (
            <select
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">Tüm ekip</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          ) : null}
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">Tüm kanallar</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
          </select>
          <select
            value={ad}
            onChange={(e) => setAd(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">Reklam + organik</option>
            <option value="ad">Yalnız reklamdan gelen</option>
            <option value="organic">Yalnız organik</option>
          </select>
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Yenile
          </button>
        </div>
      </div>

      {!board && loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
        </p>
      ) : board && tot ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Cevap bekleyen" value={tot.waiting} tone="border-slate-200" />
            <Kpi label="30+ dk bekleyen" value={tot.red} tone={tot.red ? 'border-rose-300' : 'border-slate-200'} />
            <Kpi
              label="Ort. ilk cevap (bugün)"
              value={tot.avg_response_min == null ? '—' : `${tot.avg_response_min} dk`}
              hint={`${tot.replied_today} cevap`}
              tone="border-slate-200"
            />
            <Kpi label="Gecikmiş görev" value={tot.overdue_tasks} tone={tot.overdue_tasks ? 'border-orange-300' : 'border-slate-200'} />
            <Kpi label="Bugünkü görev" value={tot.today_tasks} tone="border-slate-200" />
            <Kpi label="Bugün gelen lead" value={tot.new_leads_today} tone="border-slate-200" />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                  <MessageCircle className="h-4 w-4 text-emerald-600" /> Cevap bekleyenler
                </h3>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setSlaFilter('')}
                    className={`rounded-lg border px-2 py-0.5 text-[11px] ${!slaFilter ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-600'}`}
                  >
                    Tümü {tot.waiting}
                  </button>
                  {(['red', 'orange', 'yellow', 'green'] as CrmSla[]).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setSlaFilter(slaFilter === lvl ? '' : lvl)}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] ${
                        slaFilter === lvl ? 'ring-2 ring-slate-400' : ''
                      } ${SLA_STYLE[lvl].chip}`}
                    >
                      <span className={`h-2 w-2 rounded-full ${SLA_STYLE[lvl].dot}`} />
                      {SLA_STYLE[lvl].label} · {tot[lvl]}
                    </button>
                  ))}
                </div>
              </div>
              {waiting.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-4 text-sm text-slate-500">
                  Cevap bekleyen müşteri yok. 👏
                </p>
              ) : (
                <div className="space-y-1.5">
                  {waiting.map((w) => (
                    <WaitingRow key={w.conversation_id} w={w} showAgent={teamView} />
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-4">
              <div className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                  <AlarmClock className="h-4 w-4 text-rose-600" /> Gecikmiş görevler ({board.tasks.overdue.length})
                </h3>
                {board.tasks.overdue.length === 0 ? (
                  <p className="text-sm text-slate-500">Gecikmiş görev yok.</p>
                ) : (
                  <div className="space-y-1.5">
                    {board.tasks.overdue.map((t) => (
                      <TaskRow key={t.id} t={t} overdue onDone={completeTask} />
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                  <Clock className="h-4 w-4 text-slate-600" /> Bugünkü görevler ({board.tasks.today.length})
                </h3>
                {board.tasks.today.length === 0 ? (
                  <p className="text-sm text-slate-500">Bugün için başka görev yok.</p>
                ) : (
                  <div className="space-y-1.5">
                    {board.tasks.today.map((t) => (
                      <TaskRow key={t.id} t={t} overdue={false} onDone={completeTask} />
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                  <UserPlus className="h-4 w-4 text-sky-600" /> Bugün gelen lead’ler ({board.new_leads.length})
                </h3>
                {board.new_leads.length === 0 ? (
                  <p className="text-sm text-slate-500">Bugün yeni lead yok.</p>
                ) : (
                  <div className="space-y-1.5">
                    {board.new_leads.map((l) => (
                      <Link
                        key={l.id}
                        to={`/crm?rt_lead=${encodeURIComponent(l.id)}`}
                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                      >
                        <span className="truncate font-medium text-slate-900">
                          {l.full_name || l.parent_full_name || 'İsimsiz'}
                        </span>
                        <span className="shrink-0 text-xs text-slate-500">
                          {l.stage ? STAGE_LABELS[l.stage] || l.stage : ''} · {fmtTime(l.created_at)}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>

          {teamView && board.agents.length ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                <Users className="h-4 w-4 text-emerald-600" /> Temsilci bazında SLA
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-2">Temsilci</th>
                      <th className="px-2 text-right">Bekleyen</th>
                      {(['green', 'yellow', 'orange', 'red'] as CrmSla[]).map((lvl) => (
                        <th key={lvl} className="px-2 text-right">
                          <span className="inline-flex items-center gap-1">
                            <span className={`h-2 w-2 rounded-full ${SLA_STYLE[lvl].dot}`} />
                            {SLA_STYLE[lvl].label}
                          </span>
                        </th>
                      ))}
                      <th className="px-2 text-right">Ort. cevap</th>
                      <th className="px-2 text-right">Cevap</th>
                      <th className="px-2 text-right">Gecikmiş görev</th>
                      <th className="px-2 text-right">Bugünkü görev</th>
                      <th className="pl-2 text-right">Yeni lead</th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.agents.map((a) => (
                      <tr
                        key={a.user_id || '_unassigned'}
                        className={`border-b border-slate-100 ${a.user_id ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                        onClick={() => a.user_id && setAgent(a.user_id)}
                        title={a.user_id ? 'Bu temsilcinin listesini aç' : undefined}
                      >
                        <td className="py-2 pr-2 font-medium text-slate-900">
                          {a.name}
                          {a.on_duty === true ? (
                            <span className="ml-1.5 rounded bg-emerald-50 px-1.5 py-px text-[10px] font-semibold text-emerald-700">
                              görevde
                            </span>
                          ) : a.on_duty === false ? (
                            <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-px text-[10px] text-slate-500">
                              vardiya dışı
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 text-right tabular-nums">{a.waiting}</td>
                        <td className="px-2 text-right tabular-nums text-emerald-700">{a.green || ''}</td>
                        <td className="px-2 text-right tabular-nums text-amber-700">{a.yellow || ''}</td>
                        <td className="px-2 text-right tabular-nums text-orange-700">{a.orange || ''}</td>
                        <td className="px-2 text-right font-semibold tabular-nums text-rose-700">{a.red || ''}</td>
                        <td className="px-2 text-right tabular-nums">{a.avg_response_min == null ? '—' : `${a.avg_response_min} dk`}</td>
                        <td className="px-2 text-right tabular-nums">{a.replied_today}</td>
                        <td className={`px-2 text-right tabular-nums ${a.overdue_tasks ? 'font-semibold text-orange-700' : ''}`}>
                          {a.overdue_tasks}
                        </td>
                        <td className="px-2 text-right tabular-nums">{a.today_tasks}</td>
                        <td className="pl-2 text-right tabular-nums">{a.new_leads_today}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Bekleme süresi: müşterinin cevaplanmamış ilk mesajından bu yana geçen süre. Ortalama cevap: bugün verilen
                cevaplarda müşterinin ilk mesajından temsilcinin cevabına kadar geçen süre.
              </p>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
