import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';
import { runBbbClassAttendanceJob } from '../api/_lib/run-bbb-class-attendance-job.js';
import { errorMessage } from '../api/_lib/error-msg.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized cron' });

  try {
    const detail = await runBbbClassAttendanceJob();
    const skipped = detail.skipped === 'bbb_auto_attendance_disabled';
    await recordCronRun({
      jobKey: 'bbb_class_attendance',
      ok: true,
      detail: skipped ? { skipped: detail.skipped } : detail
    });
    return res.status(200).json({ ok: true, ...detail });
  } catch (e) {
    const msg = errorMessage(e);
    await recordCronRun({ jobKey: 'bbb_class_attendance', ok: false, detail: { error: msg } });
    return res.status(500).json({ ok: false, error: msg });
  }
}
