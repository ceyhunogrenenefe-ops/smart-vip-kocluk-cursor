import { useEffect, useState } from 'react';
import { CalendarClock, Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  rtGetFollowUpRules,
  rtSaveFollowUpRules,
  type FollowUpRules,
  type FollowUpStep
} from '../../lib/registrationTrackingApi';
import { STAGE_LABELS } from '../../lib/registrationTrackingConfig';
import { clearFollowUpRulesCache } from '../../lib/followUpPlan';

const TYPE_OPTIONS = [
  { id: 'call_parent', label: 'Ara' },
  { id: 'whatsapp', label: 'Mesaj gönder' },
  { id: 'payment_followup', label: 'Ödeme kontrolü' },
  { id: 're_evaluate', label: 'Yeniden değerlendir' },
  { id: 'other', label: 'Hatırlat' }
];

/** Plan tanımlanabilecek (açık) aşamalar */
const EDITABLE_STAGES = Object.keys(STAGE_LABELS).filter((s) => !['confirmed', 'lost', 'new_lead'].includes(s));

/** FAZ 3 — yönetici: aşamaya göre takip planı (gün, tür, başlık) */
export default function CrmFollowUpRulesPanel() {
  const [rules, setRules] = useState<FollowUpRules | null>(null);
  const [defaults, setDefaults] = useState<FollowUpRules>({});
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<string | null>('spouse_discussion');

  useEffect(() => {
    rtGetFollowUpRules()
      .then((r) => {
        setRules(r.data.rules);
        setDefaults(r.data.defaults);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Takip planları alınamadı'));
  }, []);

  const setSteps = (stage: string, steps: FollowUpStep[]) => setRules((prev) => ({ ...(prev || {}), [stage]: steps }));

  const save = async () => {
    if (!rules) return;
    setSaving(true);
    try {
      const res = await rtSaveFollowUpRules(rules);
      setRules(res.data.rules);
      clearFollowUpRulesCache();
      toast.success('Takip planları kaydedildi');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-slate-900">
            <CalendarClock className="h-4 w-4 text-sky-600" />
            Takip planları
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Aday bu aşamaya alınınca temsilciye önerilen takip görevleri. Temsilci tarih ve saati değiştirebilir;
            müşteriye otomatik mesaj gitmez.
          </p>
        </div>
        <button
          type="button"
          disabled={saving || !rules}
          onClick={() => void save()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Kaydet
        </button>
      </div>

      {!rules ? (
        <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-slate-400" />
      ) : (
        <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100">
          {EDITABLE_STAGES.map((stage) => {
            const steps = rules[stage] || [];
            const expanded = open === stage;
            return (
              <li key={stage} className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : stage)}
                  className="flex w-full items-center justify-between gap-2 text-left text-sm"
                >
                  <span className="font-medium text-slate-900">{STAGE_LABELS[stage]}</span>
                  <span className="text-xs text-slate-500">
                    {steps.length ? steps.map((s) => `${s.days} gün`).join(' → ') : 'Plan yok'}
                  </span>
                </button>
                {expanded ? (
                  <div className="mt-2 space-y-1.5">
                    {steps.map((s, i) => (
                      <div key={i} className="grid grid-cols-[4.5rem_8rem_1fr_2rem] items-center gap-1.5">
                        <label className="flex items-center gap-1 text-xs text-slate-500">
                          <input
                            type="number"
                            min={0}
                            max={365}
                            value={s.days}
                            onChange={(e) =>
                              setSteps(
                                stage,
                                steps.map((x, j) => (j === i ? { ...x, days: Number(e.target.value) } : x))
                              )
                            }
                            className="w-12 rounded border border-slate-200 px-1 py-1 text-xs"
                            aria-label="Gün sonra"
                          />
                          gün
                        </label>
                        <select
                          value={s.task_type}
                          onChange={(e) =>
                            setSteps(stage, steps.map((x, j) => (j === i ? { ...x, task_type: e.target.value } : x)))
                          }
                          className="rounded border border-slate-200 px-1 py-1 text-xs"
                          aria-label="Görev türü"
                        >
                          {TYPE_OPTIONS.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <input
                          value={s.title}
                          onChange={(e) =>
                            setSteps(stage, steps.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
                          }
                          className="min-w-0 rounded border border-slate-200 px-2 py-1 text-xs"
                          aria-label="Görev başlığı"
                        />
                        <button
                          type="button"
                          onClick={() => setSteps(stage, steps.filter((_, j) => j !== i))}
                          aria-label="Adımı sil"
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          setSteps(stage, [
                            ...steps,
                            { days: (steps[steps.length - 1]?.days || 0) + 3, task_type: 'call_parent', title: 'Takip' }
                          ])
                        }
                        className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline"
                      >
                        <Plus className="h-3.5 w-3.5" /> Adım ekle
                      </button>
                      {defaults[stage] ? (
                        <button
                          type="button"
                          onClick={() => setSteps(stage, defaults[stage])}
                          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:underline"
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Varsayılana dön
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
