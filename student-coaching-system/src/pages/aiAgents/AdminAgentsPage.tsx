import React, { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  BookOpen,
  Trash2,
  Plus,
  Upload,
  Loader2,
  Settings as SettingsIcon,
  BarChart3,
  RefreshCcw,
  FileText,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import {
  createAgent,
  deleteAgent,
  deleteDocument,
  finalizeDocument,
  getAiSettings,
  getUsageSummary,
  initDocument,
  listAgents,
  listDocuments,
  updateAgent,
  updateAiSettings,
  uploadDocumentChunks
} from '../../lib/aiAgents/aiAgentsApi';
import type { AIAgent, AIAgentDocument, AIUsageSummary } from '../../types/aiAgents.types';
import { extractPdfPages, hashFile } from '../../lib/aiAgents/pdfExtract';
import QuestionPoolTab from './admin/QuestionPoolTab';
import PapersTab from './admin/PapersTab';

const SUBJECT_PRESETS = [
  'Fizik',
  'Kimya',
  'Biyoloji',
  'Matematik',
  'Geometri',
  'Türkçe',
  'Edebiyat',
  'Tarih',
  'Coğrafya',
  'Felsefe',
  'İngilizce',
  'Almanca'
];

export default function AdminAgentsPage() {
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<AIAgent | null>(null);
  const [tab, setTab] = useState<'agents' | 'usage' | 'settings'>('agents');

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await listAgents();
      setAgents(list);
      if (!selected && list.length) setSelected(list[0]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="w-6 h-6 text-blue-600" /> AI Ders Ajanları
          </h1>
          <p className="text-sm text-slate-500">
            Ders bazlı yapay zekâ koçları oluşturun, PDF ders notu/soru bankası yükleyin, öğrencilere açın.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTab('agents')}
            className={`px-3 py-1.5 rounded-lg text-sm ${tab === 'agents' ? 'bg-blue-600 text-white' : 'bg-white border'}`}
          >
            Ajanlar
          </button>
          <button
            onClick={() => setTab('usage')}
            className={`px-3 py-1.5 rounded-lg text-sm ${tab === 'usage' ? 'bg-blue-600 text-white' : 'bg-white border'}`}
          >
            <BarChart3 className="w-4 h-4 inline -mt-0.5 mr-1" /> Kullanım
          </button>
          <button
            onClick={() => setTab('settings')}
            className={`px-3 py-1.5 rounded-lg text-sm ${tab === 'settings' ? 'bg-blue-600 text-white' : 'bg-white border'}`}
          >
            <SettingsIcon className="w-4 h-4 inline -mt-0.5 mr-1" /> Ayarlar
          </button>
        </div>
      </div>

      {tab === 'agents' && (
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
          <AgentSidebar
            agents={agents}
            loading={loading}
            selectedId={selected?.id || null}
            onSelect={setSelected}
            onCreated={(a) => {
              setAgents((prev) => [a, ...prev]);
              setSelected(a);
            }}
          />
          {selected ? (
            <AgentDetail
              agent={selected}
              onChanged={(a) => {
                setAgents((prev) => prev.map((p) => (p.id === a.id ? a : p)));
                setSelected(a);
              }}
              onDeleted={(id) => {
                setAgents((prev) => prev.filter((p) => p.id !== id));
                setSelected(null);
              }}
            />
          ) : (
            <div className="bg-white border rounded-xl p-8 text-center text-slate-500">
              Soldan bir ajan seçin veya <strong>+ Yeni Ajan</strong> ile başlayın.
            </div>
          )}
        </div>
      )}

      {tab === 'usage' && <UsagePanel />}
      {tab === 'settings' && <SettingsPanel />}
    </div>
  );
}

function AgentSidebar(props: {
  agents: AIAgent[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (a: AIAgent) => void;
  onCreated: (a: AIAgent) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState(SUBJECT_PRESETS[0]);
  const [grade, setGrade] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return alert('Ajan adı gerekli.');
    setBusy(true);
    try {
      const a = await createAgent({
        name: name.trim(),
        subject: subject.trim(),
        grade_level: grade.trim() || undefined
      });
      props.onCreated(a);
      setShowForm(false);
      setName('');
      setGrade('');
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white border rounded-xl p-3 max-h-[80vh] overflow-y-auto">
      <button
        onClick={() => setShowForm((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm mb-3"
      >
        <Plus className="w-4 h-4" /> Yeni Ajan
      </button>

      {showForm && (
        <div className="mb-3 p-3 border rounded-lg bg-slate-50 space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ajan adı (ör: Fizik Koçu)"
            className="w-full text-sm px-2 py-1.5 border rounded"
          />
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full text-sm px-2 py-1.5 border rounded"
          >
            {SUBJECT_PRESETS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            placeholder="Sınıf seviyesi (opsiyonel: 9.sınıf, TYT, AYT…)"
            className="w-full text-sm px-2 py-1.5 border rounded"
          />
          <button
            onClick={submit}
            disabled={busy}
            className="w-full px-3 py-1.5 rounded bg-emerald-600 text-white text-sm disabled:opacity-50"
          >
            {busy ? 'Oluşturuluyor…' : 'Oluştur'}
          </button>
        </div>
      )}

      {props.loading && (
        <div className="text-center text-slate-400 text-sm py-4">
          <Loader2 className="w-4 h-4 animate-spin inline" /> Yükleniyor…
        </div>
      )}
      {!props.loading && !props.agents.length && (
        <div className="text-center text-slate-400 text-sm py-6">Henüz ajan yok.</div>
      )}
      {props.agents.map((a) => (
        <button
          key={a.id}
          onClick={() => props.onSelect(a)}
          className={`w-full text-left px-3 py-2 rounded-lg mb-1 border ${
            props.selectedId === a.id ? 'bg-blue-50 border-blue-300' : 'border-transparent hover:bg-slate-50'
          }`}
        >
          <div className="font-medium text-sm flex items-center gap-2">
            <Bot className="w-4 h-4 text-blue-500" /> {a.name}
            {!a.is_active && <span className="text-[10px] bg-slate-200 px-1.5 rounded">pasif</span>}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {a.subject}
            {a.grade_level ? ` · ${a.grade_level}` : ''}
          </div>
        </button>
      ))}
    </div>
  );
}

function AgentDetail(props: {
  agent: AIAgent;
  onChanged: (a: AIAgent) => void;
  onDeleted: (id: string) => void;
}) {
  const { agent } = props;
  const [docs, setDocs] = useState<AIAgentDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [subTab, setSubTab] = useState<'sources' | 'questions' | 'papers'>('sources');
  const [form, setForm] = useState({
    name: agent.name,
    subject: agent.subject,
    grade_level: agent.grade_level || '',
    description: agent.description || '',
    system_prompt: agent.system_prompt || '',
    model: agent.model || 'gpt-4o-mini',
    is_active: agent.is_active !== false
  });
  const [uploading, setUploading] = useState<{ phase: string; pct: number } | null>(null);

  useEffect(() => {
    setForm({
      name: agent.name,
      subject: agent.subject,
      grade_level: agent.grade_level || '',
      description: agent.description || '',
      system_prompt: agent.system_prompt || '',
      model: agent.model || 'gpt-4o-mini',
      is_active: agent.is_active !== false
    });
  }, [agent.id, agent.name, agent.subject, agent.grade_level, agent.description, agent.system_prompt, agent.model, agent.is_active]);

  const refreshDocs = async () => {
    setLoading(true);
    try {
      setDocs(await listDocuments(agent.id));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.id]);

  const onSave = async () => {
    try {
      const updated = await updateAgent({ id: agent.id, ...form });
      props.onChanged(updated);
      setEditing(false);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const onDelete = async () => {
    if (!confirm(`"${agent.name}" ajanı ve tüm dökümanları silinecek. Emin misiniz?`)) return;
    await deleteAgent(agent.id);
    props.onDeleted(agent.id);
  };

  const onUploadFile = async (file: File) => {
    setUploading({ phase: 'PDF okunuyor', pct: 5 });
    try {
      const hash = await hashFile(file);
      const pages = await extractPdfPages(file);
      const totalText = pages.reduce((acc, p) => acc + p.text.length, 0);
      if (!totalText) {
        alert('Bu PDF metin tabanlı değil (taranmış görünüyor). OCR/taranmış PDF desteği yakında.');
        setUploading(null);
        return;
      }

      setUploading({ phase: 'Döküman oluşturuluyor', pct: 15 });
      const doc = await initDocument({
        agent_id: agent.id,
        title: file.name.replace(/\.pdf$/i, ''),
        file_hash: hash,
        page_count: pages.length
      });

      const PAGE_BATCH = 12;
      let processed = 0;
      for (let i = 0; i < pages.length; i += PAGE_BATCH) {
        const batch = pages.slice(i, i + PAGE_BATCH);
        const meaningful = batch.filter((p) => p.text.trim().length > 30);
        if (meaningful.length) {
          await uploadDocumentChunks({ document_id: doc.id, pages: meaningful });
        }
        processed += batch.length;
        const pct = 15 + Math.round((processed / pages.length) * 80);
        setUploading({ phase: `Embedding (${processed}/${pages.length} sayfa)`, pct });
      }

      await finalizeDocument({ document_id: doc.id });
      setUploading({ phase: 'Tamamlandı', pct: 100 });
      await refreshDocs();
      setTimeout(() => setUploading(null), 800);
    } catch (e) {
      alert(`Yükleme başarısız: ${(e as Error).message}`);
      setUploading(null);
    }
  };

  const removeDoc = async (id: string) => {
    if (!confirm('Bu dökümanı silmek istediğinize emin misiniz?')) return;
    await deleteDocument(id);
    setDocs((prev) => prev.filter((d) => d.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold">{agent.name}</h2>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-100">{agent.subject}</span>
            {!form.is_active && (
              <span className="text-xs px-2 py-0.5 rounded bg-rose-100 text-rose-700">pasif</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setEditing((v) => !v)}
              className="px-2.5 py-1 text-xs border rounded hover:bg-slate-50"
            >
              {editing ? 'İptal' : 'Düzenle'}
            </button>
            <button
              onClick={onDelete}
              className="px-2.5 py-1 text-xs border rounded text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="w-3.5 h-3.5 inline -mt-0.5" /> Sil
            </button>
          </div>
        </div>

        {editing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Ad">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full text-sm px-2 py-1.5 border rounded"
              />
            </Field>
            <Field label="Ders">
              <input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                className="w-full text-sm px-2 py-1.5 border rounded"
              />
            </Field>
            <Field label="Sınıf seviyesi">
              <input
                value={form.grade_level}
                onChange={(e) => setForm({ ...form, grade_level: e.target.value })}
                className="w-full text-sm px-2 py-1.5 border rounded"
              />
            </Field>
            <Field label="Model">
              <select
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                className="w-full text-sm px-2 py-1.5 border rounded"
              >
                <option value="gpt-4o-mini">gpt-4o-mini (ekonomik)</option>
                <option value="gpt-4o">gpt-4o (kaliteli)</option>
              </select>
            </Field>
            <Field label="Açıklama" full>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full text-sm px-2 py-1.5 border rounded"
              />
            </Field>
            <Field label="Sistem yönergesi (kişilik / kurallar)" full>
              <textarea
                value={form.system_prompt}
                onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                rows={5}
                className="w-full text-sm px-2 py-1.5 border rounded font-mono"
              />
            </Field>
            <Field label="Durum">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                Aktif (öğrencilere açık)
              </label>
            </Field>
            <div className="md:col-span-2 text-right">
              <button
                onClick={onSave}
                className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm"
              >
                Kaydet
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-600 whitespace-pre-wrap">
            {agent.description || 'Açıklama yok.'}
          </p>
        )}
      </div>

      <div className="flex border-b text-sm">
        <button
          onClick={() => setSubTab('sources')}
          className={`px-3 py-2 ${subTab === 'sources' ? 'border-b-2 border-blue-600 font-medium' : 'text-slate-500'}`}
        >
          Kaynaklar
        </button>
        <button
          onClick={() => setSubTab('questions')}
          className={`px-3 py-2 ${subTab === 'questions' ? 'border-b-2 border-blue-600 font-medium' : 'text-slate-500'}`}
        >
          Soru Havuzu
        </button>
        <button
          onClick={() => setSubTab('papers')}
          className={`px-3 py-2 ${subTab === 'papers' ? 'border-b-2 border-blue-600 font-medium' : 'text-slate-500'}`}
        >
          Denemeler
        </button>
      </div>

      {subTab === 'questions' && <QuestionPoolTab agentId={agent.id} />}
      {subTab === 'papers' && <PapersTab agentId={agent.id} />}

      {subTab === 'sources' && (
      <div className="bg-white border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <BookOpen className="w-4 h-4" /> Kaynaklar (PDF)
          </h3>
          <div className="flex gap-2">
            <button onClick={refreshDocs} className="px-2.5 py-1 text-xs border rounded">
              <RefreshCcw className="w-3.5 h-3.5 inline -mt-0.5" /> Yenile
            </button>
            <label className="px-2.5 py-1 text-xs border rounded bg-blue-600 text-white cursor-pointer">
              <Upload className="w-3.5 h-3.5 inline -mt-0.5" /> PDF Yükle
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadFile(f);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>

        {uploading && (
          <div className="mb-3 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-900">
            <div className="flex justify-between mb-1">
              <span>{uploading.phase}</span>
              <span>{uploading.pct}%</span>
            </div>
            <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
              <div className="h-2 bg-blue-600 transition-all" style={{ width: `${uploading.pct}%` }} />
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center text-slate-400 text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin inline" /> Yükleniyor…
          </div>
        ) : docs.length === 0 ? (
          <div className="text-center text-slate-400 text-sm py-8">
            Henüz kaynak yok. <span className="block mt-1">PDF yükleyerek ajanı eğitin.</span>
          </div>
        ) : (
          <div className="divide-y border rounded-lg">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between p-3 text-sm">
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-slate-400 mt-0.5" />
                  <div>
                    <div className="font-medium">{d.title}</div>
                    <div className="text-xs text-slate-500">
                      {d.page_count ? `${d.page_count} sayfa` : '—'} ·{' '}
                      {d.total_chunks} chunk · {d.total_tokens?.toLocaleString() || 0} token
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {d.status === 'ready' ? (
                    <span className="text-xs text-emerald-700 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> hazır
                    </span>
                  ) : d.status === 'failed' ? (
                    <span className="text-xs text-rose-700 inline-flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" /> hata
                    </span>
                  ) : (
                    <span className="text-xs text-amber-700">işleniyor</span>
                  )}
                  <button
                    onClick={() => removeDoc(d.id)}
                    className="p-1 rounded hover:bg-slate-100 text-rose-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  );
}

function Field(props: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={props.full ? 'md:col-span-2' : ''}>
      <div className="text-xs text-slate-500 mb-1">{props.label}</div>
      {props.children}
    </div>
  );
}

function UsagePanel() {
  const [data, setData] = useState<AIUsageSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      setData(await getUsageSummary(month || undefined));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progressPct = useMemo(() => {
    if (!data || !data.budget_usd) return 0;
    return Math.min(100, Math.round((data.totalCost / data.budget_usd) * 100));
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="px-2 py-1.5 text-sm border rounded"
        />
        <button onClick={refresh} className="px-3 py-1.5 text-sm border rounded">
          Yenile
        </button>
      </div>

      {loading && (
        <div className="text-center text-slate-400 py-8">
          <Loader2 className="w-5 h-5 animate-spin inline" /> Yükleniyor…
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <StatCard label="Ay" value={data.month} />
            <StatCard label="Toplam Mesaj" value={data.totalChats.toLocaleString()} />
            <StatCard label="Toplam Token" value={data.totalTokens.toLocaleString()} />
          </div>
          <div className="bg-white border rounded-xl p-4">
            <div className="flex justify-between text-sm mb-2">
              <span>
                Maliyet: <strong>${data.totalCost.toFixed(4)}</strong> / aylık bütçe ${data.budget_usd.toFixed(2)}
              </span>
              <span className={progressPct >= 90 ? 'text-rose-600' : ''}>{progressPct}%</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-3 ${progressPct >= 90 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <UsageTable
              title="Ajan bazında"
              rows={data.byAgent.map((r) => ({
                id: r.agent_id,
                label: r.agent_id,
                cost: r.cost,
                tokens: r.tokens,
                calls: r.calls
              }))}
            />
            <UsageTable
              title="Kullanıcı bazında"
              rows={data.byUser.map((r) => ({
                id: r.user_id,
                label: r.user_id,
                cost: r.cost,
                tokens: r.tokens,
                calls: r.calls
              }))}
            />
          </div>
        </>
      )}
    </div>
  );
}

function StatCard(props: { label: string; value: string }) {
  return (
    <div className="bg-white border rounded-xl p-4">
      <div className="text-xs text-slate-500">{props.label}</div>
      <div className="text-xl font-semibold mt-1">{props.value}</div>
    </div>
  );
}

function UsageTable(props: {
  title: string;
  rows: Array<{ id: string; label: string; cost: number; tokens: number; calls: number }>;
}) {
  const sorted = [...props.rows].sort((a, b) => b.cost - a.cost).slice(0, 20);
  return (
    <div className="bg-white border rounded-xl p-4">
      <h4 className="font-semibold mb-2">{props.title}</h4>
      {sorted.length === 0 ? (
        <div className="text-sm text-slate-400">Veri yok.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="text-left py-1">Kimlik</th>
              <th className="text-right">Çağrı</th>
              <th className="text-right">Token</th>
              <th className="text-right">USD</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-1 truncate max-w-[180px]">{r.label}</td>
                <td className="text-right">{r.calls}</td>
                <td className="text-right">{r.tokens.toLocaleString()}</td>
                <td className="text-right">${r.cost.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SettingsPanel() {
  const [s, setS] = useState({ studentMonthlyChatLimit: 100, monthlyUsdBudget: 50 });
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      setS(await getAiSettings());
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
  }, []);

  const save = async () => {
    await updateAiSettings({
      student_monthly_chat_limit: s.studentMonthlyChatLimit,
      monthly_usd_budget: s.monthlyUsdBudget
    });
    alert('Kaydedildi.');
  };

  return (
    <div className="bg-white border rounded-xl p-5 max-w-xl">
      {loading ? (
        <div className="text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin inline" /> Yükleniyor…
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Öğrenci başına aylık mesaj limiti">
            <input
              type="number"
              min={0}
              max={10000}
              value={s.studentMonthlyChatLimit}
              onChange={(e) => setS({ ...s, studentMonthlyChatLimit: Number(e.target.value) })}
              className="w-full text-sm px-2 py-1.5 border rounded"
            />
          </Field>
          <Field label="Aylık genel USD bütçesi (limit aşılırsa öğrenci sohbeti durur)">
            <input
              type="number"
              min={0}
              step={0.5}
              value={s.monthlyUsdBudget}
              onChange={(e) => setS({ ...s, monthlyUsdBudget: Number(e.target.value) })}
              className="w-full text-sm px-2 py-1.5 border rounded"
            />
          </Field>
          <div className="text-right">
            <button onClick={save} className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white">
              Kaydet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
