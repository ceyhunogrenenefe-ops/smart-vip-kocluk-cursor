import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/session';
import { MessageSquareText, Save, RefreshCw, AlertCircle, CheckCircle2, Info } from 'lucide-react';

export interface MessageTemplateRow {
  id: string;
  name: string;
  type: string;
  content: string;
  variables: unknown;
  created_at?: string;
  updated_at?: string;
}

function variablesToList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  return [];
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

const TYPE_LABELS: Record<string, string> = {
  lesson_reminder: 'Ders hatırlatma (cron)',
  report_reminder: 'Rapor hatırlatma (cron)'
};

export default function MessageTemplates() {
  const [templates, setTemplates] = useState<MessageTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { name: string; content: string; variables: string[] }>
  >({});

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
      const next: Record<string, { name: string; content: string; variables: string[] }> = {};
      for (const t of list) {
        next[t.id] = {
          name: t.name,
          content: t.content,
          variables: variablesToList(t.variables)
        };
      }
      setDrafts(next);
    } catch {
      setError('Ağ hatası');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateDraft = (id: string, field: 'name' | 'content', value: string) => {
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
          variables: d.variables
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
          [updated.id]: {
            name: updated.name,
            content: updated.content,
            variables: variablesToList(updated.variables)
          }
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

  const variablesEqual = (a: string[], b: string[]) => {
    if (a.length !== b.length) return false;
    const sa = [...a].map((x) => x.trim()).sort();
    const sb = [...b].map((x) => x.trim()).sort();
    return sa.every((v, i) => v === sb[i]);
  };

  const dirty = (t: MessageTemplateRow) => {
    const d = drafts[t.id];
    if (!d) return false;
    return (
      d.name !== t.name ||
      d.content !== t.content ||
      !variablesEqual(d.variables, variablesToList(t.variables))
    );
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl shadow-lg p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
            <MessageSquareText className="w-8 h-8" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">WhatsApp mesaj şablonları</h1>
            <p className="text-emerald-100 text-sm mt-1">
              Ders ve rapor cron mesajları — Twilio ile gönderilir. Metinde{' '}
              <code className="bg-white/15 px-1 rounded">{'{{değişken_adı}}'}</code> kullanın; aşağıdaki listede tanımlı
              adlar referans içindir.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
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
          <p className="font-medium text-slate-800">Kurulum</p>
          <p className="mt-1">
            Tablolar Supabase&apos;de yoksa{' '}
            <code className="text-xs bg-white px-1 rounded border">2026-05-03-whatsapp-automation-templates-logs.sql</code>{' '}
            dosyasını çalıştırın. <code className="text-xs">type</code> alanı sabittir; başlık, metin ve değişken listesi
            düzenlenebilir.
          </p>
        </div>
      </div>

      {loading && templates.length === 0 ? (
        <p className="text-slate-500 text-sm">Yükleniyor…</p>
      ) : (
        <div className="space-y-6">
          {templates.map((t) => {
            const d = drafts[t.id] || {
              name: t.name,
              content: t.content,
              variables: variablesToList(t.variables)
            };
            return (
              <div
                key={t.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
              >
                <div className="px-5 py-4 border-b border-gray-100">
                  <span className="text-xs font-semibold uppercase tracking-wide text-teal-600">
                    {TYPE_LABELS[t.type] || t.type}
                  </span>
                  <p className="text-xs text-slate-500 mt-0.5 font-mono">{t.type}</p>
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
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Değişken adları
                    </label>
                    <p className="text-xs text-slate-500 mb-2">
                      Virgül veya satır başı ile ayırın (en fazla 40). İsteğe bağlı:{' '}
                      <code className="bg-slate-100 px-1 rounded">{'{{student_name}}'}</code> yazarsanız ad olarak{' '}
                      <code className="bg-slate-100 px-1 rounded">student_name</code> alınır.
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
                    <label className="block text-sm font-medium text-slate-700 mb-1">Mesaj metni</label>
                    <textarea
                      value={d.content}
                      onChange={(e) => updateDraft(t.id, 'content', e.target.value)}
                      rows={6}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-slate-800 font-mono text-sm focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 outline-none resize-y min-h-[120px]"
                    />
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
    </div>
  );
}
