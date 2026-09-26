import { authorizeVercelOrCronSecret, rejectUnauthorizedCron } from '../api/_lib/cron-auth.js';
import { runAutoGreetingFollowups } from '../api/_lib/crm-auto-greeting.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';

/**
 * Otomatik karşılamada seçim yapmayan sohbetlere danışman mesajı.
 * Süre kurum ayarından gelir (varsayılan 3 dk); oturum başına bir kez gönderilir.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (rejectUnauthorizedCron(res, auth)) return;

  try {
    const result = await runAutoGreetingFollowups({});
    await recordCronRun({ jobKey: 'crm_auto_greeting_followup', ok: true, detail: result }).catch(() => {});
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cron-crm-auto-greeting-followup] fatal', msg);
    await recordCronRun({ jobKey: 'crm_auto_greeting_followup', ok: false, detail: { error: msg } }).catch(() => {});
    return res.status(500).json({ ok: false, error: msg });
  }
}
