import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { getIstanbulDateString, getIstanbulHour, getIstanbulMinute } from '../api/_lib/istanbul-time.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';
import { sendEventInvites } from '../api/_lib/institution-event-send.js';
import { syncSeminarRegistrationsToEvents } from '../api/_lib/sync-seminar-registrations.js';

function parseHm(timeVal) {
  const s = String(timeVal || '').slice(0, 8);
  const [h, m] = s.split(':');
  return { hour: parseInt(h, 10), minute: parseInt(m, 10) };
}

async function countPendingParticipants(eventId) {
  const { count, error } = await supabaseAdmin
    .from('institution_event_participants')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .in('whatsapp_status', ['pending', 'failed']);
  if (error) throw error;
  return count || 0;
}

async function processEvent(event, now, todayIstanbul, log) {
  if (!String(event.meeting_link || '').trim()) {
    log.push({ event_id: event.id, skip: 'no_meeting_link' });
    return;
  }

  const mode = String(event.send_mode || 'manual');
  const resendAll = mode === 'daily';

  try {
    const out = await sendEventInvites(event, { resendAll });
    await supabaseAdmin
      .from('institution_events')
      .update({
        last_schedule_run_at: now.toISOString(),
        schedule_status: mode === 'once' ? 'completed' : 'scheduled',
        updated_at: now.toISOString()
      })
      .eq('id', event.id);
    log.push({ event_id: event.id, mode, sent: out.sent, failed: out.failed });
  } catch (e) {
    log.push({ event_id: event.id, error: String(e?.message || e) });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized cron' });

  const log = [];
  const now = new Date();
  const todayIstanbul = getIstanbulDateString(now);
  const hour = getIstanbulHour(now);
  const minute = getIstanbulMinute(now);

  try {
    const syncOut = await syncSeminarRegistrationsToEvents({ log });
    log.push({ seminar_sync: syncOut.synced ?? 0, seminar_sent: syncOut.sent ?? 0, skipped: syncOut.skipped || null });

    const { data: onceRows, error: onceErr } = await supabaseAdmin
      .from('institution_events')
      .select('*')
      .eq('send_mode', 'once')
      .eq('schedule_status', 'scheduled')
      .not('scheduled_send_at', 'is', null)
      .lte('scheduled_send_at', now.toISOString());
    if (onceErr) throw onceErr;

    for (const ev of onceRows || []) {
      await processEvent(ev, now, todayIstanbul, log);
    }

    // Planlı gönderim tamamlandıktan sonra eklenen bekleyen katılımcılar
    const { data: onceCatchUp, error: catchErr } = await supabaseAdmin
      .from('institution_events')
      .select('*')
      .eq('send_mode', 'once')
      .eq('schedule_status', 'completed')
      .not('scheduled_send_at', 'is', null)
      .lte('scheduled_send_at', now.toISOString());
    if (catchErr) throw catchErr;

    for (const ev of onceCatchUp || []) {
      const pending = await countPendingParticipants(ev.id);
      if (pending > 0) {
        log.push({ event_id: ev.id, catch_up: true, pending });
        await processEvent(ev, now, todayIstanbul, log);
      }
    }

    const { data: dailyRows, error: dailyErr } = await supabaseAdmin
      .from('institution_events')
      .select('*')
      .eq('send_mode', 'daily')
      .eq('schedule_status', 'scheduled')
      .not('daily_send_time', 'is', null);
    if (dailyErr) throw dailyErr;

    for (const ev of dailyRows || []) {
      if (ev.event_date && String(ev.event_date).slice(0, 10) < todayIstanbul) {
        await supabaseAdmin
          .from('institution_events')
          .update({ schedule_status: 'completed', updated_at: now.toISOString() })
          .eq('id', ev.id);
        log.push({ event_id: ev.id, skip: 'event_date_passed' });
        continue;
      }

      const lastRun = ev.last_schedule_run_at ? getIstanbulDateString(new Date(ev.last_schedule_run_at)) : '';
      if (lastRun === todayIstanbul) {
        continue;
      }

      const { hour: th, minute: tm } = parseHm(ev.daily_send_time);
      if (!Number.isFinite(th) || !Number.isFinite(tm)) continue;
      const targetMin = th * 60 + tm;
      const nowMin = hour * 60 + minute;
      // 5 dk pencere kaçırılırsa bile aynı gün içinde bir kez gönder (cron */5)
      if (nowMin < targetMin) continue;

      await processEvent(ev, now, todayIstanbul, log);
    }

    await recordCronRun({ jobKey: 'institution_events', ok: true, processed: log.length });
    return res.status(200).json({ ok: true, log });
  } catch (e) {
    await recordCronRun({ jobKey: 'institution_events', ok: false, error: String(e?.message || e) });
    return res.status(500).json({ error: String(e?.message || e), log });
  }
}
