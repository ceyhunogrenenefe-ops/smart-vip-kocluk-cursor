/** Türkiye saati (sabit UTC+03:00) yardımcıları */
const TR_OFFSET_MS = 3 * 60 * 60 * 1000;

const trIso = (v: string | Date) => new Date(new Date(v).getTime() + TR_OFFSET_MS).toISOString();

export function todayKey(): string {
  return trIso(new Date()).slice(0, 10);
}

export function addDays(key: string, n: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

export function weekStart(key: string): string {
  const dow = new Date(`${key}T00:00:00Z`).getUTCDay();
  return addDays(key, dow === 0 ? -6 : 1 - dow);
}

const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const GUNLER = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

/** 'YYYY-MM-DD' → '27 Kas Cum' */
export function fmtDay(key: string | null | undefined): string {
  if (!key) return '—';
  const d = new Date(`${key.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getUTCDate()} ${AYLAR[d.getUTCMonth()]} ${GUNLER[d.getUTCDay()]}`;
}

/** ISO an → '27 Kas Cum 18:00' (TR) */
export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return '—';
  const t = new Date(v).getTime();
  if (Number.isNaN(t)) return '—';
  const s = trIso(v);
  return `${fmtDay(s.slice(0, 10))} ${s.slice(11, 16)}`;
}

/** ISO an → datetime-local input değeri (TR) */
export function toLocalInput(v: string | null | undefined): string {
  if (!v) return '';
  const t = new Date(v).getTime();
  if (Number.isNaN(t)) return '';
  return trIso(v).slice(0, 16);
}

/** datetime-local (TR olarak yorumlanır) → ISO */
export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  return new Date(`${v}:00+03:00`).toISOString();
}

export function fmtBytes(n: number | null | undefined): string {
  if (!n) return '';
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

export const STATUS_META: Record<string, { label: string; cls: string }> = {
  planned: { label: 'Planlandı', cls: 'bg-slate-100 text-slate-700' },
  shot: { label: 'Çekildi', cls: 'bg-sky-100 text-sky-800' },
  submitted: { label: 'Ham Video Teslim Edildi', cls: 'bg-indigo-100 text-indigo-800' },
  revision_requested: { label: 'Düzeltme İstendi', cls: 'bg-amber-100 text-amber-900' },
  approved: { label: 'Onaylandı', cls: 'bg-emerald-100 text-emerald-800' },
  overdue: { label: 'Gecikti', cls: 'bg-rose-100 text-rose-800' }
};

export const EVENT_LABELS: Record<string, string> = {
  created: 'Görev oluşturuldu',
  updated: 'Görev güncellendi',
  shot: 'Çekim kaydedildi',
  submitted: 'Ham video teslim edildi',
  resubmitted: 'Ham video yeniden yüklendi',
  edit_uploaded: 'Montaj yüklendi',
  review_opened: 'Montaj yorumlara açıldı',
  approved: 'Onaylandı',
  revision_requested: 'Düzeltme istendi',
  deleted: 'Görev silindi'
};

