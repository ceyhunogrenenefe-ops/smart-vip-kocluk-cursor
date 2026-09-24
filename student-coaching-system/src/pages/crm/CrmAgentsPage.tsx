import { useCallback, useEffect, useState } from 'react';
import { Circle, Loader2, UserCheck, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import {
  crmAdminCreateUser,
  crmAdminDemoteAgent,
  crmAdminListAgents,
  crmAdminPromoteAgent,
  crmListPresence
} from '../../lib/crmInboxApi';
import { useAuth } from '../../context/AuthContext';
import { userRoleTags } from '../../config/rolePermissions';
import CrmAssignmentPanel from './CrmAssignmentPanel';
import CrmFollowUpRulesPanel from './CrmFollowUpRulesPanel';
import CrmCannedRepliesPanel from './CrmCannedRepliesPanel';
import CrmStaffAlertsPanel from './CrmStaffAlertsPanel';
import CrmShiftsPanel from './CrmShiftsPanel';

type AgentRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  roles?: string[];
};

type CoachRow = { id: string; name: string; email: string; role: string };

export default function CrmAgentsPage() {
  const { effectiveUser } = useAuth();
  const roleTags = userRoleTags(effectiveUser);
  /** Temsilci listeyi görür; ekleme, vardiya ve kural düzenleme yöneticide kalır */
  const canManage = roleTags.includes('super_admin') || roleTags.includes('admin');
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [promoteId, setPromoteId] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await crmAdminListAgents();
      const fromRoles = res.data?.role_users || [];
      const fromAssign = (res.data?.assignments || [])
        .map((a: Record<string, unknown>) => {
          const u = a.users as { id: string; name: string; email: string; role: string; roles?: string[] } | undefined;
          return u ? { id: u.id, name: u.name, email: u.email, role: u.role, roles: u.roles } : null;
        })
        .filter(Boolean) as AgentRow[];
      const map = new Map<string, AgentRow>();
      for (const u of [...fromRoles, ...fromAssign]) map.set(u.id, u);
      setAgents([...map.values()]);
      setCoaches(res.data?.coach_candidates || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Temsilci listesi alınamadı');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    const loadPresence = async () => {
      try {
        const res = await crmListPresence(false);
        if (cancelled) return;
        const ids = new Set(
          (res.data?.items || []).filter((p) => p.online).map((p) => p.user_id)
        );
        setOnlineIds(ids);
      } catch {
        if (!cancelled) setOnlineIds(new Set());
      }
    };
    void loadPresence();
    const id = window.setInterval(() => void loadPresence(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

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
      toast.success('CRM temsilcisi oluşturuldu');
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
      toast.success('Koç CRM temsilcisi olarak atandı');
      setPromoteId('');
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Atama başarısız');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-semibold text-slate-900">
          {canManage ? 'CRM Temsilci Yönetimi' : 'CRM Temsilcileri'}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {canManage
            ? 'Yalnızca CRM erişimli kullanıcı oluşturun veya mevcut koçları temsilci yapın. Temsilciler faturalama ve sistem ayarlarını göremez.'
            : 'Ekipteki temsilciler ve vardiyalar. Değişiklik yalnızca yöneticide yapılır.'}
        </p>
      </div>

      {/* Yönetim panelleri yalnız yöneticide; temsilci listeyi görür */}
      {canManage ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <CrmAssignmentPanel agents={agents} />
          <CrmFollowUpRulesPanel />
          <CrmShiftsPanel agents={agents} />
          <CrmStaffAlertsPanel />
          <CrmCannedRepliesPanel />
        </div>
      ) : null}

      {canManage ? (
      <div className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={onCreate}
          className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h3 className="flex items-center gap-2 font-semibold text-slate-900">
            <UserPlus className="h-4 w-4 text-emerald-600" />
            Yeni CRM temsilcisi
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
            Mevcut koçu temsilci yap
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
            CRM temsilcisi olarak ata
          </button>
        </div>
      </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3 font-semibold text-slate-900">
          Aktif temsilciler
          <span className="ml-2 text-xs font-normal text-emerald-700">
            · {onlineIds.size} çevrimiçi
          </span>
        </div>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : agents.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Henüz CRM temsilcisi yok</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {agents.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="flex items-center gap-1.5 font-medium text-slate-900">
                    <Circle
                      className={`h-2.5 w-2.5 ${
                        onlineIds.has(a.id) ? 'fill-emerald-500 text-emerald-500' : 'fill-slate-300 text-slate-300'
                      }`}
                    />
                    {a.name}
                    {onlineIds.has(a.id) ? (
                      <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                        çevrimiçi
                      </span>
                    ) : null}
                  </p>
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
                        toast.success('Temsilci yetkisi kaldırıldı');
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
