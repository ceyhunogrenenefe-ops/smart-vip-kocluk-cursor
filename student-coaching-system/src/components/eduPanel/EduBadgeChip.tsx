import type { EduBadgeTier } from '../../lib/eduPanel/eduPanelProgress';

type Props = {
  badge: EduBadgeTier;
  points?: number;
  compact?: boolean;
};

export default function EduBadgeChip({ badge, points, compact }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ring-1 ring-inset ${
        compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
      } ${badge.chipClass}`}
    >
      <span aria-hidden>{badge.emoji}</span>
      <span>{badge.label}</span>
      {points !== undefined ? (
        <span className="opacity-75">· {points}p</span>
      ) : null}
    </span>
  );
}
