import { useCallback, useEffect, useState } from 'react';
import { Bot, Hand, Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { aiConversationState, aiHandover, aiResume, type AiConversationState } from '../../lib/crmAiAssistantApi';

const STATE_LABEL: Record<string, string> = {
  active: 'AI asistan yanıtlıyor',
  completed: 'AI asistan randevuyu oluşturdu',
  handover: 'İnsan temsilcide (bot sustu)'
};

/**
 * Gelen kutusunda konuşma şeridi: AI asistanın durumu, toplanan bilgiler,
 * özet ve "İnsana devret" / "Botu yeniden başlat" düğmeleri.
 */
export default function CrmAiConversationBar({ conversationId, refreshKey }: { conversationId: string; refreshKey?: unknown }) {
  const [state, setState] = useState<AiConversationState | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    aiConversationState(conversationId)
      .then(setState)
      .catch(() => setState(null));
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (!state || (!state.data && !state.module_active)) return null;
  const s = state.data;
  const collected = s?.collected
    ? Object.entries(s.collected).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    : [];

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 text-xs text-slate-700">
      <div className="flex flex-wrap items-center gap-2">
        <Bot className="h-4 w-4 text-violet-700" />
        <span className="font-semibold text-slate-900">{s ? STATE_LABEL[s.state] || s.state : 'AI asistan bu sohbette henüz yazmadı'}</span>
        {s?.appointment_at ? (
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">
            📞 {new Date(s.appointment_at).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        ) : null}
        <span className="ml-auto flex gap-1">
          {s?.state !== 'handover' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act(() => aiHandover(conversationId), 'Bot bu sohbette durduruldu')}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Hand className="h-3 w-3" />} İnsana devret
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act(() => aiResume(conversationId), 'Bot yeniden başlatıldı')}
              className="inline-flex items-center gap-1 rounded-lg border border-violet-300 bg-white px-2 py-1 text-[11px] font-semibold text-violet-800 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Botu yeniden başlat
            </button>
          )}
        </span>
      </div>
      {s?.handover_reason && s.state === 'handover' ? <p className="mt-1 text-slate-500">Neden: {s.handover_reason}</p> : null}
      {collected.length ? (
        <p className="mt-1">
          {collected.map(([k, v]) => (
            <span key={k} className="mr-2">
              <span className="text-slate-500">{k}:</span> {String(v)}
            </span>
          ))}
        </p>
      ) : null}
      {s?.summary ? <p className="mt-1 whitespace-pre-wrap text-slate-600">{s.summary}</p> : null}
    </div>
  );
}
