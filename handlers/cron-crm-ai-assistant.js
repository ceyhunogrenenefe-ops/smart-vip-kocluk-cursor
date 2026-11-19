import { authorizeVercelOrCronSecret, rejectUnauthorizedCron } from '../api/_lib/cron-auth.js';
import { processPendingSessions } from '../api/_lib/crm-ai-assistant.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';

/**
 * AI Satış Asistanı yedek kuyruğu: webhook'un arka plan işi yarıda kaldıysa
 * (zaman aşımı, soğuk başlatma) bekleyen konuşmaları işler. Modül kapalıyken iş yapmaz.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (rejectUnauthorizedCron(res, auth)) return;

  try {
    const result = await processPendingSessions({ limit: 8 });
    if (result.processed) {
      await recordCronRun({ jobKey: 'crm_ai_assistant', ok: true, detail: { processed: result.processed } }).catch(() => {});
    }
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cron-crm-ai-assistant] fatal', msg);
    await recordCronRun({ jobKey: 'crm_ai_assistant', ok: false, detail: { error: msg } }).catch(() => {});
    return res.status(500).json({ ok: false, error: msg });
  }
}
