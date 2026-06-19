/** Kurumun belirlediği tahsilat şekli */
export type OdemeSekli = 'aylik_taksit' | 'kredi_karti_tek' | 'kredi_karti_otomatik';

/** Veli kayıt formundaki ödeme tercihi / beyanı */
export type OdemeTercihiVeli = 'henuz_odemedi' | 'kredi_karti_odendi' | 'aylik_taksit_istiyorum';

export const ODEME_SEKLI_OPTIONS: { value: OdemeSekli; label: string; hint: string }[] = [
  {
    value: 'aylik_taksit',
    label: 'Aylık taksit (havale / elden)',
    hint: 'Vade tarihleriyle taksit planı; tahsilat panelinden takip.'
  },
  {
    value: 'kredi_karti_tek',
    label: 'Kredi kartı — tek çekim',
    hint: 'Tek satır; karttan çekildiyse «Tahsil edildi» işaretleyin.'
  },
  {
    value: 'kredi_karti_otomatik',
    label: 'Kredi kartı — aylık otomatik',
    hint: 'Her ay karttan çekim; taksit planı ile takip.'
  }
];

export const ODEME_TERCIHI_VELI_OPTIONS: { value: OdemeTercihiVeli; label: string }[] = [
  { value: 'henuz_odemedi', label: 'Henüz ödemedim — kurum benimle iletişime geçsin' },
  { value: 'kredi_karti_odendi', label: 'Kredi kartı ile ödedim' }
];

const TERCIHI_VALID = new Set<string>(['henuz_odemedi', 'kredi_karti_odendi', 'aylik_taksit_istiyorum']);
const SEKLI_SET = new Set<string>(ODEME_SEKLI_OPTIONS.map((o) => o.value));

export function normalizeOdemeSekli(v: unknown): OdemeSekli {
  const s = String(v || '').trim();
  return SEKLI_SET.has(s) ? (s as OdemeSekli) : 'aylik_taksit';
}

export function normalizeOdemeTercihiVeli(v: unknown): OdemeTercihiVeli {
  const s = String(v || '').trim();
  return TERCIHI_VALID.has(s) ? (s as OdemeTercihiVeli) : 'henuz_odemedi';
}

export function odemeSekliLabel(sekli: OdemeSekli | string | null | undefined): string {
  const o = ODEME_SEKLI_OPTIONS.find((x) => x.value === sekli);
  return o?.label ?? 'Aylık taksit';
}

export function odemeTercihiVeliLabel(tercih: OdemeTercihiVeli | string | null | undefined): string {
  const o = ODEME_TERCIHI_VELI_OPTIONS.find((x) => x.value === tercih);
  if (o) return o.label;
  if (tercih === 'aylik_taksit_istiyorum') return 'Aylık taksit ile ödemek istiyorum';
  return '—';
}

export function odemeSekliFromKayitJson(j: Record<string, unknown> | null | undefined): OdemeSekli {
  return normalizeOdemeSekli(j?.odeme_sekli);
}

export function odemeTercihiVeliFromKayitJson(j: Record<string, unknown> | null | undefined): OdemeTercihiVeli {
  return normalizeOdemeTercihiVeli(j?.odeme_tercihi_veli);
}

/** Veli beyanına göre kurum ücret ekranı varsayılanı */
export function suggestOdemeSekliFromVeliTercihi(tercih: OdemeTercihiVeli): {
  odemeSekli: OdemeSekli;
  kkTahsilEdildi: boolean;
} {
  if (tercih === 'kredi_karti_odendi') {
    return { odemeSekli: 'kredi_karti_tek', kkTahsilEdildi: true };
  }
  if (tercih === 'aylik_taksit_istiyorum') {
    return { odemeSekli: 'aylik_taksit', kkTahsilEdildi: false };
  }
  return { odemeSekli: 'aylik_taksit', kkTahsilEdildi: false };
}

export function odemeSekliBadgeClass(sekli: OdemeSekli): string {
  switch (sekli) {
    case 'kredi_karti_tek':
      return 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-200';
    case 'kredi_karti_otomatik':
      return 'bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-200';
    default:
      return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200';
  }
}
