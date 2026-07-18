import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { getStudentPhones } from '../api/_lib/meetings-resolve.js';
import { deliverWhatsAppWithLog } from '../api/_lib/meeting-notify.js';
import { metaWhatsAppConfigured } from '../api/_lib/meta-whatsapp.js';
import { authorizeVercelOrCronSecret, rejectUnauthorizedCron } from '../api/_lib/cron-auth.js';
import { resolveGuestShareUrlForMeeting } from '../api/_lib/guest-join-share-url.js';
import { isBbbAutoMeetingLink, isBbbJoinUrl } from '../api/_lib/bbb.js';

const MAX_REMINDER_ATTEMPTS = 5;

function isAppGuestInviteUrl(url) {
  const s = String(url || '').trim();
  return /\/d\/[a-z0-9]+/i.test(s) || /\/misafir-katil\//i.test(s);
}

/** @param {{ meet_link: string, link_zoom?: string | null, link_bbb?: string | null }} m */
async function reminderBodyText(m) {
  const shareUrl = await resolveGuestShareUrlForMeeting(m);
  let t = `10 dakika içinde görüşmeniz başlıyor:\n${shareUrl}`;
  const zoom = String(m.link_zoom || '').trim();
  if (zoom && zoom !== shareUrl && zoom !== String(m.meet_link || '').trim()) {
    t += `\nZoom: ${zoom}`;
  }
  // Kısa davet / BBB akışı kullanıldıysa ham BBB join URL gönderme (WhatsApp'ta bozuluyor).
  if (!isAppGuestInviteUrl(shareUrl)) {
    const bbb = String(m.link_bbb || '').trim();
    if (
      bbb &&
      bbb !== shareUrl &&
      bbb !== String(m.meet_link || '').trim() &&
      !isBbbAutoMeetingLink(bbb) &&
      !isBbbJoinUrl(bbb)
    ) {
      t += `\nBBB: ${bbb}`;
    }
  }
  return t;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (rejectUnauthorizedCron(res, auth)) return;

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
      if (!phones.length) {
        log.push({ id: m.id, note: 'no_phone' });
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

      const bodyText = await reminderBodyText(m);
      try {
        const r = await deliverWhatsAppWithLog({
          meetingId: m.id,
          kind: 'whatsapp_reminder_10m',
          recipientE164: phones[0],
          body: bodyText,
          coachId: m.coach_id || student.coach_id || null
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
          body: await reminderBodyText(meet),
          coachId: meet.coach_id || null
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

    return res.status(200).json({ ok: true, processed: log.length, log });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ ok: false, error: msg, log });
  }
}
