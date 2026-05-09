import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/session';
import {
  MessageSquareText,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Info,
  Loader2,
  Radio,
  Eye
} from 'lucide-react';

export interface MessageTemplateRow {
  id: string;
  name: string;
  type: string;
  content: string;
  variables: unknown;
  twilio_content_sid?: string | null;
  meta_template_name?: string | null;
  meta_template_language?: string | null;
  twilio_variable_bindings?: unknown;
  whatsapp_template_status?: string | null;
  whatsapp_template_synced_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

type DraftRow = {
  name: string;
  content: string;
  variables: string[];
  meta_template_name: string;
  meta_template_language: string;
  twilio_bindings_raw: string;
};

export interface MessageLogRow {
  id: string;
  student_id: string | null;
  kind: string;
  message: string | null;
  status: string;
  sent_at?: string;
  log_date?: string;
  error: string | null;
  phone: string | null;
  twilio_sid: string | null;
  twilio_error_code: string | null;
  twilio_content_sid?: string | null;
  meta_message_id?: string | null;
  meta_template_name?: string | null;
}

interface TemplatePreviewPayload {
  provider?: string;
  whatsapp_mode?: string;
  use_template_send?: boolean;
  meta_template_name?: string | null;
  meta_template_language?: string | null;
  twilio_content_sid?: string | null;
  bindings?: string[];
  validation?: { ok: boolean; missing: string[]; empty: string[] };
  rendered_body_fallback?: string;
  content_variables_json?: string | null;
  meta_approval_status?: string | null;
  ready_for_production_send?: boolean;
}

function variablesToList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  return [];
}

function bindingsToList(t: MessageTemplateRow): string[] {
  const raw = t.twilio_variable_bindings;
  if (Array.isArray(raw) && raw.length) return raw.map((x) => String(x).trim()).filter(Boolean);
  return variablesToList(t.variables);
}

/** Virgül / noktalı virgül / satır sonu ile ayrılmış isimler → benzersiz sıra korunarak */
function stripMustacheName(s: string): string {
  let x = s.trim();
  if (x.startsWith('{{') && x.endsWith('}}')) {
    x = x.slice(2, -2).trim();
  }
  return x;
}

function parseVariableNames(raw: string): string[] {
  const parts = String(raw || '')
    .split(/[,;\n]+/)
    .map((s) => stripMustacheName(s))
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.slice(0, 64);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
    if (out.length >= 40) break;
  }
  return out;
}

function draftFromTemplate(t: MessageTemplateRow): DraftRow {
  return {
    name: t.name,
    content: t.content,
    variables: variablesToList(t.variables),
    meta_template_name: String(t.meta_template_name || ''),
    meta_template_language: String(t.meta_template_language || 'tr'),
    twilio_bindings_raw: bindingsToList(t).join(', ')
  };
}

function defaultSampleVarsJson(t: MessageTemplateRow): string {
  const keys = bindingsToList(t);
  const o: Record<string, string> = {};
  for (const k of keys) o[k] = 'örnek';
  return JSON.stringify(o, null, 2);
}

const TYPE_LABELS: Record<string, string> = {
  lesson_reminder: 'Ders hatırlatma — öğrenci (cron)',
  lesson_reminder_parent: 'Ders hatırlatma — veli (cron)',
  report_reminder: 'Günlük rapor hatırlatma (cron)',
  class_lesson_reminder: 'Grup dersi hatırlatma (cron)',
  class_homework_notice: 'Grup ödev bildirimi (cron)',
  class_absent_notice: 'Grup devamsızlık — veli (yoklama)',
  meeting_reminder: 'Görüşme hatırlatma',
  meeting_notification: 'Toplantı / görüşme bildirimi (WhatsApp)',
  class_lesson_reminder_legacy: 'Grup dersi hatırlatma'
};

export default function MessageTemplates() {
  const [templates, setTemplates] = useState<MessageTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});
  const [logs, setLogs] = useState<MessageLogRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [previewInputs, setPreviewInputs] = useState<Record<string, string>>({});
  const [previewResult, setPreviewResult] = useState<Record<string, TemplatePreviewPayload>>({});
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/message-templates');
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof j.error === 'string' ? j.error : 'Şablonlar yüklenemedi');
        setTemplates([]);
        return;
      }
      const list = (j.templates || []) as MessageTemplateRow[];
      setTemplates(list);
      const next: Record<string, DraftRow> = {};
      for (const t of list) {
        next[t.id] = draftFromTemplate(t);
      }
      setDrafts(next);
    } catch {
      setError('Ağ hatası');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await apiFetch('/api/message-logs?limit=80');
      const j = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(j.data)) setLogs(j.data as MessageLogRow[]);
      else setLogs([]);
    } catch {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadLogs();
  }, [load, loadLogs]);

  const updateDraft = (id: string, field: keyof DraftRow, value: string) => {
    setDrafts((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      return { ...prev, [id]: { ...cur, [field]: value } };
    });
  };

  const updateDraftVariables = (id: string, variables: string[]) => {
    setDrafts((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      return { ...prev, [id]: { ...cur, variables } };
    });
  };

  const save = async (t: MessageTemplateRow) => {
    const d = drafts[t.id];
    if (!d) return;
    setSavingId(t.id);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch('/api/message-templates', {
        method: 'PATCH',
        body: JSON.stringify({
          id: t.id,
          name: d.name,
          content: d.content,
          variables: d.variables,
          meta_template_name: d.meta_template_name.trim() || null,
          meta_template_language: d.meta_template_language.trim() || 'tr',
          twilio_variable_bindings: parseVariableNames(d.twilio_bindings_raw)
        })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof j.error === 'string' ? j.error : 'Kayıt başarısız');
        return;
      }
      const updated = j.template as MessageTemplateRow | undefined;
      if (updated) {
        setTemplates((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        setDrafts((prev) => ({
          ...prev,
          [updated.id]: draftFromTemplate(updated)
        }));
      }
      setSuccess('Kaydedildi.');
      setTimeout(() => setSuccess(null), 4000);
    } catch {
      setError('Kayıt sırasında ağ hatası');
    } finally {
      setSavingId(null);
    }
  };

  const syncOne = async (t: MessageTemplateRow) => {
    setSyncingId(t.id);
    setError(null);
    try {
      const res = await apiFetch('/api/message-templates', {
        method: 'POST',
        body: JSON.stringify({ action: 'sync_meta_template', id: t.id })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof j.error === 'string' ? j.error : 'Senkron başarısız');
        return;
      }
      setSuccess(`Meta şablon durumu: ${typeof j.status === 'string' ? j.status : 'güncellendi'}`);
      await load();
      setTimeout(() => setSuccess(null), 5000);
    } catch {
      setError('Senkron ağ hatası');
    } finally {
      setSyncingId(null);
    }
  };

  const syncAll = async () => {
    setSyncingAll(true);
    setError(null);
    try {
      const res = await apiFetch('/api/message-templates', {
        method: 'POST',
        body: JSON.stringify({ action: 'sync_meta_templates' })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof j.error === 'string' ? j.error : 'Toplu senkron başarısız');
        return;
      }
      setSuccess(`Meta: ${typeof j.synced === 'number' ? j.synced : 0} şablon güncellendi.`);
      await load();
      setTimeout(() => setSuccess(null), 5000);
    } catch {
      setError('Senkron ağ hatası');
    } finally {
      setSyncingAll(false);
    }
  };

  const runPreview = async (t: MessageTemplateRow) => {
    const raw = previewInputs[t.id] ?? defaultSampleVarsJson(t);
    let variables: Record<string, string> = {};
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('shape');
      variables = Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, v == null ? '' : String(v)])
      );
    } catch {
      setError('Önizleme: JSON geçersiz (nesne beklenir).');
      return;
    }
    setPreviewLoadingId(t.id);
    setError(null);
    try {
      const res = await apiFetch('/api/message-templates', {
        method: 'POST',
        body: JSON.stringify({ action: 'preview_template', template_type: t.type, variables })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof j.error === 'string' ? j.error : 'Önizleme başarısız');
        return;
      }
      const p = j.preview as TemplatePreviewPayload | undefined;
      if (p) setPreviewResult((prev) => ({ ...prev, [t.id]: p }));
    } catch {
      setError('Önizleme ağ hatası');
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const variablesEqual = (a: string[], b: string[]) => {
    if (a.length !== b.length) return false;
    const sa = [...a].map((x) => x.trim()).sort();
    const sb = [...b].map((x) => x.trim()).sort();
    return sa.every((v, i) => v === sb[i]);
  };

  const bindingsEqualDraft = (t: MessageTemplateRow, draftRaw: string) => {
    const a = parseVariableNames(draftRaw);
    const b = bindingsToList(t);
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
  };

  const dirty = (t: MessageTemplateRow) => {
    const d = drafts[t.id];
    if (!d) return false;
    return (
      d.name !== t.name ||
      d.content !== t.content ||
      !variablesEqual(d.variables, variablesToList(t.variables)) ||
      d.meta_template_name.trim() !== String(t.meta_template_name || '').trim() ||
      d.meta_template_language.trim() !== String(t.meta_template_language || 'tr').trim() ||
      !bindingsEqualDraft(t, d.twilio_bindings_raw)
    );
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl shadow-lg p-6 text-white">
        <div className="flex flex-wrap items-center gap-4">
          <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
            <MessageSquareText className="w-8 h-8" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-2xl font-bold">WhatsApp şablonları</h1>
            <p className="text-emerald-100 text-sm mt-1">
              Otomasyonlar{' '}
              <strong className="text-white">Meta WhatsApp Cloud API</strong> şablon mesajı ile gider. Aşağıda şablon adı ve
              dil kodunu Business Manager’daki onaylı şablonla eşleştirin.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void syncAll()}
              disabled={syncingAll || loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/25 hover:bg-white/35 text-white text-sm font-medium disabled:opacity-50"
            >
              {syncingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
              Meta şablon durumunu çek
            </button>
            <button
              type="button"
              onClick={() => {
                void load();
                void loadLogs();
              }}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">
          <CheckCircle2 className="w-5 h-5" />
          {success}
        </div>
      )}

      <div className="flex items-start gap-2 p-4 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-sm">
        <Info className="w-5 h-5 shrink-0 text-slate-500 mt-0.5" />
        <div>
          <p className="font-medium text-slate-800">Üretim gönderici</p>
          <p className="mt-1">
            Vercel&apos;de <code className="text-xs bg-white px-1 rounded border">META_WHATSAPP_TOKEN</code>,{' '}
            <code className="text-xs bg-white px-1 rounded border">META_PHONE_NUMBER_ID</code>,{' '}
            <code className="text-xs bg-white px-1 rounded border">META_WABA_ID</code> tanımlı olmalı. Şablon gövdesindeki{' '}
            {'{{1}}'}, {'{{2}}'} sırası, aşağıdaki değişken listesi ile aynı olmalı (virgülle). Boş bırakırsanız
            &quot;Değişken adları&quot; sırası kullanılır. SQL:{' '}
            <code className="text-xs bg-white px-1 rounded border">2026-05-17-meta-whatsapp-cloud-api.sql</code>
          </p>
        </div>
      </div>

      {loading && templates.length === 0 ? (
        <p className="text-slate-500 text-sm">Yükleniyor…</p>
      ) : (
        <div className="space-y-6">
          {templates.map((t) => {
            const d = drafts[t.id] || draftFromTemplate(t);
            return (
              <div
                key={t.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
              >
                <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-teal-600">
                      {TYPE_LABELS[t.type] || t.type}
                    </span>
                    <p className="text-xs text-slate-500 mt-0.5 font-mono">{t.type}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {t.whatsapp_template_status && (
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200">
                        Meta: <strong>{t.whatsapp_template_status}</strong>
                      </span>
                    )}
                    {t.whatsapp_template_synced_at && (
                      <span className="text-slate-400">
                        senk: {new Date(t.whatsapp_template_synced_at).toLocaleString('tr-TR')}
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={!t.meta_template_name?.trim() || syncingId === t.id}
                      onClick={() => void syncOne(t)}
                      className="px-2 py-1 rounded border border-teal-200 text-teal-800 hover:bg-teal-50 disabled:opacity-40"
                    >
                      {syncingId === t.id ? '…' : 'Durumu çek'}
                    </button>
                  </div>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Şablon adı</label>
                    <input
                      type="text"
                      value={d.name}
                      onChange={(e) => updateDraft(t.id, 'name', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-slate-800 focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 outline-none"
                    />
                  </div>

                  <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-4 space-y-3">
                    <p className="text-sm font-medium text-indigo-900">Meta Cloud API şablonu</p>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Şablon adı (Business Manager)</label>
                      <input
                        type="text"
                        value={d.meta_template_name}
                        onChange={(e) => updateDraft(t.id, 'meta_template_name', e.target.value)}
                        placeholder="ornek_sablon_adi"
                        className="w-full px-3 py-2 rounded-lg border border-indigo-200 text-slate-800 font-mono text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Dil kodu</label>
                      <input
                        type="text"
                        value={d.meta_template_language}
                        onChange={(e) => updateDraft(t.id, 'meta_template_language', e.target.value)}
                        placeholder="tr"
                        className="w-full px-3 py-2 rounded-lg border border-indigo-200 text-slate-800 font-mono text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Gövde {'{{1}}'}… değişken sırası (Meta ile aynı)
                      </label>
                      <textarea
                        value={d.twilio_bindings_raw}
                        onChange={(e) => updateDraft(t.id, 'twilio_bindings_raw', e.target.value)}
                        rows={2}
                        placeholder="student_name, class_name, subject, …"
                        className="w-full px-3 py-2 rounded-lg border border-indigo-200 text-slate-800 font-mono text-sm"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Boş bırakılırsa kayıtta &quot;Değişken adları&quot; sırası kullanılır.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Değişken adları (önizleme / yedek metin)
                    </label>
                    <p className="text-xs text-slate-500 mb-2">
                      Üretim gönderimi yalnızca şablondur; bu liste gövde parametre sırasını ve yerel önizlemeyi besler.
                    </p>
                    <textarea
                      value={d.variables.join(', ')}
                      onChange={(e) => updateDraftVariables(t.id, parseVariableNames(e.target.value))}
                      rows={3}
                      placeholder="student_name, lesson_name, time, link"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-slate-800 font-mono text-sm focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 outline-none resize-y min-h-[72px]"
                    />
                    {d.variables.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {d.variables.map((v) => (
                          <span
                            key={v}
                            className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-100"
                          >
                            {`{{${v}}}`}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Mesaj metni (yerel önizleme)</label>
                    <textarea
                      value={d.content}
                      onChange={(e) => updateDraft(t.id, 'content', e.target.value)}
                      rows={6}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-slate-800 font-mono text-sm focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 outline-none resize-y min-h-[120px]"
                    />
                  </div>

                  <div className="rounded-lg border border-violet-100 bg-violet-50/40 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-violet-900">
                      <Eye className="w-4 h-4" />
                      Şablon önizleme &amp; değişken doğrulama
                    </div>
                    <p className="text-xs text-slate-600">
                      Örnek değişken JSON ile Meta gövde parametreleri ve eksik alan kontrolü.
                    </p>
                    <textarea
                      value={previewInputs[t.id] ?? defaultSampleVarsJson(t)}
                      onChange={(e) =>
                        setPreviewInputs((prev) => ({
                          ...prev,
                          [t.id]: e.target.value
                        }))
                      }
                      rows={5}
                      className="w-full px-3 py-2 rounded-lg border border-violet-200 text-slate-800 font-mono text-xs"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      disabled={previewLoadingId === t.id}
                      onClick={() => void runPreview(t)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700 disabled:opacity-50"
                    >
                      {previewLoadingId === t.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                      Önizlemeyi çalıştır
                    </button>
                    {previewResult[t.id] && (
                      <div className="rounded-md border border-violet-200 bg-white p-3 text-xs space-y-2">
                        <p>
                          <span className="text-slate-500">Sağlayıcı:</span>{' '}
                          <strong>{previewResult[t.id].provider || previewResult[t.id].whatsapp_mode || 'meta'}</strong>
                          {previewResult[t.id].use_template_send
                            ? ` → şablon (${previewResult[t.id].meta_template_name || '—'})`
                            : ' → şablon yapılandırması eksik'}
                        </p>
                        <p>
                          <span className="text-slate-500">Meta durumu:</span>{' '}
                          {previewResult[t.id].meta_approval_status || '—'}
                        </p>
                        <p>
                          <span className="text-slate-500">Değişken doğrulama:</span>{' '}
                          {previewResult[t.id].validation?.ok ? (
                            <span className="text-green-700 font-medium">Tamam</span>
                          ) : (
                            <span className="text-red-700">
                              Eksik: {(previewResult[t.id].validation?.missing || []).join(', ') || '—'} · Boş:{' '}
                              {(previewResult[t.id].validation?.empty || []).join(', ') || '—'}
                            </span>
                          )}
                        </p>
                        <p className="text-slate-600 whitespace-pre-wrap break-words">
                          <span className="text-slate-500">Yedek metin:</span>{' '}
                          {previewResult[t.id].rendered_body_fallback}
                        </p>
                        {previewResult[t.id].content_variables_json && (
                          <pre className="p-2 rounded bg-slate-100 text-[11px] overflow-x-auto">
                            bodyParameters: {previewResult[t.id].content_variables_json}
                          </pre>
                        )}
                        <p>
                          <span className="text-slate-500">Üretim gönderime hazır:</span>{' '}
                          <strong>{previewResult[t.id].ready_for_production_send ? 'Evet' : 'Hayır'}</strong>
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={!dirty(t) || savingId === t.id}
                      onClick={() => void save(t)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-40 disabled:pointer-events-none"
                    >
                      <Save className="w-4 h-4" />
                      {savingId === t.id ? 'Kaydediliyor…' : 'Kaydet'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {templates.length === 0 && !loading && (
            <p className="text-slate-500 text-sm">Henüz şablon yok veya tablo oluşturulmadı.</p>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Son WhatsApp gönderimleri</h2>
          <button
            type="button"
            onClick={() => void loadLogs()}
            className="text-sm text-teal-700 hover:underline"
          >
            {logsLoading ? 'Yükleniyor…' : 'Yenile'}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-500 text-xs uppercase">
                <th className="px-3 py-2">Zaman</th>
                <th className="px-3 py-2">Tür</th>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2">Meta mesaj</th>
                <th className="px-3 py-2">Şablon</th>
                <th className="px-3 py-2">Hata</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((row) => (
                <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                    {row.sent_at ? new Date(row.sent_at).toLocaleString('tr-TR') : '—'}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{row.kind}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        row.status === 'sent'
                          ? 'text-green-700 font-medium'
                          : row.status === 'failed'
                            ? 'text-red-700 font-medium'
                            : 'text-slate-600'
                      }
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-700">
                    {row.meta_message_id ? (
                      <span title={row.meta_message_id}>…{row.meta_message_id.slice(-8)}</span>
                    ) : row.twilio_sid ? (
                      <span title={row.twilio_sid}>…{row.twilio_sid.slice(-8)}</span>
                    ) : (
                      '—'
                    )}
                    {row.twilio_error_code && (
                      <span className="ml-1 text-red-600" title="Hata kodu">
                        ({row.twilio_error_code})
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-slate-600 max-w-[140px] truncate" title={row.meta_template_name || row.twilio_content_sid || ''}>
                    {row.meta_template_name || row.twilio_content_sid ? `…${(row.meta_template_name || row.twilio_content_sid || '').slice(-12)}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-red-700 max-w-[220px] truncate" title={row.error || ''}>
                    {row.error || '—'}
                  </td>
                </tr>
              ))}
              {!logs.length && !logsLoading && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    Kayıt yok veya tablo henüz genişletilmedi (SQL migration).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
