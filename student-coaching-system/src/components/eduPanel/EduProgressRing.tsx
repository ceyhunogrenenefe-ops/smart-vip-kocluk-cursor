import type { EduBadgeTier } from '../../lib/eduPanel/eduPanelProgress';

type Props = {
  value: number;
  size?: number;
  stroke?: number;
  badge?: EduBadgeTier;
  label?: string;
  sublabel?: string;
};

export default function EduProgressRing({
  value,
  size = 56,
  stroke = 5,
  badge,
  label,
  sublabel
}: Props) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const ringClass = badge?.ringClass || 'stroke-violet-500';

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            className="stroke-slate-200"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            className={`${ringClass} transition-all duration-700 ease-out`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
          {badge ? (
            <span className="text-lg" aria-hidden>
              {badge.emoji}
            </span>
          ) : null}
          <span className="text-[11px] font-bold text-slate-700">{pct}</span>
        </div>
      </div>
      {label ? <span className="text-[10px] font-semibold text-slate-600">{label}</span> : null}
      {sublabel ? <span className="text-[9px] text-slate-400">{sublabel}</span> : null}
    </div>
  );
}
