import type { DisplayActivityStatus } from '../lib/studentActivityApi';

const STYLES: Record<DisplayActivityStatus, string> = {
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  passive: 'bg-slate-200 text-slate-700 border-slate-300',
  scheduled: 'bg-amber-100 text-amber-900 border-amber-200'
};

const LABELS: Record<DisplayActivityStatus, string> = {
  active: 'Aktif',
  passive: 'Pasif',
  scheduled: 'Planlanmış'
};

export function StudentActivityBadge({
  status,
  label,
  starts
}: {
  status: DisplayActivityStatus;
  label?: string;
  starts?: string | null;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STYLES[status] || STYLES.passive}`}
      title={starts ? `Başlangıç: ${starts}` : undefined}
    >
      {label || LABELS[status] || status}
      {status === 'scheduled' && starts ? ` · ${starts}` : ''}
    </span>
  );
}
