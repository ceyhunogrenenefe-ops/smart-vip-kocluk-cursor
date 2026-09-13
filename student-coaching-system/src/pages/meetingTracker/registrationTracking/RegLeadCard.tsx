import { AlertTriangle, Clock, Flame, Snowflake, Sun, CheckCircle2, CreditCard, MessageCircle, Instagram, Facebook, Trash2 } from 'lucide-react';
import type { RegCoach, RegLead } from '../../../lib/registrationTrackingApi';
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
  agents?: RegCoach[];
  agentLoad?: Record<string, number>;
  canAssign?: boolean;
  canDelete?: boolean;
  selected?: boolean;
  onSelect?: (id: string, checked: boolean) => void;
  onClick?: () => void;
  onAssign?: (leadId: string, assignedUserId: string | null) => void;
  onDelete?: (lead: RegLead) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
};

function TempIcon({ temperature }: { temperature?: string }) {
  if (temperature === 'hot') return <Flame className="h-3.5 w-3.5 text-orange-600" aria-hidden />;
  if (temperature === 'cold') return <Snowflake className="h-3.5 w-3.5 text-sky-600" aria-hidden />;
  return <Sun className="h-3.5 w-3.5 text-amber-600" aria-hidden />;
}

function ChannelBadge({ channel }: { channel?: string | null }) {
  if (channel === 'instagram') {
    return (
      <span className="inline-flex items-center gap-0.5 rounded bg-pink-100 px-1.5 py-0.5 font-medium text-pink-800 dark:bg-pink-900/40 dark:text-pink-200">
        <Instagram className="h-3 w-3" /> IG
      </span>
    );
  }
  if (channel === 'facebook') {
    return (
      <span className="inline-flex items-center gap-0.5 rounded bg-blue-100 px-1.5 py-0.5 font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
        <Facebook className="h-3 w-3" /> FB
      </span>
    );
  }
  if (channel === 'whatsapp') {
    return (
      <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
        <MessageCircle className="h-3 w-3" /> WA
      </span>
    );
  }
  return null;
}

export default function RegLeadCard({
  lead,
  assigneeName,
  agents,
  agentLoad,
  canAssign,
  canDelete,
  selected,
  onSelect,
  onClick,
  onAssign,
  onDelete,
  draggable,
  onDragStart
}: Props) {
  const tone = leadCardTone(lead);
  const overdue = isOverdue(lead.next_action_at) && lead.primary_status === 'tracking';
  const inboundSnippet = String(lead.last_inbound_snippet || '').trim();

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
          <ChannelBadge channel={lead.last_inbound_channel} />
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
        {inboundSnippet && (
          <div className="mt-1.5 rounded border border-emerald-200/70 bg-white/80 px-2 py-1.5 dark:border-emerald-800/50 dark:bg-slate-900/50">
            <div className="flex items-center gap-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
              <MessageCircle className="h-3 w-3 shrink-0" />
              Son mesaj
              {lead.last_inbound_at && (
                <span className="ml-auto font-normal text-slate-400">{formatIstanbul(lead.last_inbound_at)}</span>
              )}
            </div>
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-700 dark:text-slate-200">{inboundSnippet}</p>
          </div>
        )}
        {assigneeName && !canAssign && (
          <div className="mt-1 text-[10px] text-slate-600 dark:text-slate-400">Sorumlu: {assigneeName}</div>
        )}
        <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
          <Clock className="h-3 w-3" />
          {formatIstanbul(lead.next_action_at)}
        </div>
        {!inboundSnippet && lead.notes && (
          <p className="mt-1 line-clamp-2 text-[10px] text-slate-600 dark:text-slate-400">{lead.notes}</p>
        )}
      </button>
      {(canAssign && agents && onAssign) || (canDelete && onDelete) ? (
        <div className="mt-2 flex items-center gap-1" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          {canAssign && agents && onAssign ? (
            <select
              className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] dark:border-slate-600 dark:bg-slate-900"
              value={lead.assigned_user_id || ''}
              onChange={(e) => onAssign(lead.id, e.target.value || null)}
            >
              <option value="">Ajan ata</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {agentLoad?.[a.id] != null ? ` (${agentLoad[a.id]} takip)` : ''}
                </option>
              ))}
            </select>
          ) : null}
          {canDelete && onDelete ? (
            <button
              type="button"
              title="Kartı sil"
              onClick={() => onDelete(lead)}
              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
