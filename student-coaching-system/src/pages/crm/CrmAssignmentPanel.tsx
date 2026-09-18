import { useCallback, useEffect, useState } from 'react';
import { Loader2, Shuffle } from 'lucide-react';
import { toast } from 'sonner';
import {
  crmAdminAssignmentSettings,
  crmAdminDistributeUnassigned,
  crmAdminSetRoundRobin,
  type CrmAssignmentSettings
} from '../../lib/crmInboxApi';

/** FAZ 2 — otomatik dağıtım (round robin) ayarları ve atanmamışları dağıtma */
export default function CrmAssignmentPanel({
  agents
}: {
  agents: Array<{ id: string; name: string; email?: string }>;
}) {
  const [data, setData] = useState<CrmAssignmentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await crmAdminAssignmentSettings();
      setData(res.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Dağıtım ayarları alınamadı');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, agents.length]);

  const inPool = new Set((data?.pool || []).map((p) => p.id));

  const toggleEnabled = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const res = await crmAdminAssignmentSettings(!data.round_robin_enabled);
      setData(res.data);
      toast.success(res.data.round_robin_enabled ? 'Otomatik dağıtım açıldı' : 'Otomatik dağıtım kapatıldı');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  const togglePool = async (userId: string) => {
    setBusy(true);
    try {
      await crmAdminSetRoundRobin(userId, !inPool.has(userId));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  const distribute = async () => {
    if (!data) return;
    const total = data.unassigned_leads + data.unassigned_conversations;
    if (
      !window.confirm(
        `${data.unassigned_leads} atanmamış aday ve ${data.unassigned_conversations} atanmamış açık sohbet, dağıtıma dahil ${data.pool.length} temsilciye sırayla dağıtılsın mı?`
      )
    ) {
      return;
    }
    if (!total) return;
    setBusy(true);
    try {
      const res = await crmAdminDistributeUnassigned();
      const per = res.data.per_agent.map((a) => `${a.name}: ${a.count}`).join(' · ');
      toast.success(`${res.data.leads_assigned} aday, ${res.data.conversations_assigned} sohbet dağıtıldı. ${per}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Dağıtılamadı');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-slate-900">
            <Shuffle className="h-4 w-4 text-emerald-600" />
            Otomatik dağıtım (sırayla)
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Yeni aday ve sohbetler dağıtıma dahil temsilcilere sırayla atanır. Kayıtlı öğrenci / veli mesajları
            (kurum içi) dağıtılmaz. Yönetici istediği adayı pipeline veya gelen kutusundan başka temsilciye aktarabilir.
          </p>
        </div>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        ) : data ? (
          <button
            type="button"
            role="switch"
            aria-checked={data.round_robin_enabled}
            disabled={busy}
            onClick={() => void toggleEnabled()}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
              data.round_robin_enabled ? 'bg-emerald-600' : 'bg-slate-300'
            }`}
            title={data.round_robin_enabled ? 'Açık' : 'Kapalı'}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                data.round_robin_enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        ) : null}
      </div>

      {data ? (
        <>
          <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100">
            {agents.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-slate-900">{a.name}</span>
                  {a.email ? <span className="block truncate text-xs text-slate-500">{a.email}</span> : null}
                </span>
                <label className="flex shrink-0 items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={inPool.has(a.id)}
                    disabled={busy}
                    onChange={() => void togglePool(a.id)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                  />
                  Dağıtıma dahil
                </label>
              </li>
            ))}
            {!agents.length ? <li className="px-3 py-2 text-sm text-slate-500">Temsilci yok</li> : null}
          </ul>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-100">
            <span>
              Atanmamış: <strong>{data.unassigned_leads}</strong> aday · <strong>{data.unassigned_conversations}</strong> açık
              sohbet
            </span>
            <button
              type="button"
              disabled={busy || !data.pool.length || data.unassigned_leads + data.unassigned_conversations === 0}
              onClick={() => void distribute()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shuffle className="h-3.5 w-3.5" />}
              Atanmamışları dağıt
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
