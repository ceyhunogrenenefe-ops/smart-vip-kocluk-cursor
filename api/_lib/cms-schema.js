import { errorMessage } from './error-msg.js';

export const CMS_SETUP_SQL = 'student-coaching-system/sql/2026-05-31-corporate-cms.sql';

/** Supabase: tablo/sütun yok veya şema önbelleği güncel değil */
export function isCmsSchemaError(err) {
  const msg = errorMessage(err).toLowerCase();
  return (
    msg.includes('schema cache') ||
    msg.includes('does not exist') ||
    (msg.includes('relation') && msg.includes('cms_')) ||
    msg.includes('could not find the table')
  );
}

export function cmsSchemaMissingResponse(res, method = 'GET') {
  const empty = method === 'GET' ? [] : null;
  return res.status(200).json({
    ok: true,
    data: empty,
    schema_missing: true,
    setup_hint: `Supabase SQL Editor'da çalıştırın: ${CMS_SETUP_SQL}`
  });
}
