import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';
import { runVeliSignReadyNotifyRetryJob } from '../api/_lib/veli-sign-ready-notify-retry.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized cron' });

  try {
    const out = await runVeliSignReadyNotifyRetryJob();
    const sent = (out.summary || []).filter((row) => row.ok && !row.skipped).length;
    const failed = (out.summary || []).filter((row) => row.error || (row.ok === false)).length;
    await recordCronRun({
      jobKey: 'veli_sign_ready_notify',
      ok: true,
      messages_sent: sent,
      messages_failed: failed,
      detail: out
    });
    return res.status(200).json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordCronRun({ jobKey: 'veli_sign_ready_notify', ok: false, detail: { error: msg } });
    return res.status(500).json({ ok: false, error: msg });
  }
}
