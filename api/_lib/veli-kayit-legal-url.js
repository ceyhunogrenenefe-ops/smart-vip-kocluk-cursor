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

/** Kurum + şablon katmanlı KVKK / satış href çözümü */
export function resolveLegalDocHrefs(legalRow, presetRow) {
  const kvkkCustom =
    String(presetRow?.kvkk_doc_url || '').trim() || String(legalRow?.kvkk_doc_url || '').trim();
  const satisCustom =
    String(presetRow?.satis_doc_url || '').trim() || String(legalRow?.satis_doc_url || '').trim();
  return {
    kvkk_doc_href: resolveKvkkDocUrl(kvkkCustom || undefined),
    satis_doc_href: resolveSatisDocUrl(satisCustom || undefined)
  };
}
