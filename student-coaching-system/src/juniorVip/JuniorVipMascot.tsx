import React from 'react';
import { cn } from '../lib/utils';

type Props = {
  size?: 'sm' | 'md';
  listening?: boolean;
  className?: string;
};

/** Sevimli Junior VIP maskotu — saf CSS/SVG, hafif animasyon. */
export function JuniorVipMascot({ size = 'md', listening, className }: Props) {
  const dim = size === 'sm' ? 44 : 56;
  return (
    <div
      className={cn('relative flex items-center justify-center', className)}
      style={{ width: dim, height: dim }}
      aria-hidden
    >
      <div
        className={cn(
          'absolute inset-0 rounded-full bg-gradient-to-br from-amber-300 via-orange-400 to-rose-400 shadow-lg shadow-orange-400/40',
          listening && 'animate-pulse'
        )}
      />
      <svg viewBox="0 0 64 64" className="relative z-[1] h-[78%] w-[78%] drop-shadow">
        <ellipse cx="32" cy="36" rx="22" ry="20" fill="#fff9f0" />
        <circle cx="24" cy="32" r="3.2" fill="#1e293b" />
        <circle cx="40" cy="32" r="3.2" fill="#1e293b" />
        <circle cx="25" cy="31" r="1" fill="#fff" />
        <circle cx="41" cy="31" r="1" fill="#fff" />
        <path d="M26 42 Q32 46 38 42" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" />
        <path d="M32 10 L36 18 L44 14 L40 22 L48 24 L38 28 L40 36 L32 32 L24 36 L26 28 L16 24 L26 22 L22 14 L30 18 Z" fill="#fde047" />
      </svg>
      <span className="pointer-events-none absolute -bottom-0.5 rounded-full bg-white/95 px-1.5 py-0.5 text-[9px] font-bold text-orange-600 shadow">
        VIP
      </span>
    </div>
  );
}
