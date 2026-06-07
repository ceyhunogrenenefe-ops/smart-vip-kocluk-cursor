import { authorizeVercelOrCronSecret, rejectUnauthorizedCron } from '../api/_lib/cron-auth.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';
import { runTaksitOverdueRemindersJob } from '../api/_lib/taksit-whatsapp-notify.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (rejectUnauthorizedCron(res, auth)) return;

  try {
    const result = await runTaksitOverdueRemindersJob({ triggeredBy: 'taksit-reminders' });
    await recordCronRun({
      jobKey: 'taksit_overdue_reminders',
      ok: true,
      detail: { sent: result.sent, skipped: result.skipped, failed: result.failed }
    });
    return res.status(200).json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cron-taksit-reminders] fatal', msg);
    await recordCronRun({ jobKey: 'taksit_overdue_reminders', ok: false, detail: { error: msg } });
    return res.status(500).json({ ok: false, error: msg });
  }
}
