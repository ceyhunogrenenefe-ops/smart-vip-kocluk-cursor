import React from 'react';
import type { HomeworkStatCounts } from '../../lib/eduPanel/eduHomeworkStats';

type Props = {
  stats?: HomeworkStatCounts | null;
  compact?: boolean;
};

export default function EduHomeworkStatusBar({ stats, compact }: Props) {
  if (!stats || !stats.total) return null;
  const { submitted, pending, late, total, rate } = stats;
  return (
    <div className={compact ? 'mt-1.5 space-y-1' : 'mt-2 space-y-1.5'}>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-medium">
        <span className="text-green-700">🟢 {submitted} Teslim Edildi</span>
        <span className="text-amber-700">🟡 {pending} Bekliyor</span>
        <span className="text-red-700">🔴 {late} Gecikti</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-600 transition-all"
          style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
          title={`%${rate} · ${submitted}/${total}`}
        />
      </div>
    </div>
  );
}
