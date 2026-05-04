import { runCoachWhatsappAutoCron } from '../api/_lib/coach-whatsapp-auto-cron.js';

function authorizeCron(req) {
  const secret =
    process.env.COACH_WHATSAPP_CRON_SECRET?.trim() ||
    process.env.MEETING_CRON_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim();
  const auth = req.headers?.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const vercelCron = req.headers['x-vercel-cron'] || req.headers['x-vercel-cron'.toLowerCase()];
  if (vercelCron && String(vercelCron) === '1') return true;
  if (secret && token === secret) return true;
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!authorizeCron(req)) {
    return res.status(401).json({ error: 'Unauthorized cron' });
  }

  if (process.env.COACH_WHATSAPP_AUTO_ENABLED === 'false') {
    return res.status(200).json({
      ok: true,
      skipped: 'COACH_WHATSAPP_AUTO_ENABLED is false',
      hint: 'Vercel env: COACH_WHATSAPP_AUTO_ENABLED=true veya değişkeni kaldırın.'
    });
  }

  try {
    const out = await runCoachWhatsappAutoCron();
    return res.status(200).json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ ok: false, error: msg });
  }
}
