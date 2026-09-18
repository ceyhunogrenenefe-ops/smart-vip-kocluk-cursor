import { useEffect, useState } from 'react';
import { CalendarClock, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { rtCreateFollowUps } from '../../../lib/registrationTrackingApi';
import { STAGE_LABELS } from '../../../lib/registrationTrackingConfig';
import { TASK_TYPE_SHORT, loadFollowUpRules, planFollowUps, toLocalInput } from '../../../lib/followUpPlan';

type Step = { days: number; task_type: string; title: string; due_at: string };

/**
 * FAZ 3 — aşama değişince takip planı önerisi. Temsilci tarih/saat ve başlığı düzenleyip
 * görevleri oluşturur ya da atlar. Müşteriye hiçbir mesaj otomatik gitmez.
 */
export default function FollowUpSuggestion({
  leadId,
  stage,
  onDone,
  onDismiss
}: {
  leadId: string;
  stage: string;
  onDone: () => void;
  onDismiss: () => void;
}) {
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadFollowUpRules()
      .then((rules) => {
        if (!cancelled) setSteps(planFollowUps(stage, rules));
      })
      .catch(() => {
        if (!cancelled) setSteps([]);
      });
    return () => {
      cancelled = true;
    };
  }, [stage]);

  if (!steps || !steps.length) return null;

  const create = async () => {
    setBusy(true);
    try {
      const res = await rtCreateFollowUps({ lead_id: leadId, stage, steps });
      const n = res.data.created.length;
      toast.success(
        `${n} takip görevi oluşturuldu${res.data.cancelled ? ` · ${res.data.cancelled} eski otomatik takip iptal edildi` : ''}`
      );
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Görevler oluşturulamadı');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-3 text-sm dark:border-sky-900 dark:bg-sky-950/30">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 font-semibold text-sky-900 dark:text-sky-200">
          <CalendarClock className="h-4 w-4" />
          “{STAGE_LABELS[stage] || stage}” için önerilen takip
        </p>
        <button type="button" onClick={onDismiss} aria-label="Kapat" className="rounded p-0.5 text-sky-700 hover:bg-sky-100">
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="grid grid-cols-[3.5rem_1fr_11rem] items-center gap-2">
            <span className="rounded-md bg-white px-1.5 py-0.5 text-center text-[11px] font-semibold text-sky-800 ring-1 ring-sky-200">
              {TASK_TYPE_SHORT[s.task_type] || 'Görev'}
            </span>
            <input
              value={s.title}
              onChange={(e) =>
                setSteps((prev) => prev!.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
              }
              className="min-w-0 rounded border border-sky-200 bg-white px-2 py-1 text-xs"
              aria-label="Görev başlığı"
            />
            <input
              type="datetime-local"
              value={toLocalInput(s.due_at)}
              onChange={(e) =>
                e.target.value &&
                setSteps((prev) =>
                  prev!.map((x, j) => (j === i ? { ...x, due_at: new Date(e.target.value).toISOString() } : x))
                )
              }
              className="rounded border border-sky-200 bg-white px-1.5 py-1 text-xs"
              aria-label="Tarih ve saat"
            />
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void create()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5" />}
          {steps.length > 1 ? `${steps.length} takip görevini oluştur` : 'Takip görevini oluştur'}
        </button>
        <button type="button" onClick={onDismiss} className="rounded-lg px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100">
          Şimdi değil
        </button>
      </div>
      <p className="mt-2 text-[11px] text-sky-800/80">
        Görevler sorumlu temsilciye açılır; saatinden 5 dk önce hatırlatma gelir. Müşteri yeniden yazarsa bekleyen
        takipler “yeniden değerlendir” olarak işaretlenir.
      </p>
    </div>
  );
}
