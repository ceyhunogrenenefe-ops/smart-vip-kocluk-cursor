import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { crmListMetaTemplates, type CrmMetaTemplate } from '../../lib/crmInboxApi';
import {
  rtBulkTemplateSend,
  rtListBulkCampaigns,
  rtListCoaches,
  rtSegmentLeads,
  type RegCoach
} from '../../lib/registrationTrackingApi';
import { GRADE_LABEL, GRADE_PROGRAMS, STAGE_LABELS } from '../../lib/registrationTrackingConfig';
import { CrmTemplateSendPreviewModal, fillTemplatePreview } from './CrmTemplateModals';
import { BulkCampaignTable } from './CrmDailyReportPage';

type CampaignRow = Awaited<ReturnType<typeof rtListBulkCampaigns>>['data']['items'][number];

function newCampaignId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** CRM Pipeline sütunları + kapanan kayıtlar (backend CRM_BULK_PIPELINE_COLUMNS ile aynı id’ler) */
const PIPELINE_FILTERS = [
  { id: 'incoming', label: "Gelen Lead'ler" },
  { id: 'contact', label: "Görüşülen Lead'ler" },
  { id: 'trial', label: 'Deneme Dersi' },
  { id: 'thinking', label: 'Düşünülüyor' },
  { id: 'payment', label: 'Ödeme Bekleniyor' },
  { id: 'confirmed', label: 'Kesin Kayıt' },
  { id: 'lost', label: 'Kaybedildi' }
];
const PIPELINE_LABEL: Record<string, string> = Object.fromEntries(PIPELINE_FILTERS.map((p) => [p.id, p.label]));

/** Tek istekte gönderilen kişi sayısı (sunucu zaman aşımına düşmesin) */
const SEND_BATCH = 20;

type QueueRow = {
  lead_id: string;
  name: string;
  phone?: string | null;
  grade?: string | null;
  stage?: string;
  column?: string;
  status: 'queued' | 'sending' | 'sent' | 'error';
  error?: string | null;
};

function toggleIn(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function Chip({
  active,
  label,
  count,
  onClick
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
        active
          ? 'border-emerald-600 bg-emerald-600 text-white'
          : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50'
      }`}
    >
      {label}
      {count != null ? (
        <span
          className={`rounded-full px-1.5 text-[10px] tabular-nums ${
            active ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

export default function CrmBulkMessagePage() {
  const [templates, setTemplates] = useState<CrmMetaTemplate[]>([]);
  const [grades, setGrades] = useState<string[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [agentId, setAgentId] = useState('');
  const [coaches, setCoaches] = useState<RegCoach[]>([]);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [facets, setFacets] = useState<{ grades: Record<string, number>; columns: Record<string, number> }>({
    grades: {},
    columns: {}
  });
  const [selected, setSelected] = useState<CrmMetaTemplate | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tplParams, setTplParams] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const requestSeq = useRef(0);

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await rtListBulkCampaigns();
      setCampaigns(res.data?.items || []);
    } catch {
      setCampaigns([]);
    }
  }, []);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    void Promise.all([
      crmListMetaTemplates().catch(() => ({ data: [] as CrmMetaTemplate[] })),
      rtListCoaches().catch(() => ({ data: [] as RegCoach[] }))
    ]).then(([tpl, coachesRes]) => {
      setTemplates(tpl.data || []);
      setCoaches(coachesRes.data || []);
    });
  }, []);

  const loadAudience = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await rtSegmentLeads({
        grades: grades.join(','),
        columns: columns.join(','),
        assigned_user_id: agentId
      });
      if (seq !== requestSeq.current) return;
      const items = res.data?.items || [];
      setFacets(res.data?.facets || { grades: {}, columns: {} });
      setExcluded(new Set());
      setQueue(
        items.map((l) => ({
          lead_id: l.id,
          name: l.full_name || [l.first_name, l.last_name].filter(Boolean).join(' ') || 'Lead',
          phone: l.phone || l.normalized_phone,
          grade: l.grade_program,
          stage: l.stage,
          column: l.pipeline_column,
          status: 'queued'
        }))
      );
    } catch (e) {
      if (seq !== requestSeq.current) return;
      setQueue([]);
      setLoadError(e instanceof Error ? e.message : 'Liste yüklenemedi');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [grades, columns, agentId]);

  useEffect(() => {
    void loadAudience();
  }, [loadAudience]);

  const sendable = useMemo(
    () => queue.filter((r) => r.phone && !excluded.has(r.lead_id)),
    [queue, excluded]
  );
  const noPhoneCount = useMemo(() => queue.filter((r) => !r.phone).length, [queue]);
  const withPhone = queue.length - noPhoneCount;
  const allChecked = withPhone > 0 && sendable.length === withPhone;

  const gradeOptions = useMemo(
    () =>
      GRADE_PROGRAMS.filter((g) => (facets.grades[g.code] || 0) > 0 || grades.includes(g.code)).map((g) => ({
        code: g.code as string,
        label: g.label as string
      })),
    [facets.grades, grades]
  );

  const send = async () => {
    if (!selected || !sendable.length) return;
    const filled = fillTemplatePreview(selected.body || '', tplParams, selected.variableNames || []);
    const ids = sendable.map((r) => r.lead_id);
    const idSet = new Set(ids);
    // Parçalar tek kampanyada toplanır: ulaştı / beklemede analizi ve günlük rapor için
    const campaignId = newCampaignId();
    const campaignFilters = { grades, columns, ...(agentId ? { assigned_user_id: agentId } : {}) };
    setSending(true);
    setPreviewOpen(false);
    setQueue((rows) => rows.map((r) => (idSet.has(r.lead_id) ? { ...r, status: 'sending', error: null } : r)));
    let sent = 0;
    let failed = 0;
    for (let i = 0; i < ids.length; i += SEND_BATCH) {
      const chunk = ids.slice(i, i + SEND_BATCH);
      const chunkSet = new Set(chunk);
      try {
        const res = await rtBulkTemplateSend({
          lead_ids: chunk,
          template_name: selected.name,
          template_language: selected.language,
          template_params: tplParams,
          template_body: filled,
          channel: 'whatsapp',
          campaign_id: campaignId,
          planned_count: ids.length,
          filters: campaignFilters
        });
        const byId = Object.fromEntries((res.data?.results || []).map((r) => [r.lead_id, r]));
        for (const id of chunk) {
          if (byId[id]?.ok) sent += 1;
          else failed += 1;
        }
        setQueue((rows) =>
          rows.map((r) => {
            if (!chunkSet.has(r.lead_id)) return r;
            const hit = byId[r.lead_id];
            return {
              ...r,
              status: hit?.ok ? 'sent' : 'error',
              error: hit ? hit.error || null : 'Sunucudan yanıt gelmedi'
            };
          })
        );
      } catch (e) {
        failed += chunk.length;
        const msg = e instanceof Error ? e.message : 'Hata';
        setQueue((rows) => rows.map((r) => (chunkSet.has(r.lead_id) ? { ...r, status: 'error', error: msg } : r)));
      }
    }
    setSending(false);
    toast.success(`${sent} gönderildi · ${failed} hatalı`);
    void loadCampaigns();
  };

  const badge = (s: QueueRow['status']) => {
    if (s === 'sent') return 'bg-emerald-100 text-emerald-800';
    if (s === 'error') return 'bg-red-100 text-red-800';
    if (s === 'sending') return 'bg-sky-100 text-sky-800';
    return 'bg-slate-100 text-slate-600';
  };
  const label = (s: QueueRow['status']) =>
    s === 'sent' ? 'Gönderildi' : s === 'error' ? 'Hatalı' : s === 'sending' ? 'Gönderiliyor' : 'Kuyrukta';

  const audienceSummary = [
    grades.length ? grades.map((g) => GRADE_LABEL[g] || g).join(', ') : 'Tüm sınıflar',
    columns.length ? columns.map((c) => PIPELINE_LABEL[c] || c).join(', ') : "Açık lead'ler"
  ].join(' · ');

  return (
    <div className="space-y-4 pb-10">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">CRM · WhatsApp / Instagram</p>
        <h2 className="mt-1 font-serif text-2xl font-semibold">Toplu mesaj</h2>
        <p className="mt-1 text-sm text-slate-600">
          Sınıf ve pipeline durumuna göre kitleyi seçin, Meta onaylı şablonu önizleyip gönderin.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold">Hedef kitle</h3>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Sınıf</span>
              {grades.length ? (
                <button type="button" onClick={() => setGrades([])} className="text-[11px] font-semibold text-emerald-700">
                  Temizle
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={!grades.length} label="Tümü" onClick={() => setGrades([])} />
              {gradeOptions.map((g) => (
                <Chip
                  key={g.code}
                  active={grades.includes(g.code)}
                  label={g.label}
                  count={facets.grades[g.code] || 0}
                  onClick={() => setGrades((cur) => toggleIn(cur, g.code))}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Pipeline durumu</span>
              {columns.length ? (
                <button type="button" onClick={() => setColumns([])} className="text-[11px] font-semibold text-emerald-700">
                  Temizle
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={!columns.length} label="Tüm açık lead'ler" onClick={() => setColumns([])} />
              {PIPELINE_FILTERS.map((p) => (
                <Chip
                  key={p.id}
                  active={columns.includes(p.id)}
                  label={p.label}
                  count={facets.columns[p.id] || 0}
                  onClick={() => setColumns((cur) => toggleIn(cur, p.id))}
                />
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              Birden fazla seçebilirsiniz. Kesin kayıt ve kaybedilenler yalnız seçilirse listeye girer.
            </p>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-slate-500">Temsilci</span>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option value="">Tüm temsilciler</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}’ın takip ettikleri
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold">Onaylı şablonlar</h3>
          <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto">
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
          <div>
            <h3 className="text-sm font-semibold">
              Gönderim listesi · {sendable.length} / {queue.length} kişi seçili
            </h3>
            <p className="text-[11px] text-slate-500">
              {audienceSummary}
              {noPhoneCount > 0 ? ` · ${noPhoneCount} kişinin telefonu yok, gönderilmez` : ''}
            </p>
          </div>
          <button
            type="button"
            disabled={!selected || !sendable.length || sending}
            onClick={() => setPreviewOpen(true)}
            title={!selected ? 'Önce şablon seçin' : undefined}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sendable.length} kişiye önizle ve gönder
          </button>
        </div>
        {loading ? (
          <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin text-slate-400" />
        ) : loadError ? (
          <p className="py-6 text-center text-sm text-red-600">{loadError}</p>
        ) : !queue.length ? (
          <p className="py-6 text-center text-sm text-slate-500">Bu filtrelere uyan kişi yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b text-[11px] uppercase text-slate-500">
                  <th className="w-8 py-2">
                    <input
                      type="checkbox"
                      aria-label="Tümünü seç"
                      checked={allChecked}
                      disabled={sending}
                      onChange={() =>
                        setExcluded(allChecked ? new Set(queue.filter((r) => r.phone).map((r) => r.lead_id)) : new Set())
                      }
                    />
                  </th>
                  <th className="py-2">Kişi</th>
                  <th className="py-2">Telefon</th>
                  <th className="py-2">Sınıf</th>
                  <th className="py-2">Aşama</th>
                  <th className="py-2">Durum</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((r) => {
                  const checked = Boolean(r.phone) && !excluded.has(r.lead_id);
                  return (
                    <tr key={r.lead_id} className={`border-b border-slate-100 ${checked ? '' : 'text-slate-400'}`}>
                      <td className="py-2">
                        <input
                          type="checkbox"
                          aria-label={`${r.name} seç`}
                          checked={checked}
                          disabled={!r.phone || sending}
                          onChange={() =>
                            setExcluded((cur) => {
                              const next = new Set(cur);
                              if (next.has(r.lead_id)) next.delete(r.lead_id);
                              else next.add(r.lead_id);
                              return next;
                            })
                          }
                        />
                      </td>
                      <td className="py-2 font-medium">{r.name}</td>
                      <td className="py-2">{r.phone || '—'}</td>
                      <td className="py-2 whitespace-nowrap">{GRADE_LABEL[r.grade || 'unspecified'] || r.grade}</td>
                      <td className="py-2">
                        <span className="whitespace-nowrap">{PIPELINE_LABEL[r.column || ''] || '—'}</span>
                        {r.stage && r.column !== 'confirmed' && r.column !== 'lost' ? (
                          <span className="block text-[11px] text-slate-400">{STAGE_LABELS[r.stage] || r.stage}</span>
                        ) : null}
                      </td>
                      <td className="py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge(r.status)}`}>
                          {label(r.status)}
                        </span>
                        {r.error ? <span className="ml-2 text-[11px] text-red-600">{r.error}</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Gönderim geçmişi</h3>
            <p className="text-[11px] text-slate-500">
              Ulaştı / okundu bilgisi WhatsApp’tan geldikçe güncellenir. Ulaştı bilgisi gelmeyenler beklemede görünür.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadCampaigns()}
            className="text-xs font-semibold text-emerald-700 hover:underline"
          >
            Yenile
          </button>
        </div>
        {campaigns.length ? (
          <BulkCampaignTable rows={campaigns} />
        ) : (
          <p className="text-sm text-slate-500">Henüz kayıtlı toplu gönderim yok.</p>
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
