import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Clock, GraduationCap, Loader2, MessageCircle, Trophy, Users } from 'lucide-react';
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
      const empty = !live.contacts && !live.confirmed && !live.trial_lessons && !(live.agents || []).some((a) => a.leads);
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
          Seçili dönem ve temsilciye göre iletişim, deneme dersi, kesin kayıt ve ilk yanıt süresi.
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
