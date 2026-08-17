import { AlertTriangle, Clock, Flame, Snowflake, Sun, CheckCircle2, CreditCard } from 'lucide-react';
import type { RegLead } from '../../../lib/registrationTrackingApi';
import {
  CARD_TONE_CLASS,
  GRADE_LABEL,
  STAGE_LABELS,
  TEMPERATURE_LABELS,
  formatIstanbul,
  isOverdue,
  leadCardTone
} from '../../../lib/registrationTrackingConfig';

type Props = {
  lead: RegLead;
  assigneeName?: string;
  selected?: boolean;
  onSelect?: (id: string, checked: boolean) => void;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
};

function TempIcon({ temperature }: { temperature?: string }) {
  if (temperature === 'hot') return <Flame className="h-3.5 w-3.5 text-orange-600" aria-hidden />;
  if (temperature === 'cold') return <Snowflake className="h-3.5 w-3.5 text-sky-600" aria-hidden />;
  return <Sun className="h-3.5 w-3.5 text-amber-600" aria-hidden />;
}

export default function RegLeadCard({
  lead,
  assigneeName,
  selected,
  onSelect,
  onClick,
  draggable,
  onDragStart
}: Props) {
  const tone = leadCardTone(lead);
  const overdue = isOverdue(lead.next_action_at) && lead.primary_status === 'tracking';

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      className={`group relative rounded-lg border border-slate-200/80 p-2.5 text-left shadow-sm transition hover:shadow-md dark:border-slate-600 ${CARD_TONE_CLASS[tone]}`}
    >
      {onSelect && (
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(lead.id, e.target.checked)}
          className="absolute left-1.5 top-1.5 h-3.5 w-3.5"
          onClick={(e) => e.stopPropagation()}
        />
      )}
      <button type="button" onClick={onClick} className="w-full text-left pl-4">
        <div className="flex items-start justify-between gap-1">
          <span className="font-semibold text-sm text-slate-900 dark:text-white leading-tight">
            {lead.full_name || `${lead.first_name} ${lead.last_name}`}
          </span>
          <TempIcon temperature={lead.temperature} />
        </div>
        <div className="mt-0.5 text-xs text-slate-500">{GRADE_LABEL[lead.grade_program] || lead.grade_program}</div>
        <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
          <span className="rounded bg-white/70 px-1.5 py-0.5 font-medium dark:bg-slate-900/60">
            {STAGE_LABELS[lead.stage] || lead.stage}
          </span>
          <span className="rounded bg-white/70 px-1.5 py-0.5 dark:bg-slate-900/60">
            {TEMPERATURE_LABELS[lead.temperature]}
          </span>
          {lead.stage === 'payment_pending' && (
            <span className="inline-flex items-center gap-0.5 rounded bg-violet-100 px-1.5 py-0.5 text-violet-800">
              <CreditCard className="h-3 w-3" /> Ödeme
            </span>
          )}
          {lead.primary_status === 'confirmed' && (
            <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">
              <CheckCircle2 className="h-3 w-3" /> Kesin
            </span>
          )}
          {overdue && (
            <span className="inline-flex items-center gap-0.5 rounded bg-red-100 px-1.5 py-0.5 font-semibold text-red-800">
              <AlertTriangle className="h-3 w-3" /> Gecikmiş
            </span>
          )}
        </div>
        {assigneeName && (
          <div className="mt-1 text-[10px] text-slate-600 dark:text-slate-400">Sorumlu: {assigneeName}</div>
        )}
        <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
          <Clock className="h-3 w-3" />
          {formatIstanbul(lead.next_action_at)}
        </div>
        {lead.notes && (
          <p className="mt-1 line-clamp-2 text-[10px] text-slate-600 dark:text-slate-400">{lead.notes}</p>
        )}
      </button>
    </div>
  );
}
