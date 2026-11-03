/**
 * Etkinlik hatırlatmaları — cron/institution-events her 5 dakikada çağırır.
 * Kural başına (institution_event_reminders) her katılımcıya en fazla bir mesaj
 * (institution_event_reminder_sends unique(reminder_id, participant_id)).
 */
import { supabaseAdmin } from './supabase-admin.js';
import { getIstanbulDateString, addCalendarDaysYmd } from './istanbul-time.js';
import {
  resolveEventMeetingLink,
  sendParticipantWhatsApp,
  templateBindingsNeedLink
} from './institution-event-send.js';
import {
  isReminderDue,
  participantEligibleForReminder,
  reminderFireMs
} from './event-form-logic.js';

/** Bir çalıştırmada en fazla bu kadar mesaj (fonksiyon süre sınırı) — kalan bir sonraki turda gider */
const MAX_SENDS_PER_RUN = 150;

function isMissingTableError(error) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '').toLowerCase();
  return code === '42P01' || code === 'PGRST205' || msg.includes('institution_event_reminder');
}

export async function processEventReminders({ now = new Date(), log = [] } = {}) {
  const nowMs = now.getTime();
  const today = getIstanbulDateString(now);
  const tomorrow = addCalendarDaysYmd(today, 1);
  const out = { due: 0, sent: 0, failed: 0, skipped: 0 };

  // Yalnız bugün/yarın tarihli etkinlikler (en uzun pencere: 1 gün önce + gecikme payı)
  const { data: events, error: evErr } = await supabaseAdmin
    .from('institution_events')
    .select('*')
    .gte('event_date', today)
    .lte('event_date', addCalendarDaysYmd(tomorrow, 14))
    .not('event_time', 'is', null);
  if (evErr) throw evErr;
  if (!events?.length) return out;

  const eventById = new Map(events.map((e) => [e.id, e]));
  const { data: reminders, error: rErr } = await supabaseAdmin
    .from('institution_event_reminders')
    .select('*')
    .eq('enabled', true)
    .in('event_id', [...eventById.keys()]);
  if (rErr) {
    if (isMissingTableError(rErr)) {
      log.push({ reminders: 'schema_missing' });
      return out;
    }
    throw rErr;
  }

  const templateCache = new Map();
  async function loadTemplate(type) {
    if (templateCache.has(type)) return templateCache.get(type);
    const { data } = await supabaseAdmin.from('message_templates').select('*').eq('type', type).maybeSingle();
    templateCache.set(type, data || null);
    return data || null;
  }

  let budget = MAX_SENDS_PER_RUN;
  for (const reminder of reminders || []) {
    if (budget <= 0) break;
    const event = eventById.get(reminder.event_id);
    if (!event || event.schedule_status === 'cancelled') continue;
    if (!isReminderDue(event, reminder, nowMs)) continue;
    out.due += 1;

    const templateType = String(reminder.template_type || event.template_type || '').trim();
    const tpl = templateType ? await loadTemplate(templateType) : null;
    if (!tpl?.content) {
      log.push({ reminder_id: reminder.id, event_id: event.id, skip: 'template_not_found' });
      continue;
    }
    if (templateBindingsNeedLink(tpl) && !resolveEventMeetingLink(event)) {
      log.push({ reminder_id: reminder.id, event_id: event.id, skip: 'no_meeting_link' });
      continue;
    }

    const fireMs = reminderFireMs(event, reminder);
    const { data: participants, error: pErr } = await supabaseAdmin
      .from('institution_event_participants')
      .select('*')
      .eq('event_id', event.id);
    if (pErr) throw pErr;

    const { data: done } = await supabaseAdmin
      .from('institution_event_reminder_sends')
      .select('participant_id')
      .eq('reminder_id', reminder.id);
    const doneIds = new Set((done || []).map((d) => d.participant_id));

    // Aynı telefona aynı hatırlatma bir kez (aynı veli iki çocuk kaydetmiş olabilir)
    const seenPhones = new Set();
    for (const p of participants || []) {
      if (doneIds.has(p.id) && p.phone) seenPhones.add(p.phone);
    }

    for (const p of participants || []) {
      if (budget <= 0) break;
      if (doneIds.has(p.id)) continue;
      if (!participantEligibleForReminder(p, fireMs)) continue;
      if (seenPhones.has(p.phone)) {
        await supabaseAdmin
          .from('institution_event_reminder_sends')
          .insert({ reminder_id: reminder.id, participant_id: p.id, status: 'skipped', error: 'duplicate_phone' });
        out.skipped += 1;
        continue;
      }

      // Önce kaydı "sending" olarak al — paralel cron çalışırsa unique ihlali ile ikinci gönderim engellenir
      const { data: claim, error: claimErr } = await supabaseAdmin
        .from('institution_event_reminder_sends')
        .insert({ reminder_id: reminder.id, participant_id: p.id, status: 'sending' })
        .select('id')
        .maybeSingle();
      if (claimErr || !claim) continue;

      budget -= 1;
      seenPhones.add(p.phone);
      let sent;
      try {
        sent = await sendParticipantWhatsApp(event, p, templateType, tpl, 'institution_event_reminder');
      } catch (e) {
        sent = { ok: false, error: String(e?.message || e) };
      }
      await supabaseAdmin
        .from('institution_event_reminder_sends')
        .update({
          status: sent.ok ? 'sent' : 'failed',
          error: sent.ok ? null : String(sent.error || 'send_failed').slice(0, 500),
          sent_at: sent.ok ? new Date().toISOString() : null
        })
        .eq('id', claim.id);
      if (sent.ok) out.sent += 1;
      else out.failed += 1;
    }

    await supabaseAdmin
      .from('institution_event_reminders')
      .update({ last_run_at: now.toISOString() })
      .eq('id', reminder.id);
  }

  if (out.due) log.push({ reminders: out });
  return out;
}
