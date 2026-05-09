import { syncClassSessionsScheduledToCompleted } from '../api/_lib/class-sessions-sync.js';
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';

const jsonError = (res, status, error) => res.status(status).json({ error });

/**
 * Vercel Cron: `class_sessions` scheduled -> completed senkronu.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok) return jsonError(res, 401, 'Unauthorized cron');

  try {
    await syncClassSessionsScheduledToCompleted();
    return res.status(200).json({ ok: true });
  } catch (e) {
    return jsonError(res, 500, e instanceof Error ? e.message : 'sync_failed');
  }
}
