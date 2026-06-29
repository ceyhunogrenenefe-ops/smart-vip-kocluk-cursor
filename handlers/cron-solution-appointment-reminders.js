import { authorizeVercelOrCronSecret, rejectUnauthorizedCron } from '../api/_lib/cron-auth.js';
import { runSolutionAppointmentRemindersJob } from '../api/_lib/run-solution-appointment-reminders-job.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (rejectUnauthorizedCron(res, auth)) return;

  try {
    const result = await runSolutionAppointmentRemindersJob({ triggeredBy: 'solution-appointment-reminders' });
    return res.status(200).json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cron-solution-appointment-reminders] fatal', msg);
    const { recordCronRun } = await import('../api/_lib/cron-run-log.js');
    await recordCronRun({ jobKey: 'solution_appointment_reminders', ok: false, detail: { error: msg } });
    return res.status(500).json({ ok: false, error: msg });
  }
}
