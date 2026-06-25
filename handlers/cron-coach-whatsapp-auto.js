import { runCoachWhatsappAutoCron } from '../api/_lib/coach-whatsapp-auto-cron.js';
import { runCoachWhatsappGatewayAutoCron } from '../api/_lib/coach-whatsapp-gateway-auto-cron.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';
import { authorizeVercelOrCronSecret, rejectUnauthorizedCron } from '../api/_lib/cron-auth.js';

function countSendStats(summary) {
  let sent = 0;
  let failed = 0;
  for (const s of summary || []) {
    for (const row of s.log || []) {
      if (row.ok === true) sent += 1;
      else if (row.ok === false || row.error) failed += 1;
    }
  }
  return { sent, failed };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (rejectUnauthorizedCron(res, auth)) return;

  if (process.env.COACH_WHATSAPP_AUTO_ENABLED === 'false') {
    return res.status(200).json({
      ok: true,
      skipped: 'COACH_WHATSAPP_AUTO_ENABLED is false',
      hint: 'Vercel env: COACH_WHATSAPP_AUTO_ENABLED=true veya değişkeni kaldırın.'
    });
  }

  try {
    const metaOut = await runCoachWhatsappAutoCron();
    const gatewayOut = await runCoachWhatsappGatewayAutoCron();

    const metaStats = countSendStats(metaOut.summary);
    const gatewayStats = countSendStats(gatewayOut.summary);
    const combinedSent = metaStats.sent + gatewayStats.sent;
    const combinedFailed = metaStats.failed + gatewayStats.failed;

    if (
      (metaOut.skipped === true && metaOut.reason) ||
      (gatewayOut.skipped === true && gatewayOut.reason)
    ) {
      await recordCronRun({
        jobKey: 'coach_followup',
        ok: true,
        skipped: [metaOut.reason, gatewayOut.reason].filter(Boolean).join('; ') || 'partial_skip',
        detail: { meta: metaOut, gateway: gatewayOut }
      });
    } else if (
      (metaOut.summary && Array.isArray(metaOut.summary)) ||
      (gatewayOut.summary && Array.isArray(gatewayOut.summary))
    ) {
      await recordCronRun({
        jobKey: 'coach_followup',
        ok: metaOut.ok !== false && gatewayOut.ok !== false,
        messagesSent: combinedSent,
        messagesFailed: combinedFailed,
        detail: {
          meta_schedules: metaOut.summary?.length || 0,
          gateway_schedules: gatewayOut.summary?.length || 0
        }
      });
    } else {
      await recordCronRun({
        jobKey: 'coach_followup',
        ok: Boolean(metaOut.ok || gatewayOut.ok),
        detail: { meta: metaOut, gateway: gatewayOut }
      });
    }

    return res.status(200).json({
      ok: metaOut.ok !== false && gatewayOut.ok !== false,
      meta: metaOut,
      gateway: gatewayOut
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordCronRun({ jobKey: 'coach_followup', ok: false, detail: { error: msg } });
    return res.status(500).json({ ok: false, error: msg });
  }
}
