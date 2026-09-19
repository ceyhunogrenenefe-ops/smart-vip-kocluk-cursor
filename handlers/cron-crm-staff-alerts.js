import { authorizeVercelOrCronSecret, rejectUnauthorizedCron } from '../api/_lib/cron-auth.js';
import { runStaffAlertsJob } from '../api/_lib/crm-staff-alerts.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';

/** FAZ 7 — personele resmî Meta şablonu ile WhatsApp bildirimi (5 dk'da bir) */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (rejectUnauthorizedCron(res, auth)) return;

  try {
    const result = await runStaffAlertsJob();
    await recordCronRun({ jobKey: 'crm_staff_alerts', ok: true, detail: result }).catch(() => {});
    return res.status(200).json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cron-crm-staff-alerts] fatal', msg);
    await recordCronRun({ jobKey: 'crm_staff_alerts', ok: false, detail: { error: msg } }).catch(() => {});
    return res.status(500).json({ ok: false, error: msg });
  }
}
