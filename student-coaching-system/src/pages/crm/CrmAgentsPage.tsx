import { useCallback, useEffect, useState } from 'react';
import { Loader2, UserCheck, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import {
  crmAdminCreateUser,
  crmAdminDemoteAgent,
  crmAdminListAgents,
  crmAdminPromoteAgent
} from '../../lib/crmInboxApi';

type AgentRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  roles?: string[];
};

type CoachRow = { id: string; name: string; email: string; role: string };

export default function CrmAgentsPage() {
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [promoteId, setPromoteId] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await crmAdminListAgents();
      setAgents(res.data?.role_users || []);
      setCoaches(res.data?.coach_candidates || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ajan listesi alınamadı');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await crmAdminCreateUser({
        name,
        email,
        password,
        can_access_unassigned_pool: true
      });
      toast.success('CRM ajanı oluşturuldu');
      setName('');
      setEmail('');
      setPassword('');
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Oluşturulamadı');
    } finally {
      setCreating(false);
    }
  };

  const onPromote = async () => {
    if (!promoteId) return;
    try {
      await crmAdminPromoteAgent({
        user_id: promoteId,
        can_access_unassigned_pool: true
      });
      toast.success('Koç CRM ajanı olarak atandı');
      setPromoteId('');
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Atama başarısız');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-semibold text-slate-900">CRM Ajan Yönetimi</h2>
        <p className="mt-1 text-sm text-slate-600">
          Yalnızca CRM erişimli kullanıcı oluşturun veya mevcut koçları ajan yapın. Ajanlar faturalama ve
          sistem ayarlarını göremez.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={onCreate}
          className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h3 className="flex items-center gap-2 font-semibold text-slate-900">
            <UserPlus className="h-4 w-4 text-emerald-600" />
            Yeni CRM ajanı
          </h3>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ad Soyad"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-posta"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            required
            type="password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Şifre (min 6)"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Oluştur
          </button>
        </form>

        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 font-semibold text-slate-900">
            <UserCheck className="h-4 w-4 text-sky-600" />
            Mevcut koçu ajan yap
          </h3>
          <select
            value={promoteId}
            onChange={(e) => setPromoteId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">Koç seçin…</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.email})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void onPromote()}
            disabled={!promoteId}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            CRM ajanı olarak ata
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3 font-semibold text-slate-900">
          Aktif ajanlar
        </div>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : agents.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Henüz CRM ajanı yok</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {agents.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-slate-900">{a.name}</p>
                  <p className="text-xs text-slate-500">
                    {a.email} · {a.role}
                    {a.roles?.length ? ` [${a.roles.join(', ')}]` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void crmAdminDemoteAgent(a.id)
                      .then(() => {
                        toast.success('Ajan yetkisi kaldırıldı');
                        return reload();
                      })
                      .catch((err) => toast.error(err.message));
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  Yetkiyi kaldır
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
