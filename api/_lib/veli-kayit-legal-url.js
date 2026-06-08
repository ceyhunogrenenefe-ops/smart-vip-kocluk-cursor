import {
  VELI_KAYIT_KVKK_PATH,
  VELI_KAYIT_SATIS_ONBILGI_PATH
} from './veli-kayit-legal-paths.js';

/** @param {string | null | undefined} custom */
export function resolveVeliLegalDocUrl(custom, defaultPath) {
  const t = String(custom || '').trim();
  if (!t) return defaultPath;
  if (/^https?:\/\//i.test(t)) return t;
  return t.startsWith('/') ? t : `/${t}`;
}

/** @param {string | null | undefined} custom */
export function resolveKvkkDocUrl(custom) {
  return resolveVeliLegalDocUrl(custom, VELI_KAYIT_KVKK_PATH);
}

/** @param {string | null | undefined} custom */
export function resolveSatisDocUrl(custom) {
  return resolveVeliLegalDocUrl(custom, VELI_KAYIT_SATIS_ONBILGI_PATH);
}

/** Kurum varsayılan KVKK / satış href */
export function resolveLegalDocHrefs(legalRow) {
  return {
    kvkk_doc_href: resolveKvkkDocUrl(legalRow?.kvkk_doc_url),
    satis_doc_href: resolveSatisDocUrl(legalRow?.satis_doc_url)
  };
}

/** @param {string | null | undefined} custom */
export function resolveOptionalDocUrl(custom) {
  const t = String(custom || '').trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return t.startsWith('/') ? t : `/${t}`;
}
