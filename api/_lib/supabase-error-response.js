import { errorMessage } from './error-msg.js';

/**
 * Sunucu tarafı Supabase hatalarını HTTP yanıtına çevirir.
 * Anon anahtar + RLS yaygın nedendir → açıklayıcı 503 + kod.
 */
export function statusAndBodyFromSupabaseError(err) {
  const msg = errorMessage(err);
  const rec = err && typeof err === 'object' ? err : {};
  const dbCode = rec.code != null ? String(rec.code) : '';
  const details = typeof rec.details === 'string' ? rec.details : undefined;
  const hint = typeof rec.hint === 'string' ? rec.hint : undefined;

  const permissionDenied =
    dbCode === '42501' ||
    /permission denied for table|permission denied for relation|permission denied for schema/i.test(msg);

  if (permissionDenied) {
    return {
      status: 503,
      body: {
        error:
          'Sunucu veritabanı tablosuna erişemedi (yetki reddedildi). Vercel ortam değişkenine SUPABASE_SERVICE_ROLE_KEY ekleyin (Supabase → Project Settings → API → service_role). Yalnızca anon anahtar kullanılırsa sunucu API’si RLS nedeniyle tabloları okuyamaz/yazamaz.',
        code: 'supabase_permission_denied',
        db_code: dbCode || undefined,
        ...(details ? { details } : {}),
        ...(hint ? { hint } : {})
      }
    };
  }

  return {
    status: 500,
    body: {
      error: msg,
      ...(dbCode ? { db_code: dbCode } : {}),
      ...(details ? { details } : {}),
      ...(hint ? { hint } : {})
    }
  };
}
