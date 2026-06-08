/**
 * Veli kayıt formundaki varsayılan metin bağlantıları.
 * Kurum özel linki: Veli onayı sayfası → Sözleşme metinleri (veya parent_sign_institution_legal).
 * Site içi metin gövdesi: `src/content/veliKayitLegalDocs.tsx`
 */

export const VELI_KAYIT_KVKK_PATH = '/veli-kayit-metin/kvkk';

export const VELI_KAYIT_SATIS_ONBILGI_PATH = '/veli-kayit-metin/satis-onbilgilendirme';

/** href olarak kullanım (varsayılan site içi yol) */
export const VELI_KAYIT_KVKK_DOC_HREF = VELI_KAYIT_KVKK_PATH;

export const VELI_KAYIT_SATIS_ONBILGI_DOC_HREF = VELI_KAYIT_SATIS_ONBILGI_PATH;

/** Boşsa varsayılan yol; https://… veya /yol kabul edilir */
export function resolveVeliLegalDocUrl(custom: string | null | undefined, defaultPath: string): string {
  const t = String(custom || '').trim();
  if (!t) return defaultPath;
  if (/^https?:\/\//i.test(t)) return t;
  return t.startsWith('/') ? t : `/${t}`;
}

export function resolveKvkkDocUrl(custom?: string | null): string {
  return resolveVeliLegalDocUrl(custom, VELI_KAYIT_KVKK_DOC_HREF);
}

export function resolveSatisDocUrl(custom?: string | null): string {
  return resolveVeliLegalDocUrl(custom, VELI_KAYIT_SATIS_ONBILGI_DOC_HREF);
}

/** Boşsa null; site içi yol veya https://… */
export function resolveOptionalDocUrl(custom?: string | null): string | null {
  const t = String(custom || '').trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return t.startsWith('/') ? t : `/${t}`;
}

export function absoluteVeliLegalDocUrl(
  custom: string | null | undefined,
  defaultPath: string,
  origin?: string
): string {
  const href = resolveVeliLegalDocUrl(custom, defaultPath);
  if (/^https?:\/\//i.test(href)) return href;
  const base =
    origin?.trim() ||
    (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '');
  return base ? `${base.replace(/\/$/, '')}${href}` : href;
}
