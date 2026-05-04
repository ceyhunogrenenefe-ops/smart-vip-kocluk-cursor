/**
 * Vercel Cron veya manuel tetikleme: Authorization: Bearer CRON_SECRET
 * (MEETING_CRON_SECRET ile geriye uyumlu)
 */
export function authorizeVercelOrCronSecret(req) {
  const secret =
    process.env.CRON_SECRET?.trim() ||
    process.env.MEETING_CRON_SECRET?.trim() ||
    '';
  const auth = req.headers?.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const vercelCron =
    req.headers['x-vercel-cron'] === '1' ||
    String(req.headers['x-vercel-cron'] || '').toLowerCase() === '1';
  if (vercelCron) return { ok: true, source: 'vercel' };
  if (secret && token === secret) return { ok: true, source: 'bearer' };
  return { ok: false, source: null };
}
