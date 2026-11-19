/**
 * Cron: son 48 saatin sitesi/mağaza siparişlerini CRM "Web Sitesinden Gelen
 * Siparişler" ekranına yeniden eşitler. Anlık eşitleme bir sebeple kaçarsa
 * sipariş en geç bir sonraki çalışmada CRM'e düşer.
 */
import { authorizeVercelOrCronSecret, rejectUnauthorizedCron } from '../api/_lib/cron-auth.js';
import { reconcileRecentCrmWebsiteOrders } from '../api/_lib/crm-website-orders.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (rejectUnauthorizedCron(res, auth)) return;

  try {
    const result = await reconcileRecentCrmWebsiteOrders({ hours: 48 });
    await recordCronRun({ jobKey: 'crm_website_orders_reconcile', ok: true, detail: result }).catch(() => {});
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cron-crm-website-orders-reconcile] fatal', msg);
    await recordCronRun({ jobKey: 'crm_website_orders_reconcile', ok: false, detail: { error: msg } }).catch(() => {});
    return res.status(500).json({ ok: false, error: msg });
  }
}
