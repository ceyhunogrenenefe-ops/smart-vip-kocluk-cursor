import { useEffect, useState } from 'react';
import { Loader2, Plus, Save, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { aiQuickAnswerDelete, aiQuickAnswerSave, aiQuickAnswers, type AiQuickAnswer } from '../../lib/crmAiAssistantApi';

const input =
  'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-600 focus:outline-none';
const btn =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';

type Draft = { id?: string; patternsText: string; answer: string; first_message_only: boolean; is_active: boolean; hit_count?: number };

const toDraft = (a: AiQuickAnswer): Draft => ({
  id: a.id,
  patternsText: (a.patterns || []).join('\n'),
  answer: a.answer,
  first_message_only: a.first_message_only,
  is_active: a.is_active,
  hit_count: a.hit_count
});

/**
 * Hazır cevaplar: sık gelen mesajlara model çağırmadan cevap verir (token harcamaz).
 * Eşleşme birebirdir (büyük/küçük harf, noktalama ve emoji fark etmez).
 */
export default function CrmAiQuickAnswers() {
  const [rows, setRows] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    aiQuickAnswers()
      .then((r) => {
        setRows(r.data.map(toDraft));
        setMissing(Boolean(r.table_missing));
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Hazır cevaplar okunamadı'))
      .finally(() => setLoading(false));
  }, []);

  const set = (i: number, p: Partial<Draft>) => setRows((x) => x.map((r, j) => (j === i ? { ...r, ...p } : r)));

  const save = async (i: number) => {
    const r = rows[i];
    setBusy(`s${i}`);
    try {
      const res = await aiQuickAnswerSave({
        id: r.id,
        patterns: r.patternsText.split('\n').map((s) => s.trim()).filter(Boolean),
        answer: r.answer,
        first_message_only: r.first_message_only,
        is_active: r.is_active
      });
      set(i, toDraft(res.data));
      toast.success('Hazır cevap kaydedildi');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (i: number) => {
    const r = rows[i];
    if (r.id) {
      setBusy(`d${i}`);
      try {
        await aiQuickAnswerDelete(r.id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Silinemedi');
        setBusy(null);
        return;
      }
      setBusy(null);
    }
    setRows((x) => x.filter((_, j) => j !== i));
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        <Zap className="h-4 w-4 text-amber-500" /> Hazır cevaplar (token harcamaz)
      </h3>
      <p className="mb-3 text-[11px] text-slate-500">
        Müşteri aşağıdaki mesajlardan birini aynen yazarsa (harf, noktalama ve emoji fark etmez) asistan modeli çağırmadan bu cevabı gönderir.
        Yalnız her seferinde aynı cevabı verdiğiniz sorular için kullanın; sınıfa veya duruma göre değişen sorular asistanda kalsın.
      </p>
      {loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
      {missing ? (
        <p className="mb-2 rounded-md bg-amber-50 p-2 text-[11px] text-amber-800">Tablo yok: sql/2026-11-28-crm-ai-quick-answers.sql çalıştırılmalı.</p>
      ) : null}
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={r.id || `yeni-${i}`} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
            <label className="block text-[11px] font-semibold text-slate-600">
              Müşteri mesajı (her satıra bir varyant)
              <textarea className={`${input} h-20`} value={r.patternsText} onChange={(e) => set(i, { patternsText: e.target.value })} />
            </label>
            <label className="mt-2 block text-[11px] font-semibold text-slate-600">
              Gönderilecek cevap
              <textarea className={`${input} h-28`} value={r.answer} onChange={(e) => set(i, { answer: e.target.value })} />
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-700">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={r.first_message_only} onChange={(e) => set(i, { first_message_only: e.target.checked })} />
                Yalnız ilk mesajda
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={r.is_active} onChange={(e) => set(i, { is_active: e.target.checked })} />
                Açık
              </label>
              {r.id ? <span className="text-[11px] text-slate-500">{r.hit_count || 0} kez kullanıldı</span> : null}
              <span className="ml-auto flex gap-2">
                <button type="button" className={btn} disabled={busy !== null} onClick={() => void save(i)}>
                  {busy === `s${i}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Kaydet
                </button>
                <button type="button" className={btn} disabled={busy !== null} onClick={() => void remove(i)} aria-label="Hazır cevabı sil">
                  <Trash2 className="h-3.5 w-3.5 text-slate-500" />
                </button>
              </span>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className={`${btn} mt-3`}
        onClick={() => setRows((x) => [...x, { patternsText: '', answer: '', first_message_only: true, is_active: true }])}
      >
        <Plus className="h-3.5 w-3.5" /> Hazır cevap ekle
      </button>
    </div>
  );
}
