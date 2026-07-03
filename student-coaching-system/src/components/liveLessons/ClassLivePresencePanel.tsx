import React from 'react';
import { Loader2, Radio } from 'lucide-react';
import type { ClassLivePresenceSnapshot } from '../../lib/classLivePresence';
import { presenceShowsOnCard } from '../../lib/classLivePresence';

type StatKind = 'active' | 'passive' | 'absent';

type Props = {
  presence: ClassLivePresenceSnapshot | undefined;
  loading?: boolean;
  onStatClick?: (kind: StatKind) => void;
};

function StatButton({
  label,
  value,
  kind,
  onStatClick
}: {
  label: string;
  value: number;
  kind: StatKind;
  onStatClick?: (kind: StatKind) => void;
}) {
  const clickable = value > 0 && Boolean(onStatClick);
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={(e) => {
        e.stopPropagation();
        if (clickable) onStatClick?.(kind);
      }}
      className={`text-left text-[11px] leading-snug ${
        clickable
          ? 'cursor-pointer rounded-md px-1 py-0.5 hover:bg-white/80 hover:ring-1 hover:ring-indigo-200 dark:hover:bg-slate-800/80'
          : 'cursor-default'
      }`}
    >
      <span className="text-slate-600 dark:text-slate-400">{label}</span>{' '}
      <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">{value}</span>
    </button>
  );
}

function ClassLivePresencePanel({ presence, loading, onStatClick }: Props) {
  if (!presence && !loading) return null;

  if (loading && !presence) {
    return (
      <div
        className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-2.5 py-2 text-[11px] text-slate-500 dark:border-slate-700 dark:bg-slate-800/40"
        onClick={(e) => e.stopPropagation()}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Canlı katılım yükleniyor…
      </div>
    );
  }

  if (!presence || !presenceShowsOnCard(presence)) return null;

  const s = presence.summary;
  const liveBadge = presence.meeting_running;

  return (
    <div
      className="mt-3 rounded-lg border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-white px-2.5 py-2 dark:border-emerald-900/50 dark:from-emerald-950/40 dark:to-slate-900/40"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
          <Radio className={`h-3 w-3 ${liveBadge ? 'animate-pulse' : ''}`} aria-hidden />
          {liveBadge ? 'Canlı ders' : 'Ders penceresi'}
        </span>
        {loading ? <Loader2 className="h-3 w-3 animate-spin text-slate-400" aria-hidden /> : null}
      </div>
      <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
        <p className="text-[11px] text-slate-600 dark:text-slate-400">
          Toplam öğrenci: <span className="font-bold text-slate-900 dark:text-slate-100">{s.total}</span>
        </p>
        <p className="text-[11px] text-slate-600 dark:text-slate-400">
          Derse katılan: <span className="font-bold text-slate-900 dark:text-slate-100">{s.joined}</span>
        </p>
        <StatButton label="🟢 Aktif" value={s.active} kind="active" onStatClick={onStatClick} />
        <StatButton label="🔴 Pasif" value={s.passive} kind="passive" onStatClick={onStatClick} />
        <StatButton label="⚪ Katılmayan" value={s.absent} kind="absent" onStatClick={onStatClick} />
      </div>
    </div>
  );
}

function presencePanelPropsEqual(prev: Props, next: Props): boolean {
  if (prev.loading !== next.loading) return false;
  if (prev.onStatClick !== next.onStatClick) return false;
  const a = prev.presence;
  const b = next.presence;
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  if (a.polled_at !== b.polled_at) return false;
  if (a.meeting_running !== b.meeting_running) return false;
  const sa = a.summary;
  const sb = b.summary;
  return (
    sa.total === sb.total &&
    sa.joined === sb.joined &&
    sa.active === sb.active &&
    sa.passive === sb.passive &&
    sa.absent === sb.absent
  );
}

export default React.memo(ClassLivePresencePanel, presencePanelPropsEqual);
