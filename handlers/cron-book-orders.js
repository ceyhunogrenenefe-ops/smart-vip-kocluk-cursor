import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';
import { processPendingBookOrderNotifications } from '../api/_lib/book-order-notify.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized cron' });

  try {
    const out = await processPendingBookOrderNotifications({ limit: 100 });
    await recordCronRun({ jobKey: 'book_orders', ok: true, processed: out.processed });
    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    await recordCronRun({ jobKey: 'book_orders', ok: false, error: String(e?.message || e) });
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
