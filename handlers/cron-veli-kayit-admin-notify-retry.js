import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';
import { runVeliKayitAdminNotifyRetryJob } from '../api/_lib/veli-kayit-admin-notify-retry.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized cron' });

  try {
    const out = await runVeliKayitAdminNotifyRetryJob();
    const sent = (out.summary || []).reduce((n, row) => n + (row.whatsapp_sent || 0), 0);
    const failed = (out.summary || []).filter((row) => row.error).length;
    await recordCronRun({
      jobKey: 'veli_kayit_admin_notify',
      ok: true,
      messages_sent: sent,
      messages_failed: failed,
      detail: out
    });
    return res.status(200).json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordCronRun({ jobKey: 'veli_kayit_admin_notify', ok: false, detail: { error: msg } });
    return res.status(500).json({ ok: false, error: msg });
  }
}
