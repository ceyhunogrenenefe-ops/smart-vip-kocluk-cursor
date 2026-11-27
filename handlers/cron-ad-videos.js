import { authorizeVercelOrCronSecret, rejectUnauthorizedCron } from '../api/_lib/cron-auth.js';
import { runAdVideoNotifyJob } from '../api/_lib/ad-videos-notify.js';

/**
 * 15 dakikada bir: reklam videosu teslim hatırlatmaları (24 saat kala, gecikme)
 * ve ayarlı saatte günlük özet. Aynı olay için tekrar bildirim gitmez.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (rejectUnauthorizedCron(res, auth)) return;
  try {
    const result = await runAdVideoNotifyJob({});
    return res.status(200).json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cron-ad-videos] fatal', msg);
    try {
      const { recordCronRun } = await import('../api/_lib/cron-run-log.js');
      await recordCronRun({ jobKey: 'ad_videos_notify', ok: false, detail: { error: msg } });
    } catch {
      /* ignore */
    }
    return res.status(500).json({ ok: false, error: msg });
  }
}
