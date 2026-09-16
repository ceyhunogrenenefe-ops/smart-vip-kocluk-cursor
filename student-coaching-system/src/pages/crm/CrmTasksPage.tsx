import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCircle2, Clock, Loader2, Phone } from 'lucide-react';
import { toast } from 'sonner';
import {
  rtCompleteTask,
  rtListCoaches,
  rtListOpsTasks,
  rtSnoozeTask,
  type CrmOpsTask,
  type RegCoach
} from '../../lib/registrationTrackingApi';
import CrmFilterBar, { type CrmTimePreset } from './CrmFilterBar';
import { CRM_OPS_DEMO_COACHES, CRM_OPS_DEMO_TASKS } from './crmOpsDemo';

function todayYmd() {
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

function fmt(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

export default function CrmTasksPage() {
  const navigate = useNavigate();
  const [preset, setPreset] = useState<CrmTimePreset>('this_week');
  const [from, setFrom] = useState(todayYmd());
  const [to, setTo] = useState(todayYmd());
  const [agentId, setAgentId] = useState('');
  const [bucket, setBucket] = useState<'all' | 'pending' | 'overdue' | 'done'>('all');
  const [items, setItems] = useState<CrmOpsTask[]>([]);
  const [coaches, setCoaches] = useState<RegCoach[]>(CRM_OPS_DEMO_COACHES);
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);

  const query = useMemo(() => {
    const q: Record<string, string> = { preset, bucket };
    if (preset === 'custom') {
      q.date_from = from;
      q.date_to = to;
    }
    if (agentId) q.assigned_user_id = agentId;
    return q;
  }, [preset, from, to, agentId, bucket]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, coachRes] = await Promise.all([
        rtListOpsTasks(query),
        rtListCoaches().catch(() => ({ data: [] as RegCoach[] }))
      ]);
      const live = res.data?.items || [];
      setDemo(!live.length);
      setItems(live.length ? live : CRM_OPS_DEMO_TASKS);
      setCoaches(coachRes.data?.length ? coachRes.data : CRM_OPS_DEMO_COACHES);
    } catch {
      setDemo(true);
      setItems(CRM_OPS_DEMO_TASKS);
      setCoaches(CRM_OPS_DEMO_COACHES);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = items.filter((t) => {
    if (bucket === 'done') return t.status === 'completed';
    if (bucket === 'overdue') return t.status === 'overdue';
    if (bucket === 'pending') return t.status === 'pending' || t.status === 'in_progress';
    return true;
  });

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız');
    }
  };

  return (
    <div className="space-y-4 pb-10">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">CRM · Takip</p>
        <h2 className="mt-1 font-serif text-2xl font-semibold">Görevler</h2>
        <p className="mt-1 text-sm text-slate-600">
          Günün bekleyen, geciken ve tamamlanan arama / takip alarmları. Atanan temsilciye görev saatinden{' '}
          <strong>5 dakika önce</strong> panel bildirimi ve WhatsApp hatırlatması gider.
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

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ['all', 'Tümü'],
            ['pending', 'Bekleyen'],
            ['overdue', 'Geciken'],
            ['done', 'Tamamlanan']
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setBucket(id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              bucket === id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {demo && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Canlı görev yok — örnek takip listesi (Zeynep Kaya, Ahmet Yılmaz).
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((t) => (
            <div
              key={t.id}
              className={`rounded-2xl border bg-white p-4 shadow-sm ${
                t.status === 'overdue'
                  ? 'border-red-200'
                  : t.status === 'completed'
                    ? 'border-emerald-100'
                    : 'border-slate-200'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{t.lead_name}</p>
                  <p className="text-xs text-slate-500">{t.lead_phone || 'Telefon yok'}</p>
                  <p className="mt-1 text-sm text-slate-700">{t.title}</p>
                  {t.description ? <p className="mt-0.5 text-xs text-slate-500">{t.description}</p> : null}
                  <p className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500">
                    {t.status === 'completed' ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    ) : t.status === 'overdue' ? (
                      <Bell className="h-3.5 w-3.5 text-red-600" />
                    ) : (
                      <Clock className="h-3.5 w-3.5" />
                    )}
                    {fmt(t.due_at)}
                  </p>
                </div>
                {t.status !== 'completed' && (
                  <div className="flex flex-wrap gap-1.5">
                    {t.lead_phone && (
                      <a
                        href={`tel:${t.lead_phone.replace(/\s/g, '')}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white"
                      >
                        <Phone className="h-3 w-3" /> Şimdi ara
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => navigate(`/crm?rt_lead=${t.lead_id}`)}
                      className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white"
                    >
                      Mesaj gönder
                    </button>
                    <button
                      type="button"
                      onClick={() => act(() => rtSnoozeTask(t.id, 5), '5 dk ertelendi')}
                      className="rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-semibold text-amber-900"
                    >
                      5 dk ertele
                    </button>
                    <button
                      type="button"
                      onClick={() => act(() => rtCompleteTask({ task_id: t.id, result: 'Tamamlandı' }), 'Tamamlandı')}
                      className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
                    >
                      Tamamlandı
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {!visible.length && <p className="py-10 text-center text-sm text-slate-500">Bu filtrede görev yok.</p>}
        </div>
      )}
    </div>
  );
}
