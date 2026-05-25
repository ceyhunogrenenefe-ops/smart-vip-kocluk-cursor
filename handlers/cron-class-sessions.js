import { syncClassSessionsScheduledToCompleted } from '../api/_lib/class-sessions-sync.js';
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { getIstanbulDateString, addCalendarDaysYmd } from '../api/_lib/istanbul-time.js';
import { ensureClassSessionsFromWeeklySlots } from '../api/_lib/class-sessions-from-slots.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';

const jsonError = (res, status, error) => res.status(status).json({ error });

/**
 * Vercel Cron: haftalık şablondan oturum üret + scheduled/completed senkronu.
 * Sabah hatırlatmasından önce class_sessions satırları hazır olsun.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok) return jsonError(res, 401, 'Unauthorized cron');

  try {
    const today = getIstanbulDateString();
    const tomorrow = addCalendarDaysYmd(today, 1);
    const materializeToday = await ensureClassSessionsFromWeeklySlots(today);
    const materializeTomorrow = await ensureClassSessionsFromWeeklySlots(tomorrow);
    const sync = await syncClassSessionsScheduledToCompleted();
    await recordCronRun({
      jobKey: 'class_sessions_sync',
      ok: true,
      detail: { materializeToday, materializeTomorrow, sync }
    });
    return res.status(200).json({
      ok: true,
      materializeToday,
      materializeTomorrow,
      sync
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'sync_failed';
    await recordCronRun({ jobKey: 'class_sessions_sync', ok: false, detail: { error: msg } });
    return jsonError(res, 500, msg);
  }
}
