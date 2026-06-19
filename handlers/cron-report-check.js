import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { getIstanbulHour } from '../api/_lib/istanbul-time.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';
import {
  runDailyReportReminderJob,
  reportReminderIstHour,
  reportReminderSendChannel
} from '../api/_lib/daily-report-reminder-job.js';

/**
 * Günlük rapor hatırlatması — varsayılan: Meta şablonu 22:00 İstanbul.
 * vercel.json: `0 19 * * *` (UTC) = 22:00 TR
 *
 * Bearer ile manuel tetikleme: saat filtresi atlanır.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized cron' });

  const hourIst = getIstanbulHour();
  const skipHourCheck = auth.source !== 'vercel';

  try {
    const out = await runDailyReportReminderJob({ skipHourCheck, istanbulHour: hourIst });

    if (out.skipped === 'report_reminder_wrong_istanbul_hour') {
      await recordCronRun({
        jobKey: 'daily_report_reminder',
        ok: true,
        skipped: out.skipped,
        detail: {
          channel: out.channel,
          istanbul_hour: out.istanbul_hour,
          expected_hour: out.expected_hour
        }
      });
      return res.status(200).json(out);
    }

    if (out.skipped === true || typeof out.skipped === 'string') {
      await recordCronRun({
        jobKey: 'daily_report_reminder',
        ok: out.ok !== false,
        skipped: String(out.skipped || out.reason || 'skipped'),
        detail: out
      });
      return res.status(200).json(out);
    }

    await recordCronRun({
      jobKey: 'daily_report_reminder',
      ok: true,
      messagesSent: out.messages_sent || 0,
      messagesFailed: out.messages_failed || 0,
      detail: {
        channel: out.channel,
        istanbul_hour: out.istanbul_hour,
        expected_hour: reportReminderIstHour(),
        send_channel_config: reportReminderSendChannel()
      }
    });
    return res.status(200).json({
      ok: true,
      processed: out.processed,
      channel: out.channel,
      log: out.log
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordCronRun({ jobKey: 'daily_report_reminder', ok: false, detail: { error: msg } });
    return res.status(500).json({
      ok: false,
      error: msg,
      hint: 'Tablolar: student-coaching-system/sql/2026-05-03-whatsapp-automation-templates-logs.sql'
    });
  }
}
