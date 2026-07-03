import type { ParentSignContractRow } from './parentSignApi';
import { formatUcretWithCurrency, PARA_BIRIMI_OPTIONS } from './parentSignApi';
import { odemeSekliFromKayitJson, type OdemeSekli } from './odemeSekli';

function resolveContractParaBirimi(r: ParentSignContractRow): string {
  const col = String(r.para_birimi || '').trim().toUpperCase();
  if (col && PARA_BIRIMI_OPTIONS.some((o) => o.value === col)) return col;
  const kj = r.kayit_formu_json;
  if (kj && typeof kj === 'object' && !Array.isArray(kj)) {
    const j = kj as Record<string, unknown>;
    const jpb = String(j.para_birimi || '').trim().toUpperCase();
    if (jpb && PARA_BIRIMI_OPTIONS.some((o) => o.value === jpb)) return jpb;
    const ozet = String(j.muhasebe_ozet || '');
    if (/\bEUR\b/.test(ozet)) return 'EUR';
    if (/\bUSD\b/.test(ozet)) return 'USD';
    if (/\bGBP\b/.test(ozet)) return 'GBP';
  }
  const html = String(r.merged_html || '');
  if (/\d[\d.,\s]*\s*EUR\b/i.test(html) || /\bEUR\s*€/.test(html)) return 'EUR';
  if (/\d[\d.,\s]*\s*USD\b/i.test(html) || /\bUSD\s*\$/.test(html)) return 'USD';
  if (/\d[\d.,\s]*\s*GBP\b/i.test(html) || /\bGBP\s*£/.test(html)) return 'GBP';
  return 'TRY';
}

/** Kayıt JSON’daki taksit satırı (API ile uyumlu) */
export type TaksitKartMuhasebe = {
  no?: number;
  tutar_tl?: number;
  odendi?: boolean;
  odeme_notu?: string;
  vade_tarihi?: string;
  odendi_tarihi?: string;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Yerel takvim — parent-sign-defaults.shiftYmdByMonths ile aynı mantık */
export function shiftYmdByMonths(ymd: string, deltaMonths: number): string | null {
  const m = String(ymd || '')
    .trim()
    .slice(0, 10);
  if (!YMD.test(m)) return null;
  const [y, mo, d] = m.split('-').map((x) => parseInt(x, 10));
  const t = new Date(y, mo - 1 + deltaMonths, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  const day = Math.min(d, last);
  const r = new Date(t.getFullYear(), t.getMonth(), day);
  const yy = r.getFullYear();
  const mm = String(r.getMonth() + 1).padStart(2, '0');
  const dd = String(r.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function todayYmdLocal(): string {
  const n = new Date();
  const yy = n.getFullYear();
  const mm = String(n.getMonth() + 1).padStart(2, '0');
  const dd = String(n.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** İlk vade = anchorYmd; sonraki her taksit +1 ay */
export function taksitVadeleriMonthly(anchorYmd: string, count: number): string[] {
  const n = Math.max(1, Math.min(48, Math.round(count) || 1));
  const raw = String(anchorYmd || '')
    .trim()
    .slice(0, 10);
  const start = YMD.test(raw) ? raw : todayYmdLocal();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(shiftYmdByMonths(start, i) || start);
  }
  return out;
}

/** Yeni plan: 1. vade bugün, sonrakiler aylık */
export function defaultTaksitVadeleri(count: number): string[] {
  return taksitVadeleriMonthly(todayYmdLocal(), count);
}

export function resizeTaksitVadeleri(prev: string[], count: number): string[] {
  const n = Math.max(1, Math.min(48, Math.round(count) || 1));
  if (n <= 1) return [];
  const anchor = prev[0] && YMD.test(prev[0]) ? prev[0] : todayYmdLocal();
  const series = taksitVadeleriMonthly(anchor, n);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const p = prev[i];
    out.push(p && YMD.test(p) ? p : series[i]);
  }
  return out;
}

/** 1. vade değişince sonrakileri aylık yeniden hesapla */
export function applyTaksitVadeEdit(vadeler: string[], index: number, newYmd: string): string[] {
  if (!YMD.test(newYmd)) return vadeler;
  if (index === 0) return taksitVadeleriMonthly(newYmd, vadeler.length);
  const next = [...vadeler];
  next[index] = newYmd;
  return next;
}

/** Toplam ücreti taksit sayısına böl (API buildTaksitPlan ile aynı) */
export function splitTaksitTutarlari(ucret: number, count: number): number[] {
  const u = Number(ucret);
  const n = Math.max(1, Math.min(48, Math.round(count) || 1));
  if (!Number.isFinite(u) || u <= 0) return [];
  const base = Math.floor(u / n);
  let rem = u - base * n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let t = base;
    if (rem > 0) {
      t++;
      rem--;
    }
    out.push(t);
  }
  return out;
}

export function resizeTaksitTutarlari(prev: number[], ucret: number, count: number): number[] {
  const n = Math.max(1, Math.min(48, Math.round(count) || 1));
  if (n <= 1) return n === 1 && Number(ucret) > 0 ? [Math.round(Number(ucret))] : [];
  const defaults = splitTaksitTutarlari(ucret, n);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = prev[i];
    out.push(Number.isFinite(p) && p >= 0 ? Math.round(p) : defaults[i] ?? 0);
  }
  return out;
}

/** Kartta vade yoksa sözleşme başlangıcı + (taksit no - 1) ay */
export function effectiveVadeYmd(
  card: TaksitKartMuhasebe,
  contractBaslangic: string | null | undefined,
  indexZero: number
): string {
  const v = String(card.vade_tarihi || '')
    .trim()
    .slice(0, 10);
  if (YMD.test(v)) return v;
  const fromToday = shiftYmdByMonths(todayYmdLocal(), indexZero);
  if (fromToday) return fromToday;
  const b = String(contractBaslangic || '')
    .trim()
    .slice(0, 10);
  if (YMD.test(b)) {
    const shifted = shiftYmdByMonths(b, indexZero);
    if (shifted) return shifted;
  }
  return todayYmdLocal();
}

export function ymdToUtcMidnight(ymd: string): number {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  return Date.UTC(y, m - 1, d);
}

/** Negatif = gün gecikti (ödenmemişse anlamlı) */
export function daysFromVadeToToday(vadeYmd: string): number {
  if (!YMD.test(vadeYmd)) return 0;
  const v = ymdToUtcMidnight(vadeYmd);
  const t = ymdToUtcMidnight(todayYmdLocal());
  return Math.round((t - v) / (86400 * 1000));
}

export type TaksitDurum = 'paid' | 'overdue' | 'due_week' | 'due_month' | 'future';

export function classifyTaksit(vadeYmd: string, odendi: boolean): TaksitDurum {
  if (odendi) return 'paid';
  const diff = daysFromVadeToToday(vadeYmd);
  if (diff > 0) return 'overdue';
  if (diff >= -7) return 'due_week';
  if (diff >= -30) return 'due_month';
  return 'future';
}

export type TaksitFlatRow = {
  contractId: string;
  contractNumber: string;
  institutionId: string;
  ogrenciLabel: string;
  programAdi: string;
  ucretToplam: number;
  paraBirimi: string;
  taksitIndex: number;
  taksitNo: number;
  tutarTl: number;
  vadeYmd: string;
  odendi: boolean;
  odendiTarihi: string;
  durum: TaksitDurum;
  signed: boolean;
  odemeSekli: OdemeSekli;
};

/** Para birimine göre toplam (TRY/EUR/USD/GBP ayrı) */
export function sumTaksitByCurrency(
  rows: TaksitFlatRow[],
  filter?: (x: TaksitFlatRow) => boolean
): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of rows) {
    if (filter && !filter(x)) continue;
    const c = String(x.paraBirimi || 'TRY').trim().toUpperCase() || 'TRY';
    const amt = Number.isFinite(x.tutarTl) ? x.tutarTl : 0;
    m.set(c, (m.get(c) || 0) + amt);
  }
  return m;
}

export function formatMultiCurrencySums(sums: Map<string, number>): string {
  if (!sums.size) return formatUcretWithCurrency(0, 'TRY');
  return [...sums.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([c, v]) => formatUcretWithCurrency(v, c))
    .join(' · ');
}

function kayitJson(r: ParentSignContractRow): Record<string, unknown> {
  const j = r.kayit_formu_json;
  return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
}

function rowSigned(r: ParentSignContractRow): boolean {
  if (r.signed_at != null && String(r.signed_at).trim() !== '') return true;
  return String(r.status || '').toLowerCase().trim() === 'signed';
}

function parseCards(r: ParentSignContractRow): TaksitKartMuhasebe[] {
  const raw = kayitJson(r).taksit_kartlari;
  if (!Array.isArray(raw)) return [];
  const out: TaksitKartMuhasebe[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    out.push({
      no: typeof o.no === 'number' ? o.no : Number(o.no) || undefined,
      tutar_tl: typeof o.tutar_tl === 'number' ? o.tutar_tl : Number(o.tutar_tl) || 0,
      odendi: Boolean(o.odendi),
      odeme_notu: o.odeme_notu != null ? String(o.odeme_notu) : '',
      vade_tarihi: o.vade_tarihi != null ? String(o.vade_tarihi).slice(0, 10) : undefined,
      odendi_tarihi: o.odendi_tarihi != null ? String(o.odendi_tarihi).slice(0, 10) : ''
    });
  }
  return out;
}

export function flattenTaksitRows(contracts: ParentSignContractRow[]): TaksitFlatRow[] {
  const rows: TaksitFlatRow[] = [];
  for (const r of contracts) {
    const cards = parseCards(r);
    if (!cards.length) continue;
    const signed = rowSigned(r);
    const label = `${String(r.ogrenci_ad || '').trim()} ${String(r.ogrenci_soyad || '').trim()}`.trim() || '—';
    const bas = r.baslangic_tarihi != null ? String(r.baslangic_tarihi) : '';
    const paraBirimi = resolveContractParaBirimi(r);
    const odemeSekli = odemeSekliFromKayitJson(kayitJson(r));
    cards.forEach((c, idx) => {
      const vade = effectiveVadeYmd(c, bas, idx);
      const tutar = Number.isFinite(Number(c.tutar_tl)) ? Number(c.tutar_tl) : 0;
      const odendi = Boolean(c.odendi);
      rows.push({
        contractId: r.id,
        contractNumber: String(r.contract_number || ''),
        institutionId: String(r.institution_id || ''),
        ogrenciLabel: label,
        programAdi: String(r.program_adi || '').trim(),
        ucretToplam: Number(r.ucret) || 0,
        paraBirimi,
        taksitIndex: idx,
        taksitNo: typeof c.no === 'number' && Number.isFinite(c.no) ? c.no : idx + 1,
        tutarTl: tutar,
        vadeYmd: vade,
        odendi,
        odendiTarihi: String(c.odendi_tarihi || '').slice(0, 10),
        durum: classifyTaksit(vade, odendi),
        signed,
        odemeSekli
      });
    });
  }
  return rows;
}

export function formatTrShortDate(ymd: string): string {
  if (!YMD.test(ymd)) return ymd;
  const [y, m, d] = ymd.split('-');
  return `${d}.${m}.${y}`;
}
