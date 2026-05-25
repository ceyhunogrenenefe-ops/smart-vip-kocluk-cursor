import React, { useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Edit3,
  Trash2,
  Sparkles,
  Filter,
  X
} from 'lucide-react';
import {
  deleteQuestion,
  extractQuestionsFromAgent,
  listQuestions,
  updateQuestion
} from '../../../lib/aiAgents/aiExamsApi';
import type { ExamQuestion } from '../../../types/aiExams.types';
import QuestionImageView from '../components/QuestionImageView';

interface Props {
  agentId: string;
}

export default function QuestionPoolTab({ agentId }: Props) {
  const [items, setItems] = useState<ExamQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractMsg, setExtractMsg] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('draft');
  const [topicFilter, setTopicFilter] = useState<string>('');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('');
  const [editing, setEditing] = useState<ExamQuestion | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const rows = await listQuestions({
        agent_id: agentId,
        status: statusFilter || undefined,
        topic: topicFilter || undefined,
        difficulty: difficultyFilter || undefined
      });
      setItems(rows);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, statusFilter, topicFilter, difficultyFilter]);

  const topics = useMemo(() => {
    const s = new Set<string>();
    items.forEach((q) => q.topic && s.add(q.topic));
    return Array.from(s).sort();
  }, [items]);

  const runExtraction = async () => {
    if (!confirm('AI tüm PDF kaynaklarını tarayarak soruları çıkarmaya başlasın mı? Pencereyi kapatmayın.')) return;
    setExtracting(true);
    setExtractMsg(null);

    let offset = 0;
    let total = 0;
    let totalInserted = 0;
    let totalParsed = 0;
    let totalLowConf = 0;
    let totalDuplicates = 0;
    let totalCost = 0;
    let firstError: string | null = null;
    let chunksWithOptions = 0;
    let chunksWithQmark = 0;

    try {
      while (true) {
        const r = await extractQuestionsFromAgent({ agent_id: agentId, offset, limit: 24 });
        total = r.total || 0;
        totalInserted += r.inserted;
        totalParsed += r.parsed;
        totalLowConf += r.low_confidence || 0;
        totalDuplicates += r.duplicates || 0;
        totalCost += r.cost_usd;
        chunksWithOptions += r.chunks_with_options || 0;
        chunksWithQmark += r.chunks_with_qmark || 0;
        if (!firstError && r.batch_errors && r.batch_errors.length) {
          firstError = r.batch_errors[0];
        }

        const pct = total ? Math.round((r.processed / total) * 100) : 0;
        setExtractMsg(
          `İşleniyor… ${r.processed}/${total} parça (%${pct}) · ${totalInserted} soru havuza eklendi · maliyet $${totalCost.toFixed(4)}`
        );

        if (r.done) break;
        offset = r.next_offset ?? r.processed;
      }

      const lines: string[] = [];
      lines.push(
        `✓ Tarama tamamlandı — ${total} parça tarandı, AI ${totalParsed} soru buldu, ${totalInserted} havuza eklendi.`
      );
      if (totalLowConf) lines.push(`Düşük güvenli (atlandı): ${totalLowConf}`);
      if (totalDuplicates) lines.push(`Tekrarlanan (atlandı): ${totalDuplicates}`);
      lines.push(
        `İçerik analizi: ${chunksWithQmark} parçada soru işareti, ${chunksWithOptions} parçada A) B) C) şık formatı bulundu.`
      );
      if (totalInserted === 0 && totalParsed === 0) {
        if (chunksWithOptions === 0) {
          lines.push(
            '\n⚠ PDF\'lerinizde çoktan seçmeli soru yapısı (A) B) C)) bulunmadı. Bu kaynaklar konu anlatımı olabilir.'
          );
        } else {
          lines.push('\n⚠ AI sorular tespit edemedi. Formatlar atipik olabilir.');
        }
      }
      if (firstError) {
        lines.push(`\n⚠ Bazı batch hatası: ${firstError}`);
      }
      lines.push(`\nToplam maliyet: $${totalCost.toFixed(4)}`);
      setExtractMsg(lines.join('\n'));
      await refresh();
    } catch (e) {
      setExtractMsg(
        `Hata: ${(e as Error).message}\n${totalInserted ? `(O ana kadar ${totalInserted} soru eklendi)` : ''}`
      );
      await refresh();
    } finally {
      setExtracting(false);
    }
  };

  const setStatus = async (id: string, status: 'approved' | 'rejected') => {
    await updateQuestion({ id, status });
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
  };

  const remove = async (id: string) => {
    if (!confirm('Bu soruyu silmek istediğine emin misin?')) return;
    await deleteQuestion(id);
    setItems((prev) => prev.filter((p) => p.id !== id));
  };

  const summary = useMemo(() => {
    return {
      total: items.length,
      approved: items.filter((q) => q.status === 'approved').length,
      draft: items.filter((q) => q.status === 'draft').length,
      rejected: items.filter((q) => q.status === 'rejected').length
    };
  }, [items]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-600">Soru havuzu:</span>
          <Badge color="slate" label={`Toplam ${summary.total}`} />
          <Badge color="amber" label={`Taslak ${summary.draft}`} />
          <Badge color="emerald" label={`Onaylı ${summary.approved}`} />
          <Badge color="rose" label={`Red ${summary.rejected}`} />
        </div>
        <button
          onClick={runExtraction}
          disabled={extracting}
          className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-sm inline-flex items-center gap-1 disabled:opacity-50"
        >
          {extracting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Sorular çıkartılıyor…
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" /> AI ile soruları çıkar
            </>
          )}
        </button>
      </div>

      {extractMsg && (
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-900 whitespace-pre-wrap">
          {extractMsg}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap text-sm">
        <Filter className="w-4 h-4 text-slate-400" />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-2 py-1 border rounded"
        >
          <option value="">Tüm durumlar</option>
          <option value="draft">Taslak (onay bekliyor)</option>
          <option value="approved">Onaylı</option>
          <option value="rejected">Reddedildi</option>
        </select>
        <select
          value={topicFilter}
          onChange={(e) => setTopicFilter(e.target.value)}
          className="px-2 py-1 border rounded"
        >
          <option value="">Tüm konular</option>
          {topics.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={difficultyFilter}
          onChange={(e) => setDifficultyFilter(e.target.value)}
          className="px-2 py-1 border rounded"
        >
          <option value="">Tüm zorluklar</option>
          <option value="kolay">Kolay</option>
          <option value="orta">Orta</option>
          <option value="zor">Zor</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-8">
          <Loader2 className="w-5 h-5 animate-spin inline" /> Yükleniyor…
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white border rounded-xl p-8 text-center text-slate-500">
          Henüz soru yok. PDF'leri yükledikten sonra <strong>"AI ile soruları çıkar"</strong> butonuna bas.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((q) => (
            <QuestionCard
              key={q.id}
              q={q}
              onApprove={() => setStatus(q.id, 'approved')}
              onReject={() => setStatus(q.id, 'rejected')}
              onDelete={() => remove(q.id)}
              onEdit={() => setEditing(q)}
            />
          ))}
        </div>
      )}

      {editing && (
        <EditModal
          question={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setItems((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function Badge(props: { color: 'slate' | 'amber' | 'emerald' | 'rose'; label: string }) {
  const map = {
    slate: 'bg-slate-100 text-slate-700',
    amber: 'bg-amber-100 text-amber-800',
    emerald: 'bg-emerald-100 text-emerald-800',
    rose: 'bg-rose-100 text-rose-800'
  };
  return <span className={`px-2 py-0.5 rounded text-xs ${map[props.color]}`}>{props.label}</span>;
}

function QuestionCard(props: {
  q: ExamQuestion;
  onApprove: () => void;
  onReject: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const { q } = props;
  return (
    <div className="bg-white border rounded-xl p-3">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap text-xs">
            {q.topic && <Badge color="slate" label={q.topic} />}
            {q.difficulty && <Badge color="amber" label={q.difficulty} />}
            {q.page_no && <span className="text-slate-400">sayfa {q.page_no}</span>}
            {q.ai_confidence && (
              <span className="text-slate-400">güven {Math.round((q.ai_confidence || 0) * 100)}%</span>
            )}
            {q.status === 'approved' && <Badge color="emerald" label="onaylı" />}
            {q.status === 'rejected' && <Badge color="rose" label="reddedildi" />}
            {q.status === 'draft' && <Badge color="amber" label="taslak" />}
            <QuestionImageView url={q.page_image_url} pageNo={q.page_no} />
          </div>
          <div className="text-sm font-medium whitespace-pre-wrap mb-2">{q.question_text}</div>
          <div className="space-y-1">
            {q.options.map((opt, i) => {
              const letter = String.fromCharCode(65 + i);
              const isAns = String(q.answer_key || '').trim().toUpperCase() === letter;
              return (
                <div
                  key={i}
                  className={`text-sm px-2 py-1 rounded ${isAns ? 'bg-emerald-50 border border-emerald-200 font-medium' : 'bg-slate-50'}`}
                >
                  <span className="font-mono mr-2">{letter})</span>
                  {opt}
                </div>
              );
            })}
          </div>
          {q.solution && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-slate-500">Çözüm</summary>
              <div className="mt-1 p-2 rounded bg-slate-50 whitespace-pre-wrap">{q.solution}</div>
            </details>
          )}
        </div>
        <div className="flex flex-col gap-1">
          {q.status !== 'approved' && (
            <button
              onClick={props.onApprove}
              title="Onayla"
              className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600"
            >
              <CheckCircle2 className="w-4 h-4" />
            </button>
          )}
          {q.status !== 'rejected' && (
            <button
              onClick={props.onReject}
              title="Reddet"
              className="p-1.5 rounded hover:bg-rose-50 text-rose-600"
            >
              <XCircle className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={props.onEdit}
            title="Düzenle"
            className="p-1.5 rounded hover:bg-slate-100"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          <button
            onClick={props.onDelete}
            title="Sil"
            className="p-1.5 rounded hover:bg-rose-50 text-rose-600"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function EditModal(props: {
  question: ExamQuestion;
  onClose: () => void;
  onSaved: (q: ExamQuestion) => void;
}) {
  const [form, setForm] = useState({
    question_text: props.question.question_text,
    options: [...props.question.options],
    answer_key: props.question.answer_key || '',
    solution: props.question.solution || '',
    topic: props.question.topic || '',
    difficulty: props.question.difficulty || 'orta'
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const updated = await updateQuestion({
        id: props.question.id,
        ...form,
        difficulty: form.difficulty as 'kolay' | 'orta' | 'zor'
      });
      props.onSaved(updated);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="font-semibold">Soruyu düzenle</h3>
          <button onClick={props.onClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs text-slate-500">Soru metni</label>
            <textarea
              value={form.question_text}
              onChange={(e) => setForm({ ...form, question_text: e.target.value })}
              rows={3}
              className="w-full text-sm px-2 py-1.5 border rounded"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Şıklar</label>
            {form.options.map((opt, i) => (
              <div key={i} className="flex gap-2 mt-1">
                <span className="px-2 py-1.5 text-sm bg-slate-100 rounded font-mono">
                  {String.fromCharCode(65 + i)})
                </span>
                <input
                  value={opt}
                  onChange={(e) => {
                    const next = [...form.options];
                    next[i] = e.target.value;
                    setForm({ ...form, options: next });
                  }}
                  className="flex-1 text-sm px-2 py-1.5 border rounded"
                />
                <button
                  onClick={() =>
                    setForm({ ...form, options: form.options.filter((_, j) => j !== i) })
                  }
                  className="px-2 text-rose-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              onClick={() => setForm({ ...form, options: [...form.options, ''] })}
              className="mt-1 text-xs px-2 py-1 border rounded"
            >
              + Şık ekle
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-slate-500">Doğru cevap (A-E)</label>
              <input
                value={form.answer_key}
                onChange={(e) => setForm({ ...form, answer_key: e.target.value.toUpperCase().slice(0, 1) })}
                className="w-full text-sm px-2 py-1.5 border rounded"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Konu</label>
              <input
                value={form.topic}
                onChange={(e) => setForm({ ...form, topic: e.target.value })}
                className="w-full text-sm px-2 py-1.5 border rounded"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Zorluk</label>
              <select
                value={form.difficulty}
                onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
                className="w-full text-sm px-2 py-1.5 border rounded"
              >
                <option value="kolay">Kolay</option>
                <option value="orta">Orta</option>
                <option value="zor">Zor</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500">Çözüm</label>
            <textarea
              value={form.solution}
              onChange={(e) => setForm({ ...form, solution: e.target.value })}
              rows={4}
              className="w-full text-sm px-2 py-1.5 border rounded"
            />
          </div>
        </div>
        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={props.onClose} className="px-3 py-1.5 text-sm border rounded">
            İptal
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white disabled:opacity-50"
          >
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}
