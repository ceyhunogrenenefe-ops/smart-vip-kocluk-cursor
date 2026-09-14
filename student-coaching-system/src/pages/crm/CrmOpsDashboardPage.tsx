import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Clock, Globe, GraduationCap, Instagram, Loader2, MessageCircle, Trophy, Users } from 'lucide-react';
import { toast } from 'sonner';
import { rtListCoaches, rtOpsDashboard, type CrmOpsDashboard, type RegCoach } from '../../lib/registrationTrackingApi';
import CrmFilterBar, { type CrmTimePreset } from './CrmFilterBar';
import { CRM_OPS_DEMO_COACHES, CRM_OPS_DEMO_DASHBOARD } from './crmOpsDemo';

function todayYmd() {
  const d = new Date();
  const ist = new Date(d.getTime() + 3 * 3600 * 1000);
  return ist.toISOString().slice(0, 10);
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accent
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: typeof Clock;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className={`mb-3 inline-flex rounded-xl p-2 ${accent}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-serif text-3xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

const SOURCE_VISUAL: Record<
  string,
  { icon: typeof Globe; wrap: string; bar: string; color: string }
> = {
  website: { icon: Globe, wrap: 'bg-sky-100 text-sky-800', bar: 'bg-sky-500', color: '#0ea5e9' },
  instagram: { icon: Instagram, wrap: 'bg-fuchsia-100 text-fuchsia-800', bar: 'bg-fuchsia-500', color: '#c026d3' },
  whatsapp: { icon: MessageCircle, wrap: 'bg-emerald-100 text-emerald-800', bar: 'bg-emerald-500', color: '#059669' },
  facebook: { icon: MessageCircle, wrap: 'bg-blue-100 text-blue-800', bar: 'bg-blue-600', color: '#2563eb' },
  other: { icon: Users, wrap: 'bg-slate-100 text-slate-700', bar: 'bg-slate-400', color: '#94a3b8' }
};

function SourceMixPanel({
  sources
}: {
  sources: Array<{ id: string; label: string; hint?: string; count: number; pct: number }>;
}) {
  const featured = sources.filter((s) => ['website', 'instagram', 'whatsapp'].includes(s.id));
  const pie = sources.filter((s) => s.count > 0);
  const total = sources.reduce((n, s) => n + (s.count || 0), 0);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Desteklenen gelen kanallar</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Web sitesi formu, Instagram DM ve WhatsApp gelen kutusu — seçili dönemdeki lead kaynağı.
          </p>
        </div>
        <p className="text-xs font-medium tabular-nums text-slate-500">{total} iletişim</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-5">
        <div className="grid gap-3 sm:grid-cols-3 lg:col-span-3">
          {featured.map((s) => {
            const vis = SOURCE_VISUAL[s.id] || SOURCE_VISUAL.other;
            const Icon = vis.icon;
            return (
              <div key={s.id} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold ${vis.wrap}`}>
                    <Icon className="h-3.5 w-3.5" />
                    {s.label}
                  </span>
                  <span className="text-lg font-semibold tabular-nums text-slate-900">{s.count}</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">{s.hint}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                  <div className={`h-full rounded-full ${vis.bar}`} style={{ width: `${Math.min(100, s.pct)}%` }} />
                </div>
                <p className="mt-1 text-[11px] font-medium tabular-nums text-slate-600">%{s.pct}</p>
              </div>
            );
          })}
        </div>
        <div className="h-44 lg:col-span-2">
          {pie.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="count" nameKey="label" innerRadius={42} outerRadius={68} paddingAngle={2}>
                  {pie.map((s) => (
                    <Cell key={s.id} fill={(SOURCE_VISUAL[s.id] || SOURCE_VISUAL.other).color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number, n: string) => [`${v}`, n]} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="flex h-full items-center justify-center text-sm text-slate-400">Kanal verisi yok</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CrmOpsDashboardPage() {
  const [preset, setPreset] = useState<CrmTimePreset>('this_week');
  const [from, setFrom] = useState(todayYmd());
  const [to, setTo] = useState(todayYmd());
  const [agentId, setAgentId] = useState('');
  const [coaches, setCoaches] = useState<RegCoach[]>(CRM_OPS_DEMO_COACHES);
  const [data, setData] = useState<CrmOpsDashboard | null>(null);
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);

  const query = useMemo(() => {
    const q: Record<string, string> = { preset };
    if (preset === 'custom') {
      q.date_from = from;
      q.date_to = to;
    }
    if (agentId) q.assigned_user_id = agentId;
    return q;
  }, [preset, from, to, agentId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, coachRes] = await Promise.all([
        rtOpsDashboard(query),
        rtListCoaches().catch(() => ({ data: [] as RegCoach[] }))
      ]);
      const live = dash.data;
      const sourceSum = (live.sources || []).reduce((n, s) => n + (s.count || 0), 0);
      const empty =
        !live.contacts &&
        !live.confirmed &&
        !live.trial_lessons &&
        !sourceSum &&
        !(live.agents || []).some((a) => a.leads);
      if (empty) {
        setDemo(true);
        setData(CRM_OPS_DEMO_DASHBOARD);
        setCoaches(coachRes.data?.length ? coachRes.data : CRM_OPS_DEMO_COACHES);
      } else {
        setDemo(false);
        setData(live);
        setCoaches(live.coaches?.length ? live.coaches : coachRes.data || []);
      }
    } catch (e) {
      setDemo(true);
      setData(CRM_OPS_DEMO_DASHBOARD);
      setCoaches(CRM_OPS_DEMO_COACHES);
      toast.message(e instanceof Error ? e.message : 'Örnek veriler gösteriliyor');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  const agents = (data?.agents || []).filter((a) => !agentId || a.id === agentId);

  return (
    <div className="space-y-4 pb-10">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">CRM · Performans</p>
        <h2 className="mt-1 font-serif text-2xl font-semibold text-slate-900">Dashboard</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Seçili dönem ve temsilciye göre iletişim, deneme dersi, kesin kayıt, ilk yanıt süresi ve gelen kanal
          (web sitesi · Instagram · WhatsApp).
        </p>
      </div>

      <CrmFilterBar
        preset={preset}
        from={from}
        to={to}
        agentId={agentId}
        agents={coaches}
        onPreset={setPreset}
        onFrom={setFrom}
        onTo={setTo}
        onAgent={setAgentId}
      />

      {demo && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Canlı KPI boş veya erişilemedi — ekran <strong>örnek veri</strong> ile (Muzaffer Apaydın) test edilebilir.
        </p>
      )}

      {loading && !data ? (
        <div className="flex justify-center py-16 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="İletişim sayısı"
              value={data?.contacts ?? 0}
              hint="Ulaşılan / konuşulan kişi"
              icon={MessageCircle}
              accent="bg-sky-100 text-sky-700"
            />
            <KpiCard
              label="Deneme dersi"
              value={data?.trial_lessons ?? 0}
              hint="Planlanan + katılan"
              icon={GraduationCap}
              accent="bg-violet-100 text-violet-700"
            />
            <KpiCard
              label="Kayıt / satış"
              value={data?.confirmed ?? 0}
              hint="Kesin kayda dönüşen"
              icon={Trophy}
              accent="bg-emerald-100 text-emerald-700"
            />
            <KpiCard
              label="Ortalama yanıt"
              value={data?.avg_first_response_label || '—'}
              hint={`${data?.first_response_samples || 0} sohbet · first response`}
              icon={Clock}
              accent="bg-orange-100 text-orange-700"
            />
          </div>

          <SourceMixPanel sources={data?.sources || []} />

          <div className="grid gap-4 xl:grid-cols-5">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm xl:col-span-3">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Users className="h-4 w-4 text-emerald-700" />
                Acente performans karşılaştırması
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3 font-semibold">Temsilci</th>
                      <th className="py-2 pr-3 font-semibold">Toplam lead</th>
                      <th className="py-2 pr-3 font-semibold">Yanıt süresi</th>
                      <th className="py-2 pr-3 font-semibold">Deneme</th>
                      <th className="py-2 pr-3 font-semibold">Kesin kayıt</th>
                      <th className="py-2 font-semibold">Dönüşüm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((a) => (
                      <tr key={a.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-2.5 pr-3 font-medium text-slate-900">{a.name}</td>
                        <td className="py-2.5 pr-3">{a.leads}</td>
                        <td className="py-2.5 pr-3 tabular-nums text-slate-700">{a.response_label}</td>
                        <td className="py-2.5 pr-3">{a.trial_lessons}</td>
                        <td className="py-2.5 pr-3 font-semibold text-emerald-700">{a.confirmed}</td>
                        <td className="py-2.5 tabular-nums">{a.conversion_rate}%</td>
                      </tr>
                    ))}
                    {!agents.length && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-500">
                          Bu aralıkta temsilci verisi yok.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm xl:col-span-2">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">Günlük iletişim / kayıt</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.series || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v) => String(v).slice(5)} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="contacts" name="İletişim" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="confirmed" name="Kayıt" fill="#059669" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
