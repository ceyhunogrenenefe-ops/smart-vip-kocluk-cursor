import { Clapperboard, Pencil, Play, Plus, Trash2, User } from 'lucide-react';
import type { EduAnimationPoolItem } from '../../types/eduPanel.types';
import { subjectCoverGradient } from '../../lib/eduPanel/eduAnimationPoolCatalog';

type Props = {
  item: EduAnimationPoolItem;
  canManage?: boolean;
  busy?: boolean;
  onPreview: () => void;
  onAddToHomework?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  addLabel?: string;
};

export default function EduAnimationPoolCard({
  item,
  canManage,
  busy,
  onPreview,
  onAddToHomework,
  onEdit,
  onDelete,
  addLabel = 'Ödeve Ekle'
}: Props) {
  const gradient = subjectCoverGradient(item.subject_name);

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <div
        className={`relative flex h-36 items-center justify-center bg-gradient-to-br ${gradient} text-white`}
      >
        <Clapperboard className="h-12 w-12 opacity-90" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-3 py-2">
          <p className="truncate text-sm font-semibold">{item.title}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="space-y-1 text-sm">
          <p className="text-slate-600">
            <span className="font-medium text-slate-800">Ders:</span> {item.subject_name}
          </p>
          <p className="text-slate-600">
            <span className="font-medium text-slate-800">Konu:</span> {item.topic_name}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <User className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{item.teacher_name || 'Öğretmen'}</span>
          </p>
        </div>

        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={onPreview}
            className="inline-flex min-w-[7rem] flex-1 items-center justify-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            Önizle
          </button>
          {onAddToHomework ? (
            <button
              type="button"
              disabled={busy}
              onClick={onAddToHomework}
              className="inline-flex min-w-[7rem] flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {addLabel}
            </button>
          ) : null}
        </div>

        {canManage ? (
          <div className="flex gap-2 border-t border-slate-100 pt-2">
            <button
              type="button"
              disabled={busy}
              onClick={onEdit}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              <Pencil className="h-3.5 w-3.5" />
              Düzenle
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onDelete}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Sil
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
