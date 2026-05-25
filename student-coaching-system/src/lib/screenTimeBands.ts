/** Günlük ekran süresi (dakika) — görsel bantlar */
export type ScreenTimeBandId = 'empty' | 'good' | 'normal' | 'high' | 'extreme';

export type ScreenTimeBandMeta = {
  id: ScreenTimeBandId;
  label: string;
  fill: string;
  fillDark: string;
  ring: string;
  text: string;
  bg: string;
};

export function screenTimeBandMeta(minutes: number): ScreenTimeBandMeta {
  const m = Math.max(0, Math.floor(Number(minutes) || 0));
  if (m === 0) {
    return {
      id: 'empty',
      label: 'Kayıt yok',
      fill: '#cbd5e1',
      fillDark: '#475569',
      ring: 'ring-slate-200',
      text: 'text-slate-500',
      bg: 'bg-slate-100'
    };
  }
  if (m <= 30) {
    return {
      id: 'good',
      label: 'İyi',
      fill: '#34d399',
      fillDark: '#10b981',
      ring: 'ring-emerald-200',
      text: 'text-emerald-700',
      bg: 'bg-emerald-50'
    };
  }
  if (m <= 90) {
    return {
      id: 'normal',
      label: 'Normal',
      fill: '#60a5fa',
      fillDark: '#3b82f6',
      ring: 'ring-blue-200',
      text: 'text-blue-700',
      bg: 'bg-blue-50'
    };
  }
  if (m <= 120) {
    return {
      id: 'high',
      label: 'Fazla',
      fill: '#fbbf24',
      fillDark: '#f59e0b',
      ring: 'ring-amber-200',
      text: 'text-amber-800',
      bg: 'bg-amber-50'
    };
  }
  return {
    id: 'extreme',
    label: 'Çok fazla',
    fill: '#f87171',
    fillDark: '#ef4444',
    ring: 'ring-red-200',
    text: 'text-red-700',
    bg: 'bg-red-50'
  };
}

export const SCREEN_TIME_LEGEND: { range: string; meta: ScreenTimeBandMeta }[] = [
  { range: '0–30 dk', meta: screenTimeBandMeta(15) },
  { range: '30–90 dk', meta: screenTimeBandMeta(60) },
  { range: '90–120 dk', meta: screenTimeBandMeta(100) },
  { range: '120+ dk', meta: screenTimeBandMeta(150) }
];
