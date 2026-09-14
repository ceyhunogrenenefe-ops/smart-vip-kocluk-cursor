import { useCallback, useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { crmListMetaTemplates, type CrmMetaTemplate } from '../../lib/crmInboxApi';
import { rtBulkTemplateSend, rtListCoaches, rtSegmentLeads, type RegCoach } from '../../lib/registrationTrackingApi';
import { CrmTemplateSendPreviewModal, fillTemplatePreview } from './CrmTemplateModals';
import { CRM_OPS_DEMO_COACHES, CRM_OPS_DEMO_SEGMENT } from './crmOpsDemo';

const SEGMENTS = [
  { id: 'all_tracking', label: 'Tüm takip lead’leri' },
  { id: 'trial_no_show', label: 'Deneme dersine gelmeyenler' },
  { id: 'offer_pending', label: 'Fiyat teklifi bekleyenler' },
  { id: 'considering', label: 'Düşünüyor / tekrar aranacak' },
  { id: 'new_lead', label: 'Yeni lead’ler' }
];

type QueueRow = {
  lead_id: string;
  name: string;
  phone?: string | null;
  status: 'queued' | 'sending' | 'sent' | 'error';
  error?: string | null;
};

export default function CrmBulkMessagePage() {
  const [templates, setTemplates] = useState<CrmMetaTemplate[]>([]);
  const [segment, setSegment] = useState('trial_no_show');
  const [agentId, setAgentId] = useState('');
  const [coaches, setCoaches] = useState<RegCoach[]>(CRM_OPS_DEMO_COACHES);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [selected, setSelected] = useState<CrmMetaTemplate | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tplParams, setTplParams] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tpl, coachesRes, seg] = await Promise.all([
        crmListMetaTemplates().catch(() => ({ data: [] as CrmMetaTemplate[] })),
        rtListCoaches().catch(() => ({ data: [] as RegCoach[] })),
        rtSegmentLeads({ segment, assigned_user_id: agentId }).catch(() => ({ data: { items: [] } }))
      ]);
      setTemplates(tpl.data || []);
      setCoaches(coachesRes.data?.length ? coachesRes.data : CRM_OPS_DEMO_COACHES);
      const items = seg.data?.items?.length ? seg.data.items : CRM_OPS_DEMO_SEGMENT;
      setQueue(
        items.map((l) => ({
          lead_id: l.id,
          name: l.full_name || [l.first_name, l.last_name].filter(Boolean).join(' ') || 'Lead',
          phone: l.phone || l.normalized_phone,
          status: 'queued'
        }))
      );
    } finally {
      setLoading(false);
    }
  }, [segment, agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    if (!selected || !queue.length) return;
    const filled = fillTemplatePreview(selected.body || '', tplParams, selected.variableNames || []);
    setSending(true);
    setQueue((rows) => rows.map((r) => ({ ...r, status: 'sending' as const })));
    try {
      const res = await rtBulkTemplateSend({
        lead_ids: queue.map((r) => r.lead_id),
        template_name: selected.name,
        template_language: selected.language,
        template_params: tplParams,
        template_body: filled,
        channel: 'whatsapp'
      });
      const byId = Object.fromEntries((res.data?.results || []).map((r) => [r.lead_id, r]));
      setQueue((rows) =>
        rows.map((r) => {
          const hit = byId[r.lead_id];
          return {
            ...r,
            status: hit?.ok ? 'sent' : 'error',
            error: hit?.error || null
          };
        })
      );
      toast.success(`${res.data?.sent || 0} gönderildi · ${res.data?.failed || 0} hatalı`);
    } catch (e) {
      setQueue((rows) => rows.map((r) => ({ ...r, status: 'error', error: e instanceof Error ? e.message : 'Hata' })));
      toast.error(e instanceof Error ? e.message : 'Toplu gönderim başarısız');
    } finally {
      setSending(false);
      setPreviewOpen(false);
    }
  };

  const badge = (s: QueueRow['status']) => {
    if (s === 'sent') return 'bg-emerald-100 text-emerald-800';
    if (s === 'error') return 'bg-red-100 text-red-800';
    if (s === 'sending') return 'bg-sky-100 text-sky-800';
    return 'bg-slate-100 text-slate-600';
  };
  const label = (s: QueueRow['status']) =>
    s === 'sent' ? 'Gönderildi' : s === 'error' ? 'Hatalı' : s === 'sending' ? 'Gönderiliyor' : 'Kuyrukta';

  return (
    <div className="space-y-4 pb-10">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">CRM · WhatsApp / Instagram</p>
        <h2 className="mt-1 font-serif text-2xl font-semibold">Toplu mesaj</h2>
        <p className="mt-1 text-sm text-slate-600">
          Meta onaylı şablon seçin, hedef kitleyi süzün, önizleyip kuyruğa alın.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold">Hedef kitle</h3>
          <label className="mt-3 block text-xs font-medium text-slate-500">Segment</label>
          <select
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          >
            {SEGMENTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <label className="mt-3 block text-xs font-medium text-slate-500">Temsilci</label>
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">Tüm acenteler</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}’ın takip ettikleri
              </option>
            ))}
          </select>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold">Onaylı şablonlar</h3>
          <div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto">
            {templates.map((t) => (
              <button
                key={`${t.name}-${t.language}`}
                type="button"
                onClick={() => {
                  setSelected(t);
                  setTplParams(Array.from({ length: t.variableCount || 0 }, () => ''));
                }}
                className={`block w-full rounded-xl border px-3 py-2 text-left text-sm ${
                  selected?.name === t.name ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span className="font-medium">{t.name}</span>
                <span className="ml-2 text-[10px] uppercase text-slate-400">{t.language}</span>
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{t.body}</p>
              </button>
            ))}
            {!templates.length && (
              <p className="text-xs text-slate-500">Onaylı şablon yok. Inbox’tan şablon ekleyin.</p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Gönderim kuyruğu · {queue.length} kişi</h3>
          <button
            type="button"
            disabled={!selected || !queue.length || sending}
            onClick={() => setPreviewOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Önizle ve gönder
          </button>
        </div>
        {loading ? (
          <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin text-slate-400" />
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b text-[11px] uppercase text-slate-500">
                <th className="py-2">Kişi</th>
                <th className="py-2">Telefon</th>
                <th className="py-2">Durum</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((r) => (
                <tr key={r.lead_id} className="border-b border-slate-100">
                  <td className="py-2 font-medium">{r.name}</td>
                  <td className="py-2 text-slate-600">{r.phone || '—'}</td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge(r.status)}`}>
                      {label(r.status)}
                    </span>
                    {r.error ? <span className="ml-2 text-[11px] text-red-600">{r.error}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CrmTemplateSendPreviewModal
        open={previewOpen}
        template={selected}
        params={tplParams}
        channel="whatsapp"
        sending={sending}
        onParams={setTplParams}
        onClose={() => setPreviewOpen(false)}
        onConfirm={() => void send()}
      />
    </div>
  );
}
