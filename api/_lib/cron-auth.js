/**
 * Vercel Cron: Authorization: Bearer CRON_SECRET (Vercel env'den otomatik gönderilir)
 * Geriye uyum: x-vercel-cron başlığı veya MEETING_CRON_SECRET
 */
function readHeader(req, name) {
  const want = name.toLowerCase();
  for (const [key, value] of Object.entries(req?.headers || {})) {
    if (String(key).toLowerCase() === want) return value;
  }
  return undefined;
}

function readBearerToken(req) {
  const auth = String(readHeader(req, 'authorization') || '');
  if (/^bearer\s+/i.test(auth)) return auth.replace(/^bearer\s+/i, '').trim();
  return auth.trim();
}

export function authorizeVercelOrCronSecret(req) {
  const secrets = [
    process.env.CRON_SECRET,
    process.env.MEETING_CRON_SECRET,
    process.env.COACH_WHATSAPP_CRON_SECRET,
  ]
    .map((s) => s?.trim())
    .filter(Boolean);
  const token = readBearerToken(req);
  const vercelCronRaw = readHeader(req, 'x-vercel-cron');
  const vercelCron =
    vercelCronRaw != null &&
    String(vercelCronRaw).trim() !== '' &&
    !['0', 'false', 'no'].includes(String(vercelCronRaw).trim().toLowerCase());

  if (vercelCron) return { ok: true, source: 'vercel' };
  if (secrets.length && token && secrets.includes(token)) return { ok: true, source: 'bearer' };
  return {
    ok: false,
    source: null,
    reason: secrets.length ? 'invalid_bearer' : 'missing_cron_secret',
  };
}

export function rejectUnauthorizedCron(res, auth) {
  if (auth?.ok) return false;
  const hint =
    auth?.reason === 'missing_cron_secret'
      ? 'Vercel → Settings → Environment Variables → CRON_SECRET ekleyin (16+ karakter), Production redeploy yapın.'
      : 'Authorization: Bearer CRON_SECRET gerekli (Vercel cron otomatik gönderir).';
  res.status(401).json({ error: 'Unauthorized cron', reason: auth?.reason || 'invalid_bearer', hint });
  return true;
}
