import { syncTeacherLessonsScheduledToCompleted } from '../api/_lib/teacher-lessons-sync.js';
import { authorizeVercelOrCronSecret, rejectUnauthorizedCron } from '../api/_lib/cron-auth.js';

const jsonError = (res, status, error) => res.status(status).json({ error });

/**
 * Vercel Cron: `scheduled` canlı dersleri bitişe göre `completed` yapar.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  const auth = authorizeVercelOrCronSecret(req);
  if (rejectUnauthorizedCron(res, auth)) return;

  try {
    await syncTeacherLessonsScheduledToCompleted();
    return res.status(200).json({ ok: true });
  } catch (e) {
    return jsonError(res, 500, e instanceof Error ? e.message : 'sync_failed');
  }
}
