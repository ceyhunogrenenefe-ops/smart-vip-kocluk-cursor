import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import {
  rtConfirmLead,
  rtReopenLead,
  rtUpdateLead,
  type RegLead
} from '../../../lib/registrationTrackingApi';
import {
  CRM_COLUMN_DEFAULT_STAGE,
  CRM_PIPELINE_COLUMNS,
  crmColumnIdForLead
} from '../../../lib/registrationTrackingConfig';
import RegLeadCard from './RegLeadCard';

type Props = {
  leads: RegLead[];
  onOpen: (id: string) => void;
  onLeadsChange: (next: RegLead[]) => void;
};

function DraggableCard({ lead, onOpen }: { lead: RegLead; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    data: { lead }
  });
  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.35 : 1 }
    : isDragging
      ? { opacity: 0.35 }
      : undefined;

  return (
    <div ref={setNodeRef} style={style} className="touch-none" {...listeners} {...attributes}>
      <RegLeadCard lead={lead} onClick={() => onOpen(lead.id)} />
    </div>
  );
}

function DropColumn({
  id,
  label,
  count,
  hint,
  children
}: {
  id: string;
  label: string;
  count: number;
  hint?: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-0 flex-col rounded-xl border p-2 transition-colors ${
        isOver
          ? 'border-indigo-400 bg-indigo-50/80 dark:border-indigo-500 dark:bg-indigo-950/40'
          : 'border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-800/50'
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-1">
        <span className="text-[11px] font-semibold leading-snug text-slate-700 dark:text-slate-200">
          {label}
        </span>
        <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-900">
          {count}
        </span>
      </div>
      <div className="max-h-[min(70vh,720px)] space-y-2 overflow-y-auto overflow-x-hidden">
        {children}
        {hint ? <p className="px-0.5 pt-1 text-[9px] leading-snug text-slate-400">{hint}</p> : null}
      </div>
    </div>
  );
}

export default function CrmKanbanBoard({ leads, onOpen, onLeadsChange }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const byColumn = useMemo(() => {
    const map: Record<string, RegLead[]> = {};
    for (const col of CRM_PIPELINE_COLUMNS) {
      map[col.id] = leads.filter((l) => crmColumnIdForLead(l) === col.id);
    }
    return map;
  }, [leads]);

  const activeLead = activeId ? leads.find((l) => l.id === activeId) || null : null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const leadId = String(e.active.id);
    const overRaw = e.over?.id != null ? String(e.over.id) : '';
    if (!overRaw || busy) return;

    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;

    const fromCol = crmColumnIdForLead(lead);
    let toCol = CRM_PIPELINE_COLUMNS.some((c) => c.id === overRaw) ? overRaw : '';
    if (!toCol) {
      const overLead = leads.find((l) => l.id === overRaw);
      if (overLead) toCol = crmColumnIdForLead(overLead);
    }
    if (!toCol || toCol === fromCol) return;

    const snapshot = leads;
    setBusy(true);

    const patchLocal = (patch: Partial<RegLead>) => {
      onLeadsChange(leads.map((l) => (l.id === leadId ? { ...l, ...patch } : l)));
    };

    try {
      if (toCol === 'closed') {
        patchLocal({ primary_status: 'confirmed', stage: 'confirmed' });
        await rtConfirmLead({
          lead_id: leadId,
          grade_program: lead.grade_program
        });
        toast.success('Kayıt kazanıldı olarak işaretlendi');
      } else if (fromCol === 'closed') {
        const stage = CRM_COLUMN_DEFAULT_STAGE[toCol] || 'follow_up';
        patchLocal({ primary_status: 'tracking', stage });
        await rtReopenLead({ lead_id: leadId, reason: 'Kanban taşıma', stage });
        toast.success('Lead yeniden takibe alındı');
      } else {
        const stage = CRM_COLUMN_DEFAULT_STAGE[toCol] || lead.stage;
        patchLocal({ stage, primary_status: 'tracking' });
        await rtUpdateLead(leadId, { stage });
        toast.success('Aşama güncellendi');
      }
    } catch (err) {
      onLeadsChange(snapshot);
      toast.error(err instanceof Error ? err.message : 'Taşıma başarısız');
    } finally {
      setBusy(false);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="grid grid-cols-2 gap-2 overflow-x-hidden sm:grid-cols-3 xl:grid-cols-6">
        {CRM_PIPELINE_COLUMNS.map((col) => {
          const items = byColumn[col.id] || [];
          return (
            <DropColumn
              key={col.id}
              id={col.id}
              label={col.label}
              count={items.length}
              hint={
                col.kind === 'closed'
                  ? 'Buraya bırakınca kazanıldı olur. Kaybetmek için kartı açın.'
                  : undefined
              }
            >
              {items.length === 0 ? (
                <p className="py-8 text-center text-[10px] text-slate-400">Lead yok</p>
              ) : null}
              {items.map((l) => (
                <DraggableCard key={l.id} lead={l} onOpen={onOpen} />
              ))}
            </DropColumn>
          );
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeLead ? (
          <div className="w-52 rotate-1 scale-105 shadow-2xl">
            <RegLeadCard lead={activeLead} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
