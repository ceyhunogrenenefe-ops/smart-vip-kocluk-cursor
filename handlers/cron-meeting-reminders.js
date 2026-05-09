import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { getStudentPhones } from '../api/_lib/meetings-resolve.js';
import { deliverWhatsAppWithLog } from '../api/_lib/meeting-notify.js';
import { metaWhatsAppConfigured } from '../api/_lib/meta-whatsapp.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';

const MAX_REMINDER_ATTEMPTS = 5;

/** @param {{ meet_link: string, link_zoom?: string | null, link_bbb?: string | null }} m */
function reminderBodyText(m) {
  let t = `10 dakika içinde görüşmeniz başlıyor: ${m.meet_link}`;
  if (m.link_zoom) t += `\nZoom: ${m.link_zoom}`;
  if (m.link_bbb) t += `\nBBB: ${m.link_bbb}`;
  return t;
}

function authorizeCron(req) {
  const secret = process.env.MEETING_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim();
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

  const log = [];

  try {
    const metaReady = metaWhatsAppConfigured();
    const nowMs = Date.now();

    const { data: upcoming, error: upErr } = await supabaseAdmin
      .from('meetings')
      .select('*')
      .eq('status', 'planned')
      .eq('whatsapp_reminder_sent', false)
      .gte('start_time', new Date(nowMs + 2 * 60_000).toISOString())
      .lte('start_time', new Date(nowMs + 48 * 60 * 60_000).toISOString());
    if (upErr) throw upErr;

    for (const m of upcoming || []) {
      const startMs = new Date(m.start_time).getTime();
      const untilStart = startMs - nowMs;
      const inReminderWindow = untilStart >= 7 * 60_000 && untilStart <= 13 * 60_000;
      if (!inReminderWindow) continue;

      const { data: student } = await supabaseAdmin.from('students').select('*').eq('id', m.student_id).maybeSingle();
      if (!student) continue;
      const phones = await getStudentPhones(student);
      if (!phones.length || !metaReady) {
        log.push({ id: m.id, note: metaReady ? 'no_phone' : 'missing_meta_whatsapp_env' });
        continue;
      }

      const { data: notifRow } = await supabaseAdmin
        .from('meeting_notification_log')
        .select('attempt_count,status')
        .eq('meeting_id', m.id)
        .eq('channel', 'whatsapp')
        .eq('kind', 'whatsapp_reminder_10m')
        .maybeSingle();

      const attempts = notifRow?.attempt_count ?? 0;
      if ((notifRow?.status === 'failed' || notifRow?.status === 'pending') && attempts >= MAX_REMINDER_ATTEMPTS) {
        log.push({ id: m.id, note: 'max_attempts' });
        continue;
      }

      const bodyText = reminderBodyText(m);
      try {
        const r = await deliverWhatsAppWithLog({
          meetingId: m.id,
          kind: 'whatsapp_reminder_10m',
          recipientE164: phones[0],
          body: bodyText
        });
        if (r.ok && !r.skipped) {
          await supabaseAdmin.from('meetings').update({ whatsapp_reminder_sent: true, updated_at: new Date().toISOString() }).eq('id', m.id);
        }
        log.push({ id: m.id, whatsapp: r });
      } catch (e) {
        log.push({ id: m.id, error: e instanceof Error ? e.message : String(e) });
      }
    }

    /** Retry failed logs (recent) */
    const { data: failed } = await supabaseAdmin
      .from('meeting_notification_log')
      .select('*')
      .eq('kind', 'whatsapp_reminder_10m')
      .eq('channel', 'whatsapp')
      .eq('status', 'failed')
      .lt('attempt_count', MAX_REMINDER_ATTEMPTS)
      .gte('created_at', new Date(nowMs - 6 * 60 * 60_000).toISOString());

    for (const f of failed || []) {
      const { data: meet } = await supabaseAdmin.from('meetings').select('*').eq('id', f.meeting_id).maybeSingle();
      if (!meet || meet.status !== 'planned' || meet.whatsapp_reminder_sent) continue;
      const untilStart = new Date(meet.start_time).getTime() - nowMs;
      if (untilStart < 0 || untilStart > 20 * 60_000) continue;
      try {
        const r = await deliverWhatsAppWithLog({
          meetingId: meet.id,
          kind: 'whatsapp_reminder_10m',
          recipientE164: f.recipient_e164,
          body: reminderBodyText(meet)
        });
        if (r.ok && !r.skipped) {
          await supabaseAdmin
            .from('meetings')
            .update({ whatsapp_reminder_sent: true, updated_at: new Date().toISOString() })
            .eq('id', meet.id);
        }
        log.push({ retry: meet.id, r });
      } catch {}
    }

    let sentOk = 0;
    let failed = 0;
    for (const row of log) {
      const w = row.whatsapp ?? row.r;
      if (w && typeof w === 'object') {
        if (w.ok && !w.skipped) sentOk += 1;
        else failed += 1;
      } else if (row.error || row.retry) {
        failed += 1;
      }
    }
    await recordCronRun({
      jobKey: 'meeting_reminders',
      ok: true,
      messagesSent: sentOk,
      messagesFailed: failed,
      detail: { entries: log.length }
    });
    return res.status(200).json({ ok: true, processed: log.length, log });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordCronRun({ jobKey: 'meeting_reminders', ok: false, detail: { error: msg } });
    return res.status(500).json({ ok: false, error: msg, log });
  }
}

