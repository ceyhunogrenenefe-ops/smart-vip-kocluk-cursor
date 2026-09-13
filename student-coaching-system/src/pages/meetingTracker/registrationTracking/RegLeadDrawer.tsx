import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  crmCreateMetaTemplate,
  crmListMetaTemplates,
  type CrmMetaTemplate
} from '../../../lib/crmInboxApi';
import {
  CrmTemplateCreateModal,
  CrmTemplateSendPreviewModal,
  fillTemplatePreview,
  type PreviewTemplate
} from '../../crm/CrmTemplateModals';
import {
  rtGetLead,
  rtUpdateLead,
  rtAddInteraction,
  rtCreateTask,
  rtCompleteTask,
  rtConfirmLead,
  rtMarkLost,
  rtSendChannelMessage,
  rtDeleteLead,
  type RegCoach,
  type RegLead,
  type RegLeadDetail
} from '../../../lib/registrationTrackingApi';
import {
  GRADE_PROGRAMS,
  GRADE_LABEL,
  STAGE_LABELS,
  TEMPERATURE_LABELS,
  LOST_REASON_LABELS,
  formatIstanbul,
  formatTry,
  CRM_MESSAGE_TEMPLATES
} from '../../../lib/registrationTrackingConfig';

type Props = {
  leadId: string | null;
  isManager: boolean;
  agents?: RegCoach[];
  agentLoad?: Record<string, number>;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted?: (leadId: string) => void;
};

type Tab = 'general' | 'messages' | 'interactions' | 'tasks' | 'meetings' | 'pricing' | 'audit';

export default function RegLeadDrawer({
  leadId,
  isManager,
  agents,
  agentLoad,
  onClose,
  onUpdated,
  onDeleted
}: Props) {
  const [tab, setTab] = useState<Tab>('general');
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<RegLeadDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showLost, setShowLost] = useState(false);

  const load = async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      const { data } = await rtGetLead(leadId);
      setDetail(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [leadId]);

  if (!leadId) return null;

  const lead = detail?.lead;

  const saveGeneral = async (patch: Record<string, unknown>) => {
    if (!leadId) return;
    setSaving(true);
    try {
      await rtUpdateLead(leadId, patch);
      toast.success('Kaydedildi');
      await load();
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'general', label: 'Genel Bilgiler' },
    { id: 'messages', label: 'Mesajlar' },
    { id: 'interactions', label: 'Görüşme Geçmişi' },
    { id: 'tasks', label: 'Görevler' },
    { id: 'meetings', label: 'Toplantılar' },
    { id: 'pricing', label: 'Teklif/Ücret' },
    { id: 'audit', label: 'İşlem Geçmişi' }
  ];

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {lead?.full_name || 'Kayıt adayı'}
          </h2>
          {lead && (
            <p className="text-xs text-slate-500">
              {GRADE_LABEL[lead.grade_program]} · {STAGE_LABELS[lead.stage]}
            </p>
          )}
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-2 py-2 dark:border-slate-700">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium ${
              tab === t.id
                ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        )}

        {!loading && lead && tab === 'general' && (
          <GeneralForm
            lead={lead}
            saving={saving}
            onSave={saveGeneral}
            isManager={isManager}
            agents={agents}
            agentLoad={agentLoad}
          />
        )}

        {!loading && tab === 'messages' && (
          <MessagesTab leadId={leadId!} lead={lead} items={detail?.channel_messages || []} onSent={load} />
        )}

        {!loading && tab === 'interactions' && (
          <InteractionsTab
            items={detail?.interactions || []}
            leadId={leadId}
            onAdded={() => {
              load();
              onUpdated();
            }}
          />
        )}

        {!loading && tab === 'tasks' && (
          <TasksTab
            items={detail?.tasks || []}
            leadId={leadId}
            onChanged={() => {
              load();
              onUpdated();
            }}
          />
        )}

        {!loading && tab === 'meetings' && (
          <div className="space-y-2 text-sm">
            {(detail?.meeting_links || []).length === 0 && (
              <p className="text-slate-500">Henüz toplantı gündemine eklenmedi.</p>
            )}
            {(detail?.meeting_links || []).map((m) => (
              <div key={String(m.id)} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="font-medium">{String(m.discussion_topic || 'Gündem maddesi')}</div>
                {m.decision && <p className="mt-1 text-slate-600">Karar: {String(m.decision)}</p>}
                <p className="text-xs text-slate-500">Durum: {String(m.status)}</p>
              </div>
            ))}
          </div>
        )}

        {!loading && lead && tab === 'pricing' && isManager && (
          <PricingForm lead={lead} saving={saving} onSave={saveGeneral} />
        )}

        {!loading && tab === 'audit' && (
          <div className="space-y-2 text-xs">
            {(detail?.audit_logs || []).map((a) => (
              <div key={String(a.id)} className="rounded border border-slate-200 p-2 dark:border-slate-700">
                <div className="font-medium">{String(a.action)}</div>
                <div className="text-slate-500">{formatIstanbul(String(a.created_at))}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {lead && isManager && (
        <div className="flex flex-wrap gap-2 border-t border-slate-200 p-4 dark:border-slate-700">
          {lead.primary_status === 'tracking' && (
            <>
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Kesin Kayda Dönüştür
              </button>
              <button
                type="button"
                onClick={() => setShowLost(true)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-600"
              >
                Olumsuz Sonuçlandır
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              const name = lead.full_name || `${lead.first_name} ${lead.last_name}`;
              if (!window.confirm(`“${name}” kartı silinsin mi?`)) return;
              void rtDeleteLead(lead.id)
                .then(() => {
                  toast.success('Kart silindi');
                  onDeleted?.(lead.id);
                  onUpdated();
                })
                .catch((e) => toast.error(e instanceof Error ? e.message : 'Silinemedi'));
            }}
            className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
          >
            Kartı sil
          </button>
        </div>
      )}

      {showConfirm && lead && (
        <ConfirmModal
          lead={lead}
          onClose={() => setShowConfirm(false)}
          onDone={() => {
            setShowConfirm(false);
            load();
            onUpdated();
          }}
        />
      )}

      {showLost && lead && (
        <LostModal
          leadId={lead.id}
          onClose={() => setShowLost(false)}
          onDone={() => {
            setShowLost(false);
            onClose();
            onUpdated();
          }}
        />
      )}
    </div>
  );
}

function GeneralForm({
  lead,
  saving,
  onSave,
  isManager,
  agents,
  agentLoad
}: {
  lead: RegLeadDetail['lead'];
  saving: boolean;
  onSave: (p: Record<string, unknown>) => void;
  isManager: boolean;
  agents?: RegCoach[];
  agentLoad?: Record<string, number>;
}) {
  const [form, setForm] = useState({ ...lead });

  useEffect(() => setForm({ ...lead }), [lead.id]);

  return (
    <form
      className="space-y-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-xs text-slate-500">Ad</span>
          <input
            className="mt-0.5 w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
            value={form.first_name}
            onChange={(e) => setForm({ ...form, first_name: e.target.value })}
            disabled={!isManager}
          />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">Soyad</span>
          <input
            className="mt-0.5 w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
            value={form.last_name}
            onChange={(e) => setForm({ ...form, last_name: e.target.value })}
            disabled={!isManager}
          />
        </label>
      </div>
      <label className="block">
        <span className="text-xs text-slate-500">Veli adı soyadı</span>
        <input
          className="mt-0.5 w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
          value={form.parent_full_name || ''}
          onChange={(e) => setForm({ ...form, parent_full_name: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Telefon</span>
        <input
          className="mt-0.5 w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
          value={form.phone || ''}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Sınıf / Program</span>
        <select
          className="mt-0.5 w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
          value={form.grade_program}
          onChange={(e) => setForm({ ...form, grade_program: e.target.value })}
        >
          {GRADE_PROGRAMS.map((g) => (
            <option key={g.code} value={g.code}>
              {g.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Aşama</span>
        <select
          className="mt-0.5 w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
          value={form.stage}
          onChange={(e) => setForm({ ...form, stage: e.target.value })}
        >
          {Object.entries(STAGE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      {isManager && agents && agents.length > 0 && (
        <label className="block">
          <span className="text-xs text-slate-500">Sorumlu ajan</span>
          <select
            className="mt-0.5 w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
            value={form.assigned_user_id || ''}
            onChange={(e) => setForm({ ...form, assigned_user_id: e.target.value || null })}
          >
            <option value="">Atanmamış</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {agentLoad?.[a.id] != null ? ` (${agentLoad[a.id]} takip)` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block">
        <span className="text-xs text-slate-500">Sıcaklık</span>
        <select
          className="mt-0.5 w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
          value={form.temperature}
          onChange={(e) => setForm({ ...form, temperature: e.target.value as RegLeadDetail['lead']['temperature'] })}
        >
          {Object.entries(TEMPERATURE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Notlar</span>
        <textarea
          className="mt-0.5 w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
          rows={3}
          value={form.notes || ''}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </label>
      {isManager && (
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      )}
    </form>
  );
}

function PricingForm({
  lead,
  saving,
  onSave
}: {
  lead: RegLeadDetail['lead'];
  saving: boolean;
  onSave: (p: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    offered_price: lead.offered_price ?? '',
    discount_amount: lead.discount_amount ?? '',
    final_offer_amount: lead.final_offer_amount ?? ''
  });

  return (
    <form
      className="space-y-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          offered_price: form.offered_price === '' ? null : Number(form.offered_price),
          discount_amount: form.discount_amount === '' ? null : Number(form.discount_amount),
          final_offer_amount: form.final_offer_amount === '' ? null : Number(form.final_offer_amount)
        });
      }}
    >
      <label className="block">
        <span className="text-xs text-slate-500">Sunulan ücret</span>
        <input
          type="number"
          className="mt-0.5 w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
          value={form.offered_price}
          onChange={(e) => setForm({ ...form, offered_price: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">İndirim</span>
        <input
          type="number"
          className="mt-0.5 w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
          value={form.discount_amount}
          onChange={(e) => setForm({ ...form, discount_amount: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Nihai teklif</span>
        <input
          type="number"
          className="mt-0.5 w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
          value={form.final_offer_amount}
          onChange={(e) => setForm({ ...form, final_offer_amount: e.target.value })}
        />
      </label>
      <p className="text-xs text-slate-500">
        Mevcut: {formatTry(lead.final_offer_amount ?? lead.offered_price)}
      </p>
      <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-white">
        Kaydet
      </button>
    </form>
  );
}

function defaultTplParams(tpl: PreviewTemplate, lead?: RegLead | null) {
  const names = tpl.variableNames || [];
  const veli = lead?.parent_full_name || lead?.full_name || '';
  const ogr = `${lead?.first_name || ''} ${lead?.last_name || ''}`.trim();
  const sinif = lead?.grade_program ? GRADE_LABEL[lead.grade_program] || lead.grade_program : '';
  return names.map((n) => {
    const k = String(n).toLowerCase();
    if (k.includes('ogrenci')) return ogr;
    if (k.includes('veli') || (k.includes('ad_soyad') && !k.includes('ogrenci'))) return veli;
    if (k.includes('sinif') || k.includes('grade')) return sinif;
    if (k === '1') return veli;
    if (k === '2') return ogr;
    if (k === '3') return sinif;
    return '';
  });
}

function toPreviewTemplate(t: CrmMetaTemplate): PreviewTemplate {
  return {
    id: t.id,
    name: t.name,
    body: t.body,
    language: t.language,
    status: t.status,
    variableCount: t.variableCount,
    variableNames: t.variableNames,
    variableFormat: t.variableFormat,
    mediaHeader: t.mediaHeader,
    kind: 'meta_template'
  };
}

function MessagesTab({
  leadId,
  lead,
  items,
  onSent
}: {
  leadId: string;
  lead?: RegLead | null;
  items: Array<Record<string, unknown>>;
  onSent: () => void;
}) {
  const [channel, setChannel] = useState<'whatsapp' | 'instagram'>('whatsapp');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tplQuery, setTplQuery] = useState('');
  const [metaTemplates, setMetaTemplates] = useState<CrmMetaTemplate[]>([]);
  const [pendingMeta, setPendingMeta] = useState<CrmMetaTemplate[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createBody, setCreateBody] = useState('');
  const [createCategory, setCreateCategory] = useState<'UTILITY' | 'MARKETING'>('UTILITY');
  const [creating, setCreating] = useState(false);
  const [previewTpl, setPreviewTpl] = useState<PreviewTemplate | null>(null);
  const [previewParams, setPreviewParams] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [items.length]);

  useEffect(() => {
    if (lead?.last_inbound_channel === 'instagram') setChannel('instagram');
    else setChannel('whatsapp');
  }, [lead?.last_inbound_channel, leadId]);

  useEffect(() => {
    void crmListMetaTemplates(false)
      .then((res) => {
        setMetaTemplates(res.data || []);
        setPendingMeta(res.pending || []);
      })
      .catch(() => undefined);
  }, []);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      const res = await rtSendChannelMessage({ lead_id: leadId, channel, body });
      setText('');
      if (res.data?.warning) toast.warning(String(res.data.warning));
      else toast.success(channel === 'instagram' ? 'Instagram mesajı işlendi' : 'WhatsApp mesajı gönderildi');
      onSent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gönderilemedi');
    } finally {
      setSending(false);
    }
  };

  const openPreview = (tpl: PreviewTemplate) => {
    setPreviewTpl(tpl);
    setPreviewParams(defaultTplParams(tpl, lead));
    setPickerOpen(false);
  };

  const confirmSendTemplate = async () => {
    if (!previewTpl) return;
    if (previewTpl.variableCount > 0 && previewParams.some((p) => !String(p || '').trim())) {
      toast.error('Şablon değişkenlerini doldurun.');
      return;
    }
    const filled = fillTemplatePreview(previewTpl.body || '', previewParams, previewTpl.variableNames || []);
    setSending(true);
    try {
      const isMeta = previewTpl.kind !== 'local';
      const res = await rtSendChannelMessage(
        isMeta
          ? {
              lead_id: leadId,
              channel,
              body: filled,
              template_name: previewTpl.name,
              template_language: previewTpl.language || 'tr',
              template_params: previewParams,
              template_param_names:
                previewTpl.variableFormat === 'named' ? previewTpl.variableNames : undefined,
              template_body: previewTpl.body
            }
          : { lead_id: leadId, channel, body: filled }
      );
      if (res.data?.warning) toast.warning(String(res.data.warning));
      else toast.success('Şablon onaylandı ve gönderildi');
      setPreviewTpl(null);
      setPreviewParams([]);
      onSent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gönderilemedi');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full min-h-[360px] flex-col gap-3">
      <div className="flex-1 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
        {!items.length && (
          <p className="py-8 text-center text-sm text-slate-500">
            Henüz WhatsApp / Instagram / website formu mesajı yok. Gelen kayıtlar burada listelenir.
          </p>
        )}
        {items.map((m) => {
          const inbound = String(m.direction || '') === 'inbound';
          const ch = String(m.channel || '');
          const channelLabel =
            String(m.message_type || '') === 'website_form' || ch === 'website'
              ? 'Website formu'
              : ch === 'instagram'
                ? 'Instagram'
                : ch === 'whatsapp'
                  ? 'WhatsApp'
                  : ch;
          return (
            <div
              key={String(m.id)}
              className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${
                inbound
                  ? 'mr-auto rounded-bl-md bg-white text-slate-800 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                  : 'ml-auto rounded-br-md bg-emerald-600 text-white'
              }`}
            >
              <div
                className={`mb-0.5 flex items-center gap-1 text-[10px] ${
                  inbound ? 'text-slate-500' : 'text-emerald-100'
                }`}
              >
                <span className="font-medium">{channelLabel}</span>
                <span>·</span>
                <span>{inbound ? 'Gelen' : 'Giden'}</span>
                <span className="ml-auto">{formatIstanbul(String(m.occurred_at || m.created_at || ''))}</span>
              </div>
              <p className="whitespace-pre-wrap leading-snug">
                {String(m.body || `[${m.message_type || 'mesaj'}]`)}
              </p>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            <FileText className="h-3.5 w-3.5" />
            Şablonlar
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            <Plus className="h-3.5 w-3.5" />
            Şablon ekle
          </button>
        </div>
        {pickerOpen ? (
          <div className="rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-600 dark:bg-slate-800">
            <input
              value={tplQuery}
              onChange={(e) => setTplQuery(e.target.value)}
              placeholder="Şablon ara…"
              className="mb-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900"
            />
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Hazır metinler</p>
            <div className="mb-2 flex flex-col gap-1">
              {CRM_MESSAGE_TEMPLATES.filter((t) => {
                const q = tplQuery.toLocaleLowerCase('tr');
                if (!q) return true;
                return `${t.label} ${t.body}`.toLocaleLowerCase('tr').includes(q);
              }).map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() =>
                    openPreview({
                      id: `local:${tpl.id}`,
                      name: tpl.label,
                      body: tpl.body,
                      variableCount: 0,
                      kind: 'local'
                    })
                  }
                  className="rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <span className="block text-[11px] font-semibold text-slate-800 dark:text-slate-100">{tpl.label}</span>
                  <span className="line-clamp-2 text-[10px] text-slate-500">{tpl.body}</span>
                </button>
              ))}
            </div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Meta onaylı</p>
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
              {metaTemplates.filter((t) => {
                const q = tplQuery.toLocaleLowerCase('tr');
                if (!q) return true;
                return `${t.name} ${t.body}`.toLocaleLowerCase('tr').includes(q);
              }).length ? (
                metaTemplates
                  .filter((t) => {
                    const q = tplQuery.toLocaleLowerCase('tr');
                    if (!q) return true;
                    return `${t.name} ${t.body}`.toLocaleLowerCase('tr').includes(q);
                  })
                  .map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => openPreview(toPreviewTemplate(t))}
                      className="rounded-lg px-2 py-1.5 text-left hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                    >
                      <span className="flex items-center justify-between gap-1">
                        <span className="truncate text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                          {t.name}
                        </span>
                        <span className="shrink-0 rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-bold uppercase text-emerald-800">
                          {t.status || 'onaylı'}
                        </span>
                      </span>
                      {t.body ? <span className="line-clamp-2 text-[10px] text-slate-500">{t.body}</span> : null}
                    </button>
                  ))
              ) : (
                <p className="px-2 py-1 text-[11px] text-slate-400">Onaylı Meta şablonu yok.</p>
              )}
            </div>
            {pendingMeta.length ? (
              <p className="mt-2 text-[10px] text-amber-700">
                Onay bekleyen: {pendingMeta.map((t) => t.name).join(', ')}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setChannel('whatsapp')}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
              channel === 'whatsapp'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800'
            }`}
          >
            WhatsApp
          </button>
          <button
            type="button"
            onClick={() => setChannel('instagram')}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
              channel === 'instagram'
                ? 'bg-pink-600 text-white'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800'
            }`}
          >
            Instagram
          </button>
          {channel === 'instagram' && !lead?.instagram_scoped_id && (
            <span className="self-center text-[10px] text-amber-600">IG id yok — önce gelen DM gerekir</span>
          )}
          {channel === 'whatsapp' && !(lead?.phone || lead?.normalized_phone) && (
            <span className="self-center text-[10px] text-amber-600">Telefon yok</span>
          )}
        </div>
        <div className="flex gap-2">
          <textarea
            className="min-h-[72px] flex-1 resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            placeholder={`${channel === 'instagram' ? 'Instagram' : 'WhatsApp'} yanıtı yazın…`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            type="button"
            disabled={sending || !text.trim()}
            onClick={() => void send()}
            className="self-end rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {sending ? '…' : 'Gönder'}
          </button>
        </div>
        <p className="text-[10px] text-slate-400">
          Serbest metin: Ctrl/Cmd + Enter. Şablon: seç → önizle → Onayla ve gönder.
        </p>
      </div>

      <CrmTemplateCreateModal
        open={showCreate}
        creating={creating}
        name={createName}
        body={createBody}
        category={createCategory}
        onName={setCreateName}
        onBody={setCreateBody}
        onCategory={setCreateCategory}
        onClose={() => setShowCreate(false)}
        onSubmit={() => {
          if (!createName.trim() || !createBody.trim()) {
            toast.error('Şablon adı ve metin gerekli.');
            return;
          }
          setCreating(true);
          void crmCreateMetaTemplate({
            name: createName.trim(),
            body: createBody.trim(),
            category: createCategory,
            language: 'tr'
          })
            .then((res) => {
              toast.success(res.message || `Onaya gönderildi: ${res.data?.status || 'PENDING'}`);
              setCreateName('');
              setCreateBody('');
              setShowCreate(false);
              return crmListMetaTemplates(true);
            })
            .then((res) => {
              if (!res) return;
              setMetaTemplates(res.data || []);
              setPendingMeta(res.pending || []);
            })
            .catch((e) => toast.error(e instanceof Error ? e.message : 'Şablon onaya gönderilemedi'))
            .finally(() => setCreating(false));
        }}
      />

      <CrmTemplateSendPreviewModal
        open={Boolean(previewTpl)}
        template={previewTpl}
        params={previewParams}
        channel={channel}
        sending={sending}
        onParams={setPreviewParams}
        onClose={() => {
          setPreviewTpl(null);
          setPreviewParams([]);
        }}
        onConfirm={() => void confirmSendTemplate()}
      />
    </div>
  );
}


function InteractionsTab({
  items,
  leadId,
  onAdded
}: {
  items: Array<Record<string, unknown>>;
  leadId: string;
  onAdded: () => void;
}) {
  const [note, setNote] = useState('');

  const add = async () => {
    if (!note.trim()) return;
    try {
      await rtAddInteraction({
        lead_id: leadId,
        interaction_type: 'system_note',
        title: 'Not',
        description: note
      });
      setNote('');
      toast.success('Eklendi');
      onAdded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Eklenemedi');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          className="flex-1 rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          placeholder="Görüşme notu ekle…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button type="button" onClick={add} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white">
          Ekle
        </button>
      </div>
      <div className="space-y-2">
        {items.map((it) => (
          <div key={String(it.id)} className="rounded-lg border-l-4 border-indigo-400 bg-slate-50 p-3 text-sm dark:bg-slate-800">
            <div className="font-medium">{String(it.title || it.interaction_type)}</div>
            <div className="text-xs text-slate-500">{formatIstanbul(String(it.interaction_at))}</div>
            {it.description && <p className="mt-1 text-slate-700 dark:text-slate-300">{String(it.description)}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function TasksTab({
  items,
  leadId,
  onChanged
}: {
  items: Array<Record<string, unknown>>;
  leadId: string;
  onChanged: () => void;
}) {
  const complete = async (taskId: string) => {
    const result = window.prompt('Görüşme sonucu:');
    if (result === null) return;
    try {
      await rtCompleteTask({ task_id: taskId, result });
      toast.success('Görev tamamlandı');
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Tamamlanamadı');
    }
  };

  const create = async () => {
    const title = window.prompt('Görev başlığı:');
    if (!title) return;
    const due = window.prompt('Son tarih (YYYY-MM-DD):');
    try {
      await rtCreateTask({
        lead_id: leadId,
        title,
        task_type: 'call_parent',
        due_at: due ? `${due}T10:00:00+03:00` : null
      });
      toast.success('Görev oluşturuldu');
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Oluşturulamadı');
    }
  };

  return (
    <div className="space-y-3">
      <button type="button" onClick={create} className="rounded-lg border px-3 py-1.5 text-sm">
        + Sonraki işlem ekle
      </button>
      {items.map((t) => {
        const overdue =
          t.status !== 'completed' && t.due_at && new Date(String(t.due_at)).getTime() < Date.now();
        return (
          <div
            key={String(t.id)}
            className={`rounded-lg border p-3 text-sm ${overdue ? 'border-red-400 bg-red-50 dark:bg-red-950/30' : 'border-slate-200 dark:border-slate-700'}`}
          >
            <div className="font-medium">{String(t.title)}</div>
            <div className="text-xs text-slate-500">{formatIstanbul(String(t.due_at))}</div>
            {t.status !== 'completed' && (
              <button
                type="button"
                onClick={() => complete(String(t.id))}
                className="mt-2 text-xs text-indigo-600 hover:underline"
              >
                Tamamla
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ConfirmModal({
  lead,
  onClose,
  onDone
}: {
  lead: RegLeadDetail['lead'];
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    grade_program: lead.grade_program,
    academic_period_key: lead.academic_period_key || '',
    confirmed_at: new Date().toISOString().slice(0, 10),
    total_amount: lead.offered_price ?? '',
    discount_amount: lead.discount_amount ?? '',
    final_amount: lead.final_offer_amount ?? '',
    down_payment: '',
    create_student: true,
    notes: ''
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await rtConfirmLead({
        lead_id: lead.id,
        grade_program: form.grade_program,
        academic_period_key: form.academic_period_key || null,
        confirmed_at: `${form.confirmed_at}T12:00:00+03:00`,
        total_amount: form.total_amount === '' ? null : Number(form.total_amount),
        discount_amount: form.discount_amount === '' ? null : Number(form.discount_amount),
        final_amount: form.final_amount === '' ? null : Number(form.final_amount),
        down_payment: form.down_payment === '' ? null : Number(form.down_payment),
        create_student: form.create_student,
        student_first_name: lead.first_name,
        student_last_name: lead.last_name,
        notes: form.notes
      });
      toast.success('Kesin kayıt tamamlandı');
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 dark:bg-slate-900">
        <h3 className="text-lg font-semibold">Kesin Kayda Dönüştür</h3>
        <p className="mt-1 text-sm text-slate-500">{lead.full_name}</p>
        <div className="mt-4 space-y-2 text-sm">
          <select
            className="w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
            value={form.grade_program}
            onChange={(e) => setForm({ ...form, grade_program: e.target.value })}
          >
            {GRADE_PROGRAMS.map((g) => (
              <option key={g.code} value={g.code}>
                {g.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
            value={form.confirmed_at}
            onChange={(e) => setForm({ ...form, confirmed_at: e.target.value })}
          />
          <input
            type="number"
            placeholder="Toplam bedel"
            className="w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
            value={form.total_amount}
            onChange={(e) => setForm({ ...form, total_amount: e.target.value })}
          />
          <input
            type="number"
            placeholder="İndirim"
            className="w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
            value={form.discount_amount}
            onChange={(e) => setForm({ ...form, discount_amount: e.target.value })}
          />
          <input
            type="number"
            placeholder="Nihai bedel"
            className="w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
            value={form.final_amount}
            onChange={(e) => setForm({ ...form, final_amount: e.target.value })}
          />
          <input
            type="number"
            placeholder="Peşinat"
            className="w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
            value={form.down_payment}
            onChange={(e) => setForm({ ...form, down_payment: e.target.value })}
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.create_student}
              onChange={(e) => setForm({ ...form, create_student: e.target.checked })}
            />
            Yeni öğrenci hesabı oluştur
          </label>
          <textarea
            placeholder="Açıklama"
            className="w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">
            İptal
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Onayla
          </button>
        </div>
      </div>
    </div>
  );
}

function LostModal({
  leadId,
  onClose,
  onDone
}: {
  leadId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('price_high');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (reason === 'other' && !desc.trim()) {
      toast.error('Diğer nedeni için açıklama zorunlu');
      return;
    }
    setBusy(true);
    try {
      await rtMarkLost({ lead_id: leadId, lost_reason: reason, lost_description: desc || null });
      toast.success('Olumsuz olarak işaretlendi');
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 dark:bg-slate-900">
        <h3 className="text-lg font-semibold">Olumsuz Sonuçlandır</h3>
        <select
          className="mt-3 w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          {Object.entries(LOST_REASON_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <textarea
          className="mt-2 w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          placeholder="Açıklama (Diğer seçilirse zorunlu)"
          rows={3}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">
            İptal
          </button>
          <button type="button" disabled={busy} onClick={submit} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white">
            Onayla
          </button>
        </div>
      </div>
    </div>
  );
}
