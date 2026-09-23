import { Clock, ListChecks, Link2 } from 'lucide-react';

const field =
  'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-amber-500 focus:outline-none';

export type HomeworkTargetValues = {
  target_question_count?: string;
  target_minutes?: string;
  resource_url?: string;
};

/**
 * Ödev hedefleri — soru sayısı, süre ve kaynak bağlantısı.
 * Yalnız ödev modülü açık kurumlarda gösterilir.
 */
export default function HomeworkTargets({
  value,
  onChange
}: {
  value: HomeworkTargetValues;
  onChange: (patch: HomeworkTargetValues) => void;
}) {
  return (
    <div className="rounded-xl border border-amber-200 bg-white p-3">
      <p className="text-sm font-semibold text-slate-900">Hedefler</p>
      <p className="mt-0.5 text-xs text-slate-500">
        Öğrencinin haftalık planına bu hedeflerle düşer; tamamlayınca karşılaştırılır.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-medium text-slate-600">
          <span className="inline-flex items-center gap-1">
            <ListChecks className="h-3.5 w-3.5 text-amber-600" />
            Soru sayısı
          </span>
          <input
            type="number"
            min={1}
            max={1000}
            inputMode="numeric"
            value={value.target_question_count || ''}
            onChange={(e) => onChange({ target_question_count: e.target.value })}
            placeholder="örn. 25"
            className={field}
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-amber-600" />
            Süre (dakika)
          </span>
          <input
            type="number"
            min={5}
            max={600}
            inputMode="numeric"
            value={value.target_minutes || ''}
            onChange={(e) => onChange({ target_minutes: e.target.value })}
            placeholder="örn. 40"
            className={field}
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          <span className="inline-flex items-center gap-1">
            <Link2 className="h-3.5 w-3.5 text-amber-600" />
            Kaynak bağlantısı
          </span>
          <input
            type="url"
            value={value.resource_url || ''}
            onChange={(e) => onChange({ resource_url: e.target.value })}
            placeholder="https://…"
            className={field}
          />
        </label>
      </div>
    </div>
  );
}
