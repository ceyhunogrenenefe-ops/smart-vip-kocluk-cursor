import { syncTeacherLessonsScheduledToCompleted } from '../api/_lib/teacher-lessons-sync.js';

const jsonError = (res, status, error) => res.status(status).json({ error });

/**
 * Vercel Cron: `scheduled` canlı dersleri bitişe göre `completed` yapar.
 * Güvenlik: Vercel Cron isteklerinde `CRON_SECRET` varsa `Authorization: Bearer` doğrulanır.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token !== secret) return jsonError(res, 401, 'Unauthorized');
  }

  try {
    await syncTeacherLessonsScheduledToCompleted();
    return res.status(200).json({ ok: true });
  } catch (e) {
    return jsonError(res, 500, e instanceof Error ? e.message : 'sync_failed');
  }
}
