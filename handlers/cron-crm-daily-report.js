import { authorizeVercelOrCronSecret, rejectUnauthorizedCron } from '../api/_lib/cron-auth.js';
import { runCrmDailyReportJob } from '../api/_lib/crm-daily-report.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';

/** Her akşam 21:00 (TR): CRM günlük raporu arşivle ve admin + temsilcilere WhatsApp ile gönder. */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (rejectUnauthorizedCron(res, auth)) return;

  try {
    const result = await runCrmDailyReportJob({});
    await recordCronRun({ jobKey: 'crm_daily_report', ok: true, detail: result }).catch(() => {});
    return res.status(200).json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cron-crm-daily-report] fatal', msg);
    await recordCronRun({ jobKey: 'crm_daily_report', ok: false, detail: { error: msg } }).catch(() => {});
    return res.status(500).json({ ok: false, error: msg });
  }
}
