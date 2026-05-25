import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  Loader2,
  Send,
  FileText,
  Users,
  BarChart3,
  X,
  CheckCircle2,
  XCircle,
  Sparkles
} from 'lucide-react';
import {
  assignPaper,
  createPaper,
  deletePaper,
  listPapers,
  listQuestions,
  paperAssignments,
  updatePaper
} from '../../../lib/aiAgents/aiExamsApi';
import { apiFetch } from '../../../lib/session';
import type { ExamAssignmentForPaper, ExamPaper, ExamQuestion } from '../../../types/aiExams.types';

interface Props {
  agentId: string;
}

export default function PapersTab({ agentId }: Props) {
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [loading, setLoading] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [openResultsFor, setOpenResultsFor] = useState<ExamPaper | null>(null);
  const [openAssignFor, setOpenAssignFor] = useState<ExamPaper | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      setPapers(await listPapers(agentId));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const remove = async (id: string) => {
    if (!confirm('Bu denemeyi silmek istediğine emin misin?')) return;
    await deletePaper(id);
    setPapers((prev) => prev.filter((p) => p.id !== id));
  };

  const togglePublish = async (p: ExamPaper) => {
    const next = p.status === 'published' ? 'draft' : 'published';
    const updated = await updatePaper({ id: p.id, status: next });
    setPapers((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Denemeler</h3>
        <button
          onClick={() => setShowBuilder(true)}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm inline-flex items-center gap-1"
        >
          <Plus className="w-4 h-4" /> Yeni Deneme
        </button>
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-6">
          <Loader2 className="w-5 h-5 animate-spin inline" /> Yükleniyor…
        </div>
      ) : papers.length === 0 ? (
        <div className="bg-white border rounded-xl p-6 text-center text-slate-500 text-sm">
          Henüz deneme yok. Soru havuzundan onaylı sorularla yeni deneme oluştur.
        </div>
      ) : (
        <div className="space-y-2">
          {papers.map((p) => (
            <div key={p.id} className="bg-white border rounded-xl p-3 flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span className="truncate">{p.title}</span>
                  {p.status === 'published' ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">yayında</span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">taslak</span>
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {p.question_count} soru · {p.duration_minutes} dk · {p.total_score} puan
                  {p.description ? ` · ${p.description.slice(0, 60)}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => togglePublish(p)}
                  className="px-2 py-1 text-xs border rounded hover:bg-slate-50"
                >
                  {p.status === 'published' ? 'Geri çek' : 'Yayınla'}
                </button>
                <button
                  onClick={() => setOpenAssignFor(p)}
                  className="px-2 py-1 text-xs border rounded hover:bg-blue-50 text-blue-700 inline-flex items-center gap-1"
                >
                  <Send className="w-3 h-3" /> Ata
                </button>
                <button
                  onClick={() => setOpenResultsFor(p)}
                  className="px-2 py-1 text-xs border rounded hover:bg-slate-50 inline-flex items-center gap-1"
                >
                  <BarChart3 className="w-3 h-3" /> Sonuçlar
                </button>
                <button
                  onClick={() => remove(p.id)}
                  className="p-1.5 rounded text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showBuilder && (
        <PaperBuilder
          agentId={agentId}
          onClose={() => setShowBuilder(false)}
          onCreated={(p) => {
            setPapers((prev) => [p, ...prev]);
            setShowBuilder(false);
          }}
        />
      )}
      {openAssignFor && (
        <AssignModal paper={openAssignFor} onClose={() => setOpenAssignFor(null)} />
      )}
      {openResultsFor && (
        <ResultsModal paper={openResultsFor} onClose={() => setOpenResultsFor(null)} />
      )}
    </div>
  );
}

function PaperBuilder(props: {
  agentId: string;
  onClose: () => void;
  onCreated: (p: ExamPaper) => void;
}) {
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(60);
  const [totalScore, setTotalScore] = useState(100);
  const [busy, setBusy] = useState(false);

  /** auto */
  const [count, setCount] = useState(20);
  const [topics, setTopics] = useState<string[]>([]);
  const [diffMix, setDiffMix] = useState({ kolay: 5, orta: 10, zor: 5 });

  /** manuel */
  const [approvedQuestions, setApprovedQuestions] = useState<ExamQuestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const [availableTopics, setAvailableTopics] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const rows = await listQuestions({ agent_id: props.agentId, status: 'approved' });
      setApprovedQuestions(rows);
      const t = new Set<string>();
      rows.forEach((r) => r.topic && t.add(r.topic));
      setAvailableTopics(Array.from(t).sort());
    })();
  }, [props.agentId]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return approvedQuestions.filter((q) => {
      if (s && !q.question_text.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [approvedQuestions, search]);

  const submit = async () => {
    if (!title.trim()) return alert('Deneme adı gerekli.');
    setBusy(true);
    try {
      const payload =
        mode === 'auto'
          ? {
              agent_id: props.agentId,
              title: title.trim(),
              description: description.trim() || undefined,
              duration_minutes: duration,
              total_score: totalScore,
              auto: { count, topics, difficulty_mix: diffMix },
              status: 'draft' as const
            }
          : {
              agent_id: props.agentId,
              title: title.trim(),
              description: description.trim() || undefined,
              duration_minutes: duration,
              total_score: totalScore,
              question_ids: Array.from(selected),
              status: 'draft' as const
            };
      const created = await createPaper(payload);
      if (mode === 'auto' && created.question_count === 0) {
        alert('Uyarı: kriterlere uyan onaylı soru bulunamadı. Önce soru havuzundan soruları onaylamayı dene.');
      }
      props.onCreated(created);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="font-semibold">Yeni Deneme Oluştur</h3>
          <button onClick={props.onClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="md:col-span-2">
              <label className="text-xs text-slate-500">Deneme adı</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Fizik TYT Deneme 1"
                className="w-full text-sm px-2 py-1.5 border rounded"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Süre (dk)</label>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value) || 60)}
                className="w-full text-sm px-2 py-1.5 border rounded"
              />
            </div>
            <div className="md:col-span-3">
              <label className="text-xs text-slate-500">Açıklama (opsiyonel)</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full text-sm px-2 py-1.5 border rounded"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Toplam puan</label>
              <input
                type="number"
                value={totalScore}
                onChange={(e) => setTotalScore(Number(e.target.value) || 100)}
                className="w-full text-sm px-2 py-1.5 border rounded"
              />
            </div>
          </div>

          <div className="flex gap-2 border-b">
            <button
              onClick={() => setMode('auto')}
              className={`px-3 py-2 text-sm ${mode === 'auto' ? 'border-b-2 border-blue-600 font-medium' : ''}`}
            >
              <Sparkles className="w-4 h-4 inline -mt-0.5 mr-1" /> Otomatik Seçim
            </button>
            <button
              onClick={() => setMode('manual')}
              className={`px-3 py-2 text-sm ${mode === 'manual' ? 'border-b-2 border-blue-600 font-medium' : ''}`}
            >
              Manuel Seçim ({selected.size})
            </button>
          </div>

          {mode === 'auto' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500">Toplam soru sayısı (zorluk dağılımı verirsen onlar geçerli olur)</label>
                <input
                  type="number"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value) || 20)}
                  className="w-full text-sm px-2 py-1.5 border rounded"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-slate-500">Kolay</label>
                  <input
                    type="number"
                    value={diffMix.kolay}
                    onChange={(e) => setDiffMix({ ...diffMix, kolay: Number(e.target.value) || 0 })}
                    className="w-full text-sm px-2 py-1.5 border rounded"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Orta</label>
                  <input
                    type="number"
                    value={diffMix.orta}
                    onChange={(e) => setDiffMix({ ...diffMix, orta: Number(e.target.value) || 0 })}
                    className="w-full text-sm px-2 py-1.5 border rounded"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Zor</label>
                  <input
                    type="number"
                    value={diffMix.zor}
                    onChange={(e) => setDiffMix({ ...diffMix, zor: Number(e.target.value) || 0 })}
                    className="w-full text-sm px-2 py-1.5 border rounded"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500">Konular (seçilmezse tüm konular)</label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {availableTopics.map((t) => (
                    <button
                      key={t}
                      onClick={() =>
                        setTopics((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
                      }
                      className={`text-xs px-2 py-1 rounded border ${topics.includes(t) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-slate-50'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {!availableTopics.length && (
                  <p className="text-xs text-amber-700 mt-1">
                    ⚠ Henüz onaylı soru yok. Önce soru havuzunda soruları onaylaman gerek.
                  </p>
                )}
              </div>
            </div>
          )}

          {mode === 'manual' && (
            <div className="space-y-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Soru ara…"
                className="w-full text-sm px-2 py-1.5 border rounded"
              />
              <div className="border rounded-lg max-h-72 overflow-y-auto">
                {filtered.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 text-sm">Onaylı soru bulunamadı.</div>
                ) : (
                  filtered.map((q) => {
                    const checked = selected.has(q.id);
                    return (
                      <label
                        key={q.id}
                        className={`flex items-start gap-2 p-2 border-b cursor-pointer text-sm ${checked ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(q.id)) next.delete(q.id);
                              else next.add(q.id);
                              return next;
                            });
                          }}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="line-clamp-2">{q.question_text}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {q.topic || 'konu yok'} · {q.difficulty || 'orta'}
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
              <div className="text-xs text-slate-500">{selected.size} soru seçildi.</div>
            </div>
          )}
        </div>

        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={props.onClose} className="px-3 py-1.5 text-sm border rounded">
            İptal
          </button>
          <button
            onClick={submit}
            disabled={busy || !title.trim()}
            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white disabled:opacity-50"
          >
            {busy ? 'Oluşturuluyor…' : 'Oluştur'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignModal(props: { paper: ExamPaper; onClose: () => void }) {
  const [users, setUsers] = useState<Array<{ id: string; name: string; email?: string }>>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await apiFetch('/api/users?role=student');
        const j = await res.json();
        const rows: Array<{ id: string; name: string; email?: string }> = Array.isArray(j?.data)
          ? j.data
          : Array.isArray(j)
          ? j
          : [];
        setUsers(rows.map((u) => ({ id: u.id, name: u.name || u.email || u.id, email: u.email })));
      } catch (e) {
        console.warn('users fetch failed', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return users;
    return users.filter((u) => u.name.toLowerCase().includes(s) || (u.email || '').toLowerCase().includes(s));
  }, [users, search]);

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((u) => u.id)));
  };

  const submit = async () => {
    if (!selected.size) return alert('Öğrenci seç.');
    setBusy(true);
    try {
      const r = await assignPaper({ paper_id: props.paper.id, student_user_ids: Array.from(selected) });
      setDone(r.assigned);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b flex justify-between items-center">
          <div>
            <h3 className="font-semibold">Öğrencilere Ata</h3>
            <div className="text-xs text-slate-500">{props.paper.title}</div>
          </div>
          <button onClick={props.onClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {done !== null ? (
          <div className="p-6 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <p>{done} öğrenciye atandı.</p>
            <button onClick={props.onClose} className="mt-3 px-3 py-1.5 text-sm bg-blue-600 text-white rounded">
              Kapat
            </button>
          </div>
        ) : (
          <div className="p-4 space-y-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Öğrenci ara…"
              className="w-full text-sm px-2 py-1.5 border rounded"
            />
            <div className="flex justify-between text-xs text-slate-500">
              <button onClick={toggleAll} className="underline">
                {selected.size === filtered.length ? 'Hiçbirini seçme' : 'Tümünü seç'}
              </button>
              <span>{selected.size} öğrenci seçili</span>
            </div>
            {loading ? (
              <div className="text-center py-6 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin inline" />
              </div>
            ) : (
              <div className="border rounded-lg max-h-72 overflow-y-auto">
                {filtered.map((u) => {
                  const checked = selected.has(u.id);
                  return (
                    <label
                      key={u.id}
                      className={`flex items-center gap-2 p-2 border-b cursor-pointer text-sm ${checked ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(u.id)) next.delete(u.id);
                            else next.add(u.id);
                            return next;
                          });
                        }}
                      />
                      <div>
                        <div>{u.name}</div>
                        {u.email && <div className="text-xs text-slate-500">{u.email}</div>}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
            <div className="text-right">
              <button
                onClick={submit}
                disabled={busy || !selected.size}
                className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white disabled:opacity-50"
              >
                {busy ? 'Atanıyor…' : `Atama (${selected.size})`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultsModal(props: { paper: ExamPaper; onClose: () => void }) {
  const [rows, setRows] = useState<ExamAssignmentForPaper[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setRows(await paperAssignments(props.paper.id));
      } finally {
        setLoading(false);
      }
    })();
  }, [props.paper.id]);

  const stats = useMemo(() => {
    const completed = rows.filter((r) => r.attempt?.status === 'graded');
    const avg = completed.length
      ? completed.reduce((s, r) => s + Number(r.attempt?.score || 0), 0) / completed.length
      : 0;
    return {
      assigned: rows.length,
      completed: completed.length,
      avg: Number(avg.toFixed(2))
    };
  }, [rows]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b flex justify-between items-center">
          <div>
            <h3 className="font-semibold">{props.paper.title} — Sonuçlar</h3>
            <div className="text-xs text-slate-500">
              {stats.completed}/{stats.assigned} tamamladı · ortalama {stats.avg}
            </div>
          </div>
          <button onClick={props.onClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="text-center text-slate-400 py-6">
              <Loader2 className="w-5 h-5 animate-spin inline" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center text-slate-500 py-6">Henüz atama yok.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="text-left py-1">Öğrenci</th>
                  <th className="text-center">Durum</th>
                  <th className="text-right">Doğru</th>
                  <th className="text-right">Yanlış</th>
                  <th className="text-right">Boş</th>
                  <th className="text-right">Puan</th>
                  <th className="text-right">Süre</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const a = r.attempt;
                  const dur = a?.duration_seconds
                    ? `${Math.floor(a.duration_seconds / 60)}dk ${a.duration_seconds % 60}sn`
                    : '-';
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="py-1.5">
                        <div>{r.student?.name || r.student_user_id}</div>
                        {r.student?.email && <div className="text-xs text-slate-400">{r.student.email}</div>}
                      </td>
                      <td className="text-center">
                        {a?.status === 'graded' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 inline" />
                        ) : a?.status === 'in_progress' ? (
                          <Loader2 className="w-4 h-4 text-amber-500 inline animate-spin" />
                        ) : (
                          <XCircle className="w-4 h-4 text-slate-300 inline" />
                        )}
                      </td>
                      <td className="text-right">{a?.correct_count ?? '-'}</td>
                      <td className="text-right">{a?.wrong_count ?? '-'}</td>
                      <td className="text-right">{a?.empty_count ?? '-'}</td>
                      <td className="text-right font-medium">{a?.score ?? '-'}</td>
                      <td className="text-right text-xs text-slate-500">{dur}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
