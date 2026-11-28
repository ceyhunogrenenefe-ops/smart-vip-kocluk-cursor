import { authorizeVercelOrCronSecret, rejectUnauthorizedCron } from '../api/_lib/cron-auth.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';
import { runDailyDigest } from '../api/_lib/ad-video-service.js';

/** Her sabah 09:00 Türkiye: yeni ham teslim, inceleme bekleyen montaj, geciken iş. */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (rejectUnauthorizedCron(res, auth)) return;
  try {
    const result = await runDailyDigest();
    await recordCronRun({ jobKey: 'ad_video_digest', ok: true, detail: result }).catch(() => {});
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordCronRun({ jobKey: 'ad_video_digest', ok: false, detail: { error: message } }).catch(() => {});
    res.status(500).json({ ok: false, error: message });
  }
}
