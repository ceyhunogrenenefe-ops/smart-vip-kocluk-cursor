import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BellRing,
  CalendarDays,
  Check,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  MessageSquareHeart,
  Save,
  Star,
  Trash2,
  Users
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/session';
import { crmInstitutionScope } from '../../lib/crmInboxApi';
import { buildEventPreviewVars, renderTemplatePreview } from '../../lib/eventMessagePreview';
import DenemeExamNotifyPanel from './DenemeExamNotifyPanel';

/* ---------- tipler ---------- */

type FieldCfg = { enabled: boolean; required: boolean };
type FormSettings = {
  heading: string;
  intro: string;
  button_label: string;
  success_message: string;
  fields: { parent_name: FieldCfg; student_name: FieldCfg; phone: FieldCfg; grade: FieldCfg };
  kvkk_text: string;
  kvkk_url: string;
  contact_consent: boolean;
  send_confirmation: boolean;
  add_to_crm: boolean;
  closed: boolean;
  closed_message: string;
};

type ReminderRow = {
  id?: string;
  kind: 'before' | 'day_of' | 'after';
  offset_minutes: number | null;
  at_time: string | null;
  template_type: string;
  enabled: boolean;
  label?: string;
  fire_at?: string | null;
  state?: 'disabled' | 'invalid' | 'waiting' | 'done';
  stats?: { sent: number; failed: number; skipped: number };
};

type Participant = {
  id: string;
  display_name: string;
  parent_name: string | null;
  student_name: string | null;
  grade: string | null;
  phone: string;
  whatsapp_status: string;
  whatsapp_error: string | null;
  kvkk_accepted_at: string | null;
  lead_id: string | null;
  created_at: string;
  form_meta?: { contact_consent?: boolean | null } | null;
  reminder_sends: { reminder_id: string; status: string; error: string | null }[];
};

type SurveyResponse = {
  participant_id: string;
  rating: number;
  expectation: 'evet' | 'kismen' | 'hayir' | null;
  want_info: boolean | null;
  topics: string | null;
  comment: string | null;
  created_at: string;
  parent_name: string | null;
  student_name: string | null;
  phone: string | null;
};
type SurveySummary = {
  count: number;
  average: number | null;
  distribution: Record<string, number>;
  expectation: { evet: number; kismen: number; hayir: number };
  want_info: number;
};
type SurveyTemplateState = 'missing' | 'draft' | 'pending' | 'approved' | 'rejected';

type EventListRow = {
  id: string;
  title: string;
  event_date: string | null;
  event_time: string | null;
  form_enabled: boolean;
  form_slug: string | null;
  has_link: boolean;
  participant_count: number;
  form_signup_count: number;
  reminder_count: number;
};

type EventDetail = {
  id: string;
  title: string;
  description: string | null;
  event_date: string | null;
  event_time: string | null;
  location: string | null;
  meeting_link: string | null;
  template_type: string;
  form_enabled: boolean;
  form_slug: string | null;
  form_settings: FormSettings;
  reminders: ReminderRow[];
  participants: Participant[];
  survey?: { summary: SurveySummary; responses: SurveyResponse[] };
};

type Template = { type: string; name: string; content: string };

type Draft = {
  id?: string;
  title: string;
  description: string;
  event_date: string;
  event_time: string;
  location: string;
  meeting_link: string;
  template_type: string;
  form_enabled: boolean;
  form_slug: string;
  form_settings: FormSettings;
  reminders: ReminderRow[];
};

/* ---------- yardımcılar ---------- */

const DEFAULT_TEMPLATE = 'institution_event_invite';
const SURVEY_TEMPLATE = 'institution_event_survey';
const EXPECTATION_LABEL: Record<string, string> = { evet: 'Evet', kismen: 'Kısmen', hayir: 'Hayır' };

const DEFAULT_SETTINGS: FormSettings = {
  heading: '',
  intro: '',
  button_label: 'Kaydımı Oluştur',
  success_message: 'Kaydınız alındı! Etkinlik bilgileri ve katılım linki WhatsApp üzerinden gönderilecektir.',
  fields: {
    parent_name: { enabled: true, required: true },
    student_name: { enabled: true, required: true },
    phone: { enabled: true, required: true },
    grade: { enabled: false, required: false }
  },
  kvkk_text: '',
  kvkk_url: '',
  contact_consent: true,
  send_confirmation: true,
  add_to_crm: true,
  closed: false,
  closed_message: 'Bu etkinliğin kayıtları kapanmıştır.'
};

const DEFAULT_REMINDERS: ReminderRow[] = [
  { kind: 'before', offset_minutes: 1440, at_time: null, template_type: DEFAULT_TEMPLATE, enabled: true },
  { kind: 'day_of', offset_minutes: null, at_time: '10:00', template_type: DEFAULT_TEMPLATE, enabled: true },
  { kind: 'before', offset_minutes: 10, at_time: null, template_type: DEFAULT_TEMPLATE, enabled: true },
  { kind: 'after', offset_minutes: 120, at_time: null, template_type: SURVEY_TEMPLATE, enabled: true }
];

function emptyDraft(): Draft {
  return {
    title: '',
    description: '',
    event_date: '',
    event_time: '',
    location: '',
    meeting_link: '',
    template_type: DEFAULT_TEMPLATE,
    form_enabled: true,
    form_slug: '',
    form_settings: structuredClone(DEFAULT_SETTINGS),
    reminders: DEFAULT_REMINDERS.map((r) => ({ ...r }))
  };
}

function draftFromDetail(d: EventDetail): Draft {
  return {
    id: d.id,
    title: d.title || '',
    description: d.description || '',
    event_date: d.event_date ? String(d.event_date).slice(0, 10) : '',
    event_time: d.event_time ? String(d.event_time).slice(0, 5) : '',
    location: d.location || '',
    meeting_link: d.meeting_link || '',
    template_type: d.template_type || DEFAULT_TEMPLATE,
    form_enabled: d.form_enabled,
    form_slug: d.form_slug || '',
    form_settings: { ...structuredClone(DEFAULT_SETTINGS), ...d.form_settings },
    reminders: d.reminders.map((r) => ({ ...r, at_time: r.at_time ? String(r.at_time).slice(0, 5) : null }))
  };
}

function scopedUrl(path: string): string {
  const scope = crmInstitutionScope();
  if (!scope) return path;
  return `${path}${path.includes('?') ? '&' : '?'}institution_id=${encodeURIComponent(scope)}`;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(scopedUrl(path), init);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.hint || j?.message || j?.error || 'İstek başarısız');
  return j as T;
}

function formatTrDate(iso?: string | null) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return d && m && y ? `${d}.${m}.${y}` : String(iso);
}

function formatDateTime(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul'
  });
}

/** Dakika → (değer, birim) */
function splitOffset(min: number | null): { value: number; unit: 'minute' | 'hour' | 'day' } {
  const m = Number(min || 0);
  if (m && m % 1440 === 0) return { value: m / 1440, unit: 'day' };
  if (m && m % 60 === 0) return { value: m / 60, unit: 'hour' };
  return { value: m, unit: 'minute' };
}
const UNIT_MIN = { minute: 1, hour: 60, day: 1440 } as const;

function publicFormUrl(slug: string) {
  return `${window.location.origin}/f/${slug}`;
}

function slugPreview(raw: string) {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', İ: 'i', I: 'i', Ö: 'o', Ş: 's', Ü: 'u' };
  return raw
    .replace(/[çğıöşüÇĞİIÖŞÜ]/g, (c) => map[c] || c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  sent: { text: 'Gönderildi', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  failed: { text: 'Hata', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
  pending: { text: 'Bekliyor', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  skipped: { text: 'Atlandı', cls: 'bg-slate-50 text-slate-500 ring-slate-200' },
  sending: { text: 'Gönderiliyor', cls: 'bg-sky-50 text-sky-700 ring-sky-200' }
};

function StatusPill({ status, title }: { status: string; title?: string | null }) {
  const s = STATUS_LABEL[status] || STATUS_LABEL.pending;
  return (
    <span title={title || undefined} className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${s.cls}`}>
      {s.text}
    </span>
  );
}

const inputCls =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20';
const labelCls = 'text-xs font-semibold uppercase tracking-wide text-slate-500';

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
      />
      <span className="text-sm text-slate-800">
        {label}
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

function Section({ title, icon, children, right }: { title: string; icon?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          {icon}
          {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

/* ---------- sayfa ---------- */

export default function CrmEventFormsPage() {
  const [list, setList] = useState<EventListRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [schemaHint, setSchemaHint] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [surveyTpl, setSurveyTpl] = useState<{ state: SurveyTemplateState; content: string | null; rejected_reason?: string | null } | null>(null);
  const [surveyTplBusy, setSurveyTplBusy] = useState(false);

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const j = await api<{ data: EventListRow[] }>('/api/event-forms');
      setList(j.data || []);
      setSchemaHint(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/sql|schema/i.test(msg)) setSchemaHint(msg);
      else toast.error(msg);
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const j = await api<{ data: EventDetail }>(`/api/event-forms?id=${encodeURIComponent(id)}`);
      setDetail(j.data);
      setDraft(draftFromDetail(j.data));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
    api<{ data: Template[] }>('/api/event-forms?op=templates')
      .then((j) => setTemplates(j.data || []))
      .catch(() => undefined);
    api<{ state: SurveyTemplateState; content: string | null; rejected_reason?: string | null }>('/api/event-forms?op=survey-template')
      .then(setSurveyTpl)
      .catch(() => undefined);
  }, [loadList]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const startNew = () => {
    setSelectedId(null);
    setDetail(null);
    setDraft(emptyDraft());
  };

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const patchSettings = (p: Partial<FormSettings>) =>
    setDraft((d) => (d ? { ...d, form_settings: { ...d.form_settings, ...p } } : d));
  const patchField = (key: 'student_name' | 'grade', p: Partial<FieldCfg>) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            form_settings: {
              ...d.form_settings,
              fields: { ...d.form_settings.fields, [key]: { ...d.form_settings.fields[key], ...p } }
            }
          }
        : d
    );
  const patchReminder = (i: number, p: Partial<ReminderRow>) =>
    setDraft((d) => (d ? { ...d, reminders: d.reminders.map((r, j) => (j === i ? { ...r, ...p } : r)) } : d));

  const save = async () => {
    if (!draft) return;
    if (!draft.title.trim()) return toast.error('Etkinlik adı girin.');
    if (draft.form_enabled && (!draft.event_date || !draft.event_time)) {
      return toast.error('Form ve hatırlatmalar için tarih ve saat gerekli.');
    }
    setSaving(true);
    try {
      const j = await api<{ data: EventDetail }>('/api/event-forms?op=save', {
        method: 'POST',
        body: JSON.stringify({
          id: draft.id,
          title: draft.title,
          description: draft.description,
          event_date: draft.event_date || null,
          event_time: draft.event_time || null,
          location: draft.location,
          meeting_link: draft.meeting_link,
          template_type: draft.template_type,
          form_enabled: draft.form_enabled,
          form_slug: draft.form_slug,
          form_settings: draft.form_settings,
          reminders: draft.reminders.map((r) => ({
            id: r.id,
            kind: r.kind,
            offset_minutes: r.kind === 'before' ? r.offset_minutes : null,
            at_time: r.kind === 'day_of' ? r.at_time : null,
            template_type: r.template_type || DEFAULT_TEMPLATE,
            enabled: r.enabled
          }))
        })
      });
      setDetail(j.data);
      setDraft(draftFromDetail(j.data));
      setSelectedId(j.data.id);
      toast.success('Kaydedildi');
      void loadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const submitSurveyTemplate = async () => {
    setSurveyTplBusy(true);
    try {
      const j = await api<{ state: SurveyTemplateState; content: string | null }>('/api/event-forms?op=survey-template-submit', {
        method: 'POST',
        body: '{}'
      });
      setSurveyTpl(j);
      toast.success(j.state === 'approved' ? 'Anket şablonu onaylı' : 'Anket şablonu Meta onayına gönderildi');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSurveyTplBusy(false);
    }
  };

  const exportSurveyCsv = () => {
    if (!detail?.survey) return;
    const rows = [
      ['Veli', 'Öğrenci', 'Telefon', 'Puan', 'Beklenti', 'Bilgi almak istiyor', 'İstenen konular', 'Yorum', 'Tarih'],
      ...detail.survey.responses.map((r) => [
        r.parent_name || '',
        r.student_name || '',
        r.phone || '',
        r.rating,
        r.expectation ? EXPECTATION_LABEL[r.expectation] : '',
        r.want_info === true ? 'Evet' : r.want_info === false ? 'Hayır' : '',
        r.topics || '',
        r.comment || '',
        formatDateTime(r.created_at)
      ])
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${detail.form_slug || 'etkinlik'}-anket.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const deleteParticipant = async (p: Participant) => {
    if (!detail) return;
    if (!window.confirm(`${p.parent_name || p.display_name} kaydı silinsin mi?`)) return;
    try {
      await api(`/api/event-forms?op=delete-participant&id=${detail.id}&participant_id=${p.id}`, { method: 'POST', body: '{}' });
      toast.success('Silindi');
      void loadDetail(detail.id);
      void loadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const exportCsv = () => {
    if (!detail) return;
    const rows = [
      ['Veli', 'Öğrenci', 'Telefon', 'Sınıf', 'Kayıt zamanı', 'Onay mesajı', 'İletişim izni'],
      ...detail.participants.map((p) => [
        p.parent_name || p.display_name,
        p.student_name || '',
        p.phone,
        p.grade || '',
        formatDateTime(p.created_at),
        STATUS_LABEL[p.whatsapp_status]?.text || p.whatsapp_status,
        p.form_meta?.contact_consent ? 'Evet' : 'Hayır'
      ])
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${detail.form_slug || 'etkinlik'}-katilimcilar.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const formUrl = detail?.form_enabled && detail.form_slug ? publicFormUrl(detail.form_slug) : null;
  const copyLink = async () => {
    if (!formUrl) return;
    try {
      await navigator.clipboard.writeText(formUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Kopyalanamadı');
    }
  };

  const templateByType = useMemo(() => new Map(templates.map((t) => [t.type, t])), [templates]);
  const previewText = useMemo(() => {
    if (!draft) return '';
    const tpl = templateByType.get(draft.template_type);
    if (!tpl) return '';
    return renderTemplatePreview(
      tpl.content,
      buildEventPreviewVars(
        {
          title: draft.title || 'Etkinlik',
          event_date: draft.event_date,
          event_time: draft.event_time,
          meeting_link: draft.meeting_link,
          location: draft.location,
          description: draft.description
        } as Parameters<typeof buildEventPreviewVars>[0],
        'Ayşe Yılmaz'
      )
    );
  }, [draft, templateByType]);
  const templateNeedsLink = useMemo(() => {
    const tpl = draft ? templateByType.get(draft.template_type) : null;
    return Boolean(tpl && /\{\{\s*(link|baglanti|meeting_link)\s*\}\}/i.test(tpl.content));
  }, [draft, templateByType]);

  const reminderStatsByParticipant = (p: Participant) => {
    if (!detail) return null;
    return detail.reminders.map((r) => {
      const s = p.reminder_sends.find((x) => x.reminder_id === r.id);
      return { id: r.id!, label: r.label || '', status: s?.status || (r.state === 'waiting' ? 'pending' : 'skipped'), error: s?.error };
    });
  };

  return (
    <div className="space-y-4">
      <DenemeExamNotifyPanel />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      {/* Sol: etkinlik listesi */}
      <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-110px)] lg:overflow-y-auto">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-slate-900">Etkinlik Formları</h2>
          <button type="button" onClick={() => void loadList()} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Yenile">
            <RefreshCw className={`h-4 w-4 ${listLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <button
          type="button"
          onClick={startNew}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" />
          Yeni etkinlik formu
        </button>
        {schemaHint && (
          <p className="mb-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Veritabanı kurulumu eksik: {schemaHint}</p>
        )}
        {listLoading && !list.length ? (
          <div className="flex justify-center py-8 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !list.length ? (
          <p className="px-1 py-6 text-center text-sm text-slate-500">Henüz etkinlik yok.</p>
        ) : (
          <ul className="space-y-1.5">
            {list.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(e.id)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                    selectedId === e.id ? 'border-emerald-500 bg-emerald-50' : 'border-transparent hover:bg-slate-50'
                  }`}
                >
                  <p className="truncate text-sm font-semibold text-slate-900">{e.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                    <span>
                      {formatTrDate(e.event_date)} {e.event_time ? String(e.event_time).slice(0, 5) : ''}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {e.participant_count}
                    </span>
                    {e.form_enabled ? (
                      <span className="rounded bg-emerald-100 px-1.5 text-[10px] font-semibold text-emerald-700">FORM</span>
                    ) : null}
                    {e.reminder_count ? (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-sky-700">
                        <BellRing className="h-3 w-3" />
                        {e.reminder_count}
                      </span>
                    ) : null}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {/* Sağ: düzenleyici */}
      <div className="min-w-0 space-y-4">
        {!draft ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center">
            {detailLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            ) : (
              <>
                <CalendarDays className="h-10 w-10 text-emerald-500" />
                <p className="mt-3 font-semibold text-slate-800">Etkinlik için kayıt formu oluşturun</p>
                <p className="mt-1 max-w-md text-sm text-slate-500">
                  Linki Instagram ve WhatsApp'ta paylaşın. Gelen kayıtlar buraya ve Kayıt Takibi'ne düşer, hatırlatmalar
                  otomatik gider.
                </p>
                <button
                  type="button"
                  onClick={startNew}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  <Plus className="h-4 w-4" />
                  Yeni etkinlik formu
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Üst bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-slate-900">{draft.title || 'Yeni etkinlik'}</p>
                {formUrl ? (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                    <code className="truncate rounded bg-slate-100 px-2 py-0.5 text-emerald-700">{formUrl}</code>
                    <button type="button" onClick={() => void copyLink()} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? 'Kopyalandı' : 'Kopyala'}
                    </button>
                    <a href={formUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Aç
                    </a>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">Kaydettiğinizde paylaşılabilir form linki oluşur.</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Kaydet
              </button>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {/* Etkinlik bilgileri */}
              <Section title="Etkinlik bilgileri" icon={<CalendarDays className="h-4 w-4 text-emerald-600" />}>
                <div className="space-y-3">
                  <label className="block">
                    <span className={labelCls}>Etkinlik adı *</span>
                    <input className={inputCls} value={draft.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Örn. Paragraf Etkinliği" />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className={labelCls}>Tarih *</span>
                      <input type="date" className={inputCls} value={draft.event_date} onChange={(e) => patch({ event_date: e.target.value })} />
                    </label>
                    <label className="block">
                      <span className={labelCls}>Saat *</span>
                      <input type="time" className={inputCls} value={draft.event_time} onChange={(e) => patch({ event_time: e.target.value })} />
                    </label>
                  </div>
                  <label className="block">
                    <span className={labelCls}>Katılım linki (Zoom / Meet)</span>
                    <input className={inputCls} value={draft.meeting_link} onChange={(e) => patch({ meeting_link: e.target.value })} placeholder="https://…" />
                    {templateNeedsLink && !draft.meeting_link.trim() && (
                      <span className="mt-1 block text-xs text-amber-700">
                        Seçili mesaj şablonu link içeriyor — link girilmeden onay ve hatırlatma mesajları gönderilmez.
                      </span>
                    )}
                  </label>
                  <label className="block">
                    <span className={labelCls}>Yer (isteğe bağlı)</span>
                    <input className={inputCls} value={draft.location} onChange={(e) => patch({ location: e.target.value })} placeholder="Online" />
                  </label>
                  <label className="block">
                    <span className={labelCls}>Açıklama</span>
                    <textarea rows={3} className={inputCls} value={draft.description} onChange={(e) => patch({ description: e.target.value })} />
                  </label>
                </div>
              </Section>

              {/* Form ayarları */}
              <Section
                title="Kayıt formu"
                right={
                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                    <input
                      type="checkbox"
                      checked={draft.form_enabled}
                      onChange={(e) => patch({ form_enabled: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                    />
                    Yayında
                  </label>
                }
              >
                <div className="space-y-3">
                  <label className="block">
                    <span className={labelCls}>Link adı</span>
                    <div className="mt-1 flex items-center rounded-lg border border-slate-300 bg-slate-50 text-sm focus-within:border-emerald-500">
                      <span className="pl-3 text-slate-400">/f/</span>
                      <input
                        className="w-full rounded-r-lg bg-transparent px-1 py-2 outline-none"
                        value={draft.form_slug}
                        onChange={(e) => patch({ form_slug: slugPreview(e.target.value) })}
                        placeholder={slugPreview(draft.title) || 'paragraf-etkinligi'}
                      />
                    </div>
                    <span className="mt-1 block text-xs text-slate-500">Boş bırakırsanız etkinlik adından oluşturulur.</span>
                  </label>
                  <label className="block">
                    <span className={labelCls}>Form başlığı</span>
                    <input
                      className={inputCls}
                      value={draft.form_settings.heading}
                      onChange={(e) => patchSettings({ heading: e.target.value })}
                      placeholder={draft.title || 'Etkinlik adı kullanılır'}
                    />
                  </label>
                  <label className="block">
                    <span className={labelCls}>Giriş metni</span>
                    <textarea
                      rows={3}
                      className={inputCls}
                      value={draft.form_settings.intro}
                      onChange={(e) => patchSettings({ intro: e.target.value })}
                      placeholder="Formun üstünde görünür. Boşsa açıklama kullanılır."
                    />
                  </label>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className={labelCls}>Alanlar</p>
                    <p className="mt-1 text-xs text-slate-500">Veli adı soyadı, telefon ve KVKK onayı her zaman zorunludur.</p>
                    <div className="mt-2 grid gap-x-4 sm:grid-cols-2">
                      <Toggle checked={draft.form_settings.fields.student_name.enabled} onChange={(v) => patchField('student_name', { enabled: v })} label="Öğrenci adı" />
                      {draft.form_settings.fields.student_name.enabled && (
                        <Toggle checked={draft.form_settings.fields.student_name.required} onChange={(v) => patchField('student_name', { required: v })} label="Öğrenci adı zorunlu" />
                      )}
                      <Toggle checked={draft.form_settings.fields.grade.enabled} onChange={(v) => patchField('grade', { enabled: v })} label="Sınıf" />
                      {draft.form_settings.fields.grade.enabled && (
                        <Toggle checked={draft.form_settings.fields.grade.required} onChange={(v) => patchField('grade', { required: v })} label="Sınıf zorunlu" />
                      )}
                    </div>
                  </div>
                  <label className="block">
                    <span className={labelCls}>KVKK aydınlatma metni</span>
                    <textarea
                      rows={4}
                      className={inputCls}
                      value={draft.form_settings.kvkk_text}
                      onChange={(e) => patchSettings({ kvkk_text: e.target.value })}
                      placeholder="Kendi KVKK / iletişim metninizi buraya yapıştırın. Boş bırakırsanız Veli Kayıt ayarlarındaki kurum KVKK metni ya da linki kullanılır."
                    />
                  </label>
                  <label className="block">
                    <span className={labelCls}>veya KVKK metni linki</span>
                    <input className={inputCls} value={draft.form_settings.kvkk_url} onChange={(e) => patchSettings({ kvkk_url: e.target.value })} placeholder="https://…/kvkk" />
                  </label>
                  <div>
                    <Toggle
                      checked={draft.form_settings.contact_consent}
                      onChange={(v) => patchSettings({ contact_consent: v })}
                      label="İsteğe bağlı ticari ileti izni kutusu göster"
                      hint="Kampanya mesajları için ayrı onay (İYS uyumu)."
                    />
                    <Toggle
                      checked={draft.form_settings.send_confirmation}
                      onChange={(v) => patchSettings({ send_confirmation: v })}
                      label="Kayıt olunca WhatsApp onay mesajı gönder"
                    />
                    <Toggle
                      checked={draft.form_settings.add_to_crm}
                      onChange={(v) => patchSettings({ add_to_crm: v })}
                      label="Kayıt olanları Kayıt Takibi'ne aday olarak ekle"
                    />
                    <Toggle
                      checked={draft.form_settings.closed}
                      onChange={(v) => patchSettings({ closed: v })}
                      label="Kayıtları kapat"
                      hint="Etkinlik başladıktan 1 saat sonra form zaten otomatik kapanır."
                    />
                  </div>
                  <label className="block">
                    <span className={labelCls}>Kayıt sonrası mesaj</span>
                    <textarea rows={2} className={inputCls} value={draft.form_settings.success_message} onChange={(e) => patchSettings({ success_message: e.target.value })} />
                  </label>
                </div>
              </Section>
            </div>

            {/* Mesajlar ve hatırlatmalar */}
            <Section title="WhatsApp mesajları ve hatırlatmalar" icon={<BellRing className="h-4 w-4 text-sky-600" />}>
              <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                <div className="space-y-3">
                  <label className="block">
                    <span className={labelCls}>Onay mesajı şablonu</span>
                    <select className={inputCls} value={draft.template_type} onChange={(e) => patch({ template_type: e.target.value })}>
                      {!templateByType.has(draft.template_type) && <option value={draft.template_type}>{draft.template_type}</option>}
                      {templates.map((t) => (
                        <option key={t.type} value={t.type}>
                          {t.name || t.type}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div>
                    <p className={labelCls}>Hatırlatmalar</p>
                    <ul className="mt-2 space-y-2">
                      {draft.reminders.map((r, i) => {
                        const off = splitOffset(r.offset_minutes);
                        return (
                          <li key={r.id || `new-${i}`} className={`rounded-xl border p-3 ${r.enabled ? 'border-slate-200' : 'border-dashed border-slate-200 opacity-60'}`}>
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={r.enabled}
                                onChange={(e) => patchReminder(i, { enabled: e.target.checked })}
                                className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                                aria-label="Aktif"
                              />
                              <select
                                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                                value={r.kind}
                                onChange={(e) =>
                                  patchReminder(
                                    i,
                                    e.target.value === 'day_of'
                                      ? { kind: 'day_of', at_time: r.at_time || '10:00' }
                                      : e.target.value === 'after'
                                        ? {
                                            kind: 'after',
                                            offset_minutes: r.offset_minutes ?? 120,
                                            template_type: SURVEY_TEMPLATE
                                          }
                                        : {
                                            kind: 'before',
                                            offset_minutes: r.offset_minutes ?? 60,
                                            template_type: r.template_type === SURVEY_TEMPLATE ? draft.template_type : r.template_type
                                          }
                                  )
                                }
                              >
                                <option value="before">Etkinlikten önce</option>
                                <option value="day_of">Etkinlik günü saat</option>
                                <option value="after">Etkinlikten sonra (anket)</option>
                              </select>
                              {r.kind === 'before' || r.kind === 'after' ? (
                                <>
                                  <input
                                    type="number"
                                    min={0}
                                    className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                                    value={off.value}
                                    onChange={(e) => patchReminder(i, { offset_minutes: Math.max(0, Number(e.target.value || 0)) * UNIT_MIN[off.unit] })}
                                  />
                                  <select
                                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                                    value={off.unit}
                                    onChange={(e) =>
                                      patchReminder(i, { offset_minutes: off.value * UNIT_MIN[e.target.value as keyof typeof UNIT_MIN] })
                                    }
                                  >
                                    <option value="minute">dakika</option>
                                    <option value="hour">saat</option>
                                    <option value="day">gün</option>
                                  </select>
                                </>
                              ) : (
                                <input
                                  type="time"
                                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                                  value={r.at_time || ''}
                                  onChange={(e) => patchReminder(i, { at_time: e.target.value })}
                                />
                              )}
                              <select
                                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                                value={r.template_type}
                                onChange={(e) => patchReminder(i, { template_type: e.target.value })}
                                aria-label="Şablon"
                              >
                                {!templateByType.has(r.template_type) && (
                                  <option value={r.template_type}>
                                    {r.template_type === SURVEY_TEMPLATE ? 'Etkinlik sonrası anket (link)' : r.template_type}
                                  </option>
                                )}
                                {templates.map((t) => (
                                  <option key={t.type} value={t.type}>
                                    {t.name || t.type}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => setDraft((d) => (d ? { ...d, reminders: d.reminders.filter((_, j) => j !== i) } : d))}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                aria-label="Hatırlatmayı sil"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                            {r.id && (
                              <p className="mt-1.5 text-xs text-slate-500">
                                {r.fire_at ? `Gönderim: ${formatDateTime(r.fire_at)}` : 'Tarih/saat geçersiz'}
                                {r.state === 'done' && r.stats ? ` · ${r.stats.sent} gönderildi${r.stats.failed ? `, ${r.stats.failed} hata` : ''}` : ''}
                                {r.state === 'waiting' ? ' · bekliyor' : ''}
                              </p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    <button
                      type="button"
                      disabled={draft.reminders.length >= 10}
                      onClick={() =>
                        setDraft((d) =>
                          d
                            ? {
                                ...d,
                                reminders: [
                                  ...d.reminders,
                                  { kind: 'before', offset_minutes: 60, at_time: null, template_type: d.template_type || DEFAULT_TEMPLATE, enabled: true }
                                ]
                              }
                            : d
                        )
                      }
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                    >
                      <Plus className="h-4 w-4" />
                      Hatırlatma ekle
                    </button>
                    <p className="mt-1 text-xs text-slate-500">
                      Hatırlatma saatinden sonra kayıt olan kişi o hatırlatmayı almaz (kayıtta zaten onay mesajı alır). Aynı
                      telefona aynı hatırlatma bir kez gider. "Etkinlikten sonra" hatırlatması her kişiye özel anket linki
                      gönderir.
                    </p>
                    {draft.reminders.some((r) => r.kind === 'after' && r.enabled) && (
                      <div
                        className={`mt-3 rounded-xl border p-3 text-sm ${
                          surveyTpl?.state === 'approved'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                            : surveyTpl?.state === 'rejected'
                              ? 'border-rose-200 bg-rose-50 text-rose-900'
                              : 'border-amber-200 bg-amber-50 text-amber-900'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold">
                            Anket mesaj şablonu:{' '}
                            {surveyTpl?.state === 'approved'
                              ? 'Meta onaylı ✓'
                              : surveyTpl?.state === 'pending'
                                ? 'Meta onayı bekleniyor'
                                : surveyTpl?.state === 'rejected'
                                  ? 'Meta reddetti'
                                  : 'Henüz onaya gönderilmedi'}
                          </span>
                          {surveyTpl?.state !== 'approved' && surveyTpl?.state !== 'pending' && (
                            <button
                              type="button"
                              onClick={() => void submitSurveyTemplate()}
                              disabled={surveyTplBusy}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                            >
                              {surveyTplBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                              Meta onayına gönder
                            </button>
                          )}
                        </div>
                        {surveyTpl?.state !== 'approved' && (
                          <p className="mt-1 text-xs">
                            Onay gelene kadar anket mesajı gönderilmez; onay geldikten sonra hatırlatma saatinden itibaren 6 saat
                            içinde otomatik gider.
                            {surveyTpl?.rejected_reason ? ` Ret nedeni: ${surveyTpl.rejected_reason}` : ''}
                          </p>
                        )}
                        {surveyTpl?.content && (
                          <p className="mt-2 whitespace-pre-line rounded-lg bg-white/70 p-2 text-xs text-slate-700">
                            {surveyTpl.content}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <p className={labelCls}>Mesaj önizlemesi</p>
                  <div className="mt-2 rounded-2xl bg-[#e7f7e0] p-3 text-sm leading-relaxed text-slate-800 shadow-inner">
                    {previewText ? (
                      <p className="whitespace-pre-line rounded-xl rounded-tl-none bg-white p-3 shadow-sm">{previewText}</p>
                    ) : (
                      <p className="text-xs text-slate-500">Şablon seçin.</p>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Meta onaylı şablonlar kullanılır; metni değiştirmek için Mesaj Şablonları sayfasından yeni şablon onaya gönderin.</p>
                </div>
              </div>
            </Section>

            {/* Anket sonuçları */}
            {detail?.survey && (detail.survey.summary.count > 0 || detail.reminders.some((r) => r.kind === 'after')) && (
              <Section
                title={`Anket sonuçları (${detail.survey.summary.count})`}
                icon={<MessageSquareHeart className="h-4 w-4 text-rose-500" />}
                right={
                  <button
                    type="button"
                    onClick={exportSurveyCsv}
                    disabled={!detail.survey.summary.count}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Excel (CSV)
                  </button>
                }
              >
                {!detail.survey.summary.count ? (
                  <p className="py-6 text-center text-sm text-slate-500">
                    Henüz yanıt yok. Anket linki etkinlik bittikten sonra otomatik gönderilir.
                  </p>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <div className="rounded-xl bg-amber-50 p-3">
                        <p className="text-xs font-semibold uppercase text-amber-700">Ortalama puan</p>
                        <p className="mt-1 flex items-center gap-1 text-2xl font-bold text-amber-900">
                          {detail.survey.summary.average ?? '—'}
                          <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                        </p>
                        <p className="text-xs text-amber-700">{detail.survey.summary.count} yanıt</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3 sm:col-span-2">
                        <p className="text-xs font-semibold uppercase text-slate-500">Puan dağılımı</p>
                        <div className="mt-1 space-y-1">
                          {[5, 4, 3, 2, 1].map((n) => {
                            const c = detail.survey!.summary.distribution[n] || 0;
                            const pct = detail.survey!.summary.count ? Math.round((c / detail.survey!.summary.count) * 100) : 0;
                            return (
                              <div key={n} className="flex items-center gap-2 text-xs">
                                <span className="w-6 text-slate-600">{n}★</span>
                                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                                  <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="w-8 text-right text-slate-600">{c}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="rounded-xl bg-emerald-50 p-3">
                        <p className="text-xs font-semibold uppercase text-emerald-700">Bilgi almak istiyor</p>
                        <p className="mt-1 text-2xl font-bold text-emerald-900">{detail.survey.summary.want_info}</p>
                        <p className="text-xs text-emerald-700">Kayıt Takibi'ne düştü</p>
                        <p className="mt-2 text-xs text-slate-600">
                          Beklenti: {detail.survey.summary.expectation.evet} evet · {detail.survey.summary.expectation.kismen} kısmen ·{' '}
                          {detail.survey.summary.expectation.hayir} hayır
                        </p>
                      </div>
                    </div>
                    <ul className="mt-4 divide-y divide-slate-100">
                      {detail.survey.responses.map((r) => (
                        <li key={r.participant_id} className="py-3 text-sm">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="font-semibold text-slate-900">{r.parent_name || '—'}</span>
                            {r.student_name && <span className="text-slate-500">({r.student_name})</span>}
                            <span className="text-amber-500" aria-label={`${r.rating} puan`}>
                              {'★'.repeat(r.rating)}
                              <span className="text-slate-300">{'★'.repeat(5 - r.rating)}</span>
                            </span>
                            {r.expectation && (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                                Beklenti: {EXPECTATION_LABEL[r.expectation]}
                              </span>
                            )}
                            {r.want_info && (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                Bilgi istiyor · {r.phone}
                              </span>
                            )}
                            <span className="ml-auto text-xs text-slate-400">{formatDateTime(r.created_at)}</span>
                          </div>
                          {r.topics && <p className="mt-1 text-slate-600">Konu isteği: {r.topics}</p>}
                          {r.comment && <p className="mt-1 whitespace-pre-line text-slate-700">“{r.comment}”</p>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Section>
            )}

            {/* Katılımcılar */}
            {detail && (
              <Section
                title={`Kayıtlar (${detail.participants.length})`}
                icon={<Users className="h-4 w-4 text-emerald-600" />}
                right={
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => void loadDetail(detail.id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Yenile">
                      <RefreshCw className={`h-4 w-4 ${detailLoading ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={exportCsv}
                      disabled={!detail.participants.length}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Excel (CSV)
                    </button>
                  </div>
                }
              >
                {!detail.participants.length ? (
                  <p className="py-6 text-center text-sm text-slate-500">Henüz kayıt yok. Form linkini paylaşın.</p>
                ) : (
                  <div className="-mx-4 overflow-x-auto sm:mx-0">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                          <th className="px-3 py-2 font-semibold">Veli</th>
                          <th className="px-3 py-2 font-semibold">Öğrenci</th>
                          <th className="px-3 py-2 font-semibold">Telefon</th>
                          <th className="px-3 py-2 font-semibold">Kayıt</th>
                          <th className="px-3 py-2 font-semibold">Onay</th>
                          <th className="px-3 py-2 font-semibold">Hatırlatmalar</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {detail.participants.map((p) => (
                          <tr key={p.id} className="border-b border-slate-100 align-top last:border-0">
                            <td className="px-3 py-2 font-medium text-slate-900">
                              {p.parent_name || p.display_name}
                              {p.lead_id && <span className="ml-1.5 rounded bg-sky-50 px-1 text-[10px] font-semibold text-sky-700">CRM</span>}
                            </td>
                            <td className="px-3 py-2 text-slate-700">
                              {p.student_name || '—'}
                              {p.grade && <span className="block text-xs text-slate-500">{p.grade}</span>}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-slate-700">{p.phone}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{formatDateTime(p.created_at)}</td>
                            <td className="px-3 py-2">
                              <StatusPill status={p.whatsapp_status} title={p.whatsapp_error} />
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-1">
                                {(reminderStatsByParticipant(p) || []).map((s) => (
                                  <span key={s.id} title={`${s.label}${s.error ? ` — ${s.error}` : ''}`}>
                                    <StatusPill status={s.status} title={`${s.label}${s.error ? ` — ${s.error}` : ''}`} />
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => void deleteParticipant(p)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                aria-label="Kaydı sil"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>
            )}
          </>
        )}
      </div>
      </div>
    </div>
  );
}
