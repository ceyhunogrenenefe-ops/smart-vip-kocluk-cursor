import { authorizeVercelOrCronSecret, rejectUnauthorizedCron } from '../api/_lib/cron-auth.js';
import { runCrmTaskRemindersJob } from '../api/_lib/crm-task-reminders.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (rejectUnauthorizedCron(res, auth)) return;

  try {
    const result = await runCrmTaskRemindersJob({ triggeredBy: 'crm-task-reminders' });
    await recordCronRun({ jobKey: 'crm_task_reminders', ok: true, detail: result }).catch(() => {});
    return res.status(200).json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cron-crm-task-reminders] fatal', msg);
    await recordCronRun({ jobKey: 'crm_task_reminders', ok: false, detail: { error: msg } }).catch(() => {});
    return res.status(500).json({ ok: false, error: msg });
  }
}
