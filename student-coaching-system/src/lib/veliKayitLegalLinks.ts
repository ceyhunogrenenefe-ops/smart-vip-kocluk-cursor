/**
 * Veli kayıt formundaki varsayılan metin bağlantıları.
 * Kurum özel linki: Veli onayı sayfası → Sözleşme metinleri (veya parent_sign_institution_legal).
 * Site içi metin gövdesi: `src/content/veliKayitLegalDocs.tsx`
 *
 * Satış / kullanıcı varsayılanı: onlinevipdershane.com (eski /sayfa/* linkleri 404).
 */

export const ONLINEVIP_SATIS_SOZLESMESI_URL = 'https://onlinevipdershane.com/satis.html';
export const ONLINEVIP_KULLANICI_SOZLESMESI_URL = 'https://onlinevipdershane.com/kullanici.html';

export const VELI_KAYIT_KVKK_PATH = '/veli-kayit-metin/kvkk';
export const VELI_KAYIT_SATIS_ONBILGI_PATH = '/veli-kayit-metin/satis-onbilgilendirme';
export const VELI_KAYIT_KULLANICI_PATH = '/veli-kayit-metin/kullanici';

/** href olarak kullanım */
export const VELI_KAYIT_KVKK_DOC_HREF = VELI_KAYIT_KVKK_PATH;
export const VELI_KAYIT_SATIS_ONBILGI_DOC_HREF = ONLINEVIP_SATIS_SOZLESMESI_URL;
export const VELI_KAYIT_KULLANICI_DOC_HREF = ONLINEVIP_KULLANICI_SOZLESMESI_URL;

/** Eski / kırık sözleşme URL’lerini çalışan sayfalara çevirir */
export function remapBrokenLegalDocUrl(href: string): string {
  const t = String(href || '').trim();
  if (!t) return t;
  const lower = t.toLowerCase();

  if (
    /\/sayfa\/mesafeli-satis/i.test(lower) ||
    /\/sayfa\/satis/i.test(lower) ||
    lower.includes('mesafeli-satis-sozlesmesi')
  ) {
    return ONLINEVIP_SATIS_SOZLESMESI_URL;
  }

  if (
    /\/sayfa\/kullanici/i.test(lower) ||
    /\/sayfa\/kullanim/i.test(lower) ||
    lower.includes('kullanici-sozlesmesi') ||
    lower.includes('kullanim-kosullari')
  ) {
    return ONLINEVIP_KULLANICI_SOZLESMESI_URL;
  }

  if (lower === '/satis.html' || lower.endsWith('/satis.html')) {
    return ONLINEVIP_SATIS_SOZLESMESI_URL;
  }
  if (lower === '/kullanici.html' || lower.endsWith('/kullanici.html')) {
    return ONLINEVIP_KULLANICI_SOZLESMESI_URL;
  }

  return t;
}

/** Boşsa varsayılan yol; https://… veya /yol kabul edilir */
export function resolveVeliLegalDocUrl(custom: string | null | undefined, defaultPath: string): string {
  const t = String(custom || '').trim();
  if (!t) return defaultPath;
  if (/^https?:\/\//i.test(t)) return remapBrokenLegalDocUrl(t);
  return remapBrokenLegalDocUrl(t.startsWith('/') ? t : `/${t}`);
}

export function resolveKvkkDocUrl(custom?: string | null): string {
  return resolveVeliLegalDocUrl(custom, VELI_KAYIT_KVKK_DOC_HREF);
}

export function resolveSatisDocUrl(custom?: string | null): string {
  return resolveVeliLegalDocUrl(custom, VELI_KAYIT_SATIS_ONBILGI_DOC_HREF);
}

export function resolveKullaniciDocUrl(custom?: string | null): string {
  return resolveVeliLegalDocUrl(custom, VELI_KAYIT_KULLANICI_DOC_HREF);
}

/** Boşsa null; site içi yol veya https://… */
export function resolveOptionalDocUrl(custom?: string | null): string | null {
  const t = String(custom || '').trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return remapBrokenLegalDocUrl(t);
  return remapBrokenLegalDocUrl(t.startsWith('/') ? t : `/${t}`);
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
