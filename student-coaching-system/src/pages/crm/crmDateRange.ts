import type { CrmTimePreset } from './CrmFilterBar';

const IST_OFFSET_MS = 3 * 60 * 60 * 1000;

export function istanbulYmd(d = new Date()) {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addIstanbulDays(ymd: string, days: number) {
  const [y, m, day] = ymd.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, day) + days * 86400000;
  const ist = new Date(utc);
  const yy = ist.getUTCFullYear();
  const mm = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(ist.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Pazartesi başı, Europe/Istanbul */
export function istanbulWeekStart(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = date.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  return addIstanbulDays(ymd, mondayOffset);
}

/** `all` tarih filtresi yok. Diğerleri kayıt günü (YYYY-MM-DD) aralığı döner. */
export function pipelineDateRange(
  preset: CrmTimePreset,
  customFrom = '',
  customTo = ''
): { from: string; to: string } | null {
  if (preset === 'all') return null;
  const today = istanbulYmd();
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'yesterday') {
    const y = addIstanbulDays(today, -1);
    return { from: y, to: y };
  }
  if (preset === 'last_7_days') return { from: addIstanbulDays(today, -6), to: today };
  if (preset === 'this_month') return { from: `${today.slice(0, 7)}-01`, to: today };
  if (preset === 'custom') {
    const from = (customFrom || today).slice(0, 10);
    const to = (customTo || from).slice(0, 10);
    return from <= to ? { from, to } : { from: to, to: from };
  }
  return { from: istanbulWeekStart(today), to: today };
}

const KNOWN: CrmTimePreset[] = [
  'all',
  'today',
  'yesterday',
  'last_7_days',
  'this_week',
  'this_month',
  'custom'
];

export function readPipelineRangePreset(raw: string | null, hasDates: boolean): CrmTimePreset {
  if (raw && (KNOWN as string[]).includes(raw)) return raw as CrmTimePreset;
  return hasDates ? 'custom' : 'all';
}
