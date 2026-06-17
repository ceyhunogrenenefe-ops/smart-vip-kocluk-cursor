import { readFileSync } from 'fs';
import { metaWhatsAppConfigured } from '../api/_lib/meta-whatsapp.js';
import {
  reportReminderSendChannel,
  reportReminderIstHour
} from '../api/_lib/daily-report-reminder-job.js';
import { gatewayConfiguredForSession, reportReminderGatewaySessionId } from '../api/_lib/whatsapp-gateway-send.js';

for (const line of readFileSync('.env.vercel.report.check', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let val = m[2];
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  if (!process.env[m[1]]) process.env[m[1]] = val;
}

console.log(
  JSON.stringify(
    {
      meta_configured: metaWhatsAppConfigured(),
      channel: reportReminderSendChannel(),
      ist_hour: reportReminderIstHour(),
      report_reminder_channel_env: process.env.REPORT_REMINDER_CHANNEL ?? null,
      gateway_session: reportReminderGatewaySessionId() || null,
      gateway_configured: gatewayConfiguredForSession(reportReminderGatewaySessionId())
    },
    null,
    2
  )
);
