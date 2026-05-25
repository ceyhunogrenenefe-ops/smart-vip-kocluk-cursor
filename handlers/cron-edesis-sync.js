/** Vercel cron: GET /api/cron/edesis-sync */
import edesisSync from './edesis-sync.js';

export default async function handler(req, res) {
  req.query = { ...(req.query || {}), op: 'cron-sync' };
  return edesisSync(req, res);
}
