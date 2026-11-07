import React from 'react';
import { cn } from '../lib/utils';
import type { JuniorVipMascotGender } from './inferMascotGender';

type Props = {
  size?: 'xs' | 'sm' | 'md';
  gender?: JuniorVipMascotGender;
  listening?: boolean;
  className?: string;
};

/** Marka renkleri + kız/erkek maskot (hafif animasyon). */
export function JuniorVipMascot({ size = 'md', gender = 'boy', listening, className }: Props) {
  const dim = size === 'xs' ? 36 : size === 'sm' ? 42 : 52;
  const isGirl = gender === 'girl';

  return (
    <div
      className={cn('relative flex items-center justify-center', className)}
      style={{ width: dim, height: dim }}
      aria-hidden
    >
      <div
        className={cn(
          'absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500 via-violet-600 to-blue-600 shadow-lg shadow-indigo-500/45',
          listening ? 'animate-pulse' : 'animate-[juniorVipFloat_2.8s_ease-in-out_infinite]'
        )}
      />
      <style>{`
        @keyframes juniorVipFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes juniorVipBlink {
          0%, 92%, 100% { transform: scaleY(1); }
          96% { transform: scaleY(0.12); }
        }
      `}</style>
      <svg viewBox="0 0 64 64" className="relative z-[1] h-[80%] w-[80%] drop-shadow-md">
        <ellipse cx="32" cy="36" rx="22" ry="20" fill="#f8fafc" />
        {isGirl ? (
          <>
            <path d="M14 22 Q20 8 32 10 Q44 8 50 22 Q48 18 32 16 Q16 18 14 22" fill="#4f46e5" />
            <circle cx="18" cy="14" r="4" fill="#a78bfa" />
            <circle cx="46" cy="14" r="4" fill="#a78bfa" />
          </>
        ) : (
          <>
            <path d="M18 18 Q32 6 46 18 L44 24 Q32 14 20 24 Z" fill="#312e81" />
            <rect x="22" y="10" width="20" height="5" rx="2" fill="#6366f1" />
          </>
        )}
        <g style={{ transformOrigin: '24px 32px', animation: 'juniorVipBlink 4s ease-in-out infinite' }}>
          <circle cx="24" cy="32" r="3.2" fill="#0f172a" />
          <circle cx="25" cy="31" r="1" fill="#fff" />
        </g>
        <g style={{ transformOrigin: '40px 32px', animation: 'juniorVipBlink 4s ease-in-out infinite' }}>
          <circle cx="40" cy="32" r="3.2" fill="#0f172a" />
          <circle cx="41" cy="31" r="1" fill="#fff" />
        </g>
        {isGirl ? (
          <path
            d="M26 43 Q32 47 38 43"
            fill="none"
            stroke="#7c3aed"
            strokeWidth="2"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M26 43 Q32 46 38 43"
            fill="none"
            stroke="#4f46e5"
            strokeWidth="2"
            strokeLinecap="round"
          />
        )}
        <path
          d="M32 10 L36 18 L44 14 L40 22 L48 24 L38 28 L40 36 L32 32 L24 36 L26 28 L16 24 L26 22 L22 14 L30 18 Z"
          fill="#c4b5fd"
        />
      </svg>
      <span
        className={cn(
          'pointer-events-none absolute -bottom-0.5 rounded-full bg-white/95 font-bold text-indigo-700 shadow',
          size === 'xs' ? 'px-1 py-0 text-[7px]' : 'px-1.5 py-0.5 text-[9px]'
        )}
      >
        VIP
      </span>
    </div>
  );
}
