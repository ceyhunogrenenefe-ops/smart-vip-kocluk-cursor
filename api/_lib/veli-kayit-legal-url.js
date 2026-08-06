import {
  ONLINEVIP_KULLANICI_SOZLESMESI_URL,
  ONLINEVIP_SATIS_SOZLESMESI_URL,
  VELI_KAYIT_KULLANICI_DEFAULT_HREF,
  VELI_KAYIT_KVKK_PATH,
  VELI_KAYIT_SATIS_DEFAULT_HREF
} from './veli-kayit-legal-paths.js';

/**
 * Eski / kırık sözleşme URL’lerini çalışan onlinevipdershane.com sayfalarına çevirir.
 * @param {string} href
 */
export function remapBrokenLegalDocUrl(href) {
  const t = String(href || '').trim();
  if (!t) return t;
  const lower = t.toLowerCase();

  if (
    /\/sayfa\/mesafeli-satis/i.test(lower) ||
    /\/sayfa\/satis/i.test(lower) ||
    lower.endsWith('/satis') ||
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

  // Koçluk domaininde göreli /satis.html / /kullanici.html — site kopyası veya resmi site
  if (lower === '/satis.html' || lower.endsWith('/satis.html')) {
    return ONLINEVIP_SATIS_SOZLESMESI_URL;
  }
  if (lower === '/kullanici.html' || lower.endsWith('/kullanici.html')) {
    return ONLINEVIP_KULLANICI_SOZLESMESI_URL;
  }

  return t;
}

/** @param {string | null | undefined} custom */
export function resolveVeliLegalDocUrl(custom, defaultPath) {
  const t = String(custom || '').trim();
  if (!t) return defaultPath;
  if (/^https?:\/\//i.test(t)) return remapBrokenLegalDocUrl(t);
  const path = t.startsWith('/') ? t : `/${t}`;
  return remapBrokenLegalDocUrl(path);
}

/** @param {string | null | undefined} custom */
export function resolveKvkkDocUrl(custom) {
  return resolveVeliLegalDocUrl(custom, VELI_KAYIT_KVKK_PATH);
}

/** @param {string | null | undefined} custom */
export function resolveSatisDocUrl(custom) {
  return resolveVeliLegalDocUrl(custom, VELI_KAYIT_SATIS_DEFAULT_HREF);
}

/** @param {string | null | undefined} custom */
export function resolveKullaniciDocUrl(custom) {
  return resolveVeliLegalDocUrl(custom, VELI_KAYIT_KULLANICI_DEFAULT_HREF);
}

/** Kurum varsayılan KVKK / satış / kullanıcı href */
export function resolveLegalDocHrefs(legalRow) {
  return {
    kvkk_doc_href: resolveKvkkDocUrl(legalRow?.kvkk_doc_url),
    satis_doc_href: resolveSatisDocUrl(legalRow?.satis_doc_url),
    kullanici_doc_href: resolveKullaniciDocUrl(legalRow?.kullanici_doc_url)
  };
}

/** @param {string | null | undefined} custom */
export function resolveOptionalDocUrl(custom) {
  const t = String(custom || '').trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return remapBrokenLegalDocUrl(t);
  const path = t.startsWith('/') ? t : `/${t}`;
  return remapBrokenLegalDocUrl(path);
}
