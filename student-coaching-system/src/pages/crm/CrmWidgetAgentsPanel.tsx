import { useCallback, useEffect, useState } from 'react';
import { Loader2, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  crmAdminAddWidgetAgent,
  crmAdminRemoveWidgetAgent,
  crmAdminWidgetAgents,
  type CrmWidgetAgentDirectory
} from '../../lib/crmInboxApi';
import { CRM_WIDGET_CATALOG, type CrmWidgetDef } from './crmWidgetCatalog';

function explain(e: unknown) {
  const msg = e instanceof Error ? e.message : '';
  if (/schema_missing|crm_widget_agents_schema/.test(msg)) {
    return 'Temsilci kadrosu kaydedilemedi. Veritabanı şeması kurulamadı.';
  }
  return msg || 'İşlem başarısız';
}

function WidgetAgentRow({
  widget,
  people,
  candidates,
  picked,
  busy,
  onPick,
  onAdd,
  onRemove
}: {
  widget: CrmWidgetDef;
  people: Array<{ id: string; name: string; email: string }>;
  candidates: CrmWidgetAgentDirectory['candidates'];
  picked: string;
  busy: boolean;
  onPick: (userId: string) => void;
  onAdd: () => void;
  onRemove: (userId: string) => void;
}) {
  const taken = new Set(people.map((p) => p.id));
  const options = candidates.filter((c) => !taken.has(c.id));
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-[10px] font-bold text-white ${widget.accent}`}
        >
          {widget.mark}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{widget.name}</p>
          <p className="text-[11px] text-slate-500">{people.length ? `${people.length} temsilci` : 'Temsilci yok'}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {people.map((p) => (
          <span
            key={p.id}
            className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs text-slate-800 ring-1 ring-slate-200"
          >
            {p.name || p.email}
            <button
              type="button"
              disabled={busy}
              onClick={() => onRemove(p.id)}
              className="rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
              aria-label={`${p.name} temsilciliğini kaldır`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        <select
          value={picked}
          onChange={(e) => onPick(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
        >
          <option value="">Temsilci seçin…</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name || c.email}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || !picked}
          onClick={onAdd}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
          Ekle
        </button>
      </div>
    </div>
  );
}

/** Widgetler sayfası: kanala temsilci eklenince Temsilciler listesine düşer. */
export default function CrmWidgetAgentsPanel() {
  const [data, setData] = useState<CrmWidgetAgentDirectory | null>(null);
  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await crmAdminWidgetAgents();
      setData(res.data);
    } catch (e) {
      toast.error(explain(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = (next: CrmWidgetAgentDirectory) => {
    setData(next);
  };

  const add = async (widgetId: string) => {
    const userId = pick[widgetId];
    if (!userId) return;
    setBusyId(widgetId);
    try {
      const res = await crmAdminAddWidgetAgent(widgetId, userId);
      apply(res.data);
      setPick((p) => ({ ...p, [widgetId]: '' }));
      toast.success('Temsilci widget’e eklendi');
    } catch (e) {
      toast.error(explain(e));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (widgetId: string, userId: string) => {
    setBusyId(`${widgetId}:${userId}`);
    try {
      const res = await crmAdminRemoveWidgetAgent(widgetId, userId);
      apply(res.data);
      toast.success('Temsilci widget’ten çıkarıldı');
    } catch (e) {
      toast.error(explain(e));
    } finally {
      setBusyId(null);
    }
  };

  const live = CRM_WIDGET_CATALOG.filter((w) => w.action !== 'soon');
  const later = CRM_WIDGET_CATALOG.filter((w) => w.action === 'soon');
  const peopleOf = (id: string) => data?.by_widget?.[id] || [];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <UserPlus className="h-5 w-5 text-emerald-600" />
            Widget temsilcileri
          </h3>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Bir widget’e eklenen kişi Temsilciler listesinde görünür. Yeni temsilci ekledikçe o liste büyür;
            widget’ten çıkarınca listeden de düşer.
          </p>
        </div>
        {loading ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {live.map((w) => (
          <WidgetAgentRow
            key={w.id}
            widget={w}
            people={peopleOf(w.id)}
            candidates={data?.candidates || []}
            picked={pick[w.id] || ''}
            busy={busyId === w.id || Boolean(busyId?.startsWith(`${w.id}:`))}
            onPick={(userId) => setPick((p) => ({ ...p, [w.id]: userId }))}
            onAdd={() => void add(w.id)}
            onRemove={(userId) => void remove(w.id, userId)}
          />
        ))}
      </div>

      <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">Sıradaki widgetler</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {later.map((w) => (
            <WidgetAgentRow
              key={w.id}
              widget={w}
              people={peopleOf(w.id)}
              candidates={data?.candidates || []}
              picked={pick[w.id] || ''}
              busy={busyId === w.id || Boolean(busyId?.startsWith(`${w.id}:`))}
              onPick={(userId) => setPick((p) => ({ ...p, [w.id]: userId }))}
              onAdd={() => void add(w.id)}
              onRemove={(userId) => void remove(w.id, userId)}
            />
          ))}
        </div>
      </details>
    </section>
  );
}
