import { supabaseAdmin } from './supabase-admin.js';
import { CLASS_LESSON_REMINDER_KIND } from './class-lesson-reminder-send.js';
import { shouldReopenScheduledSession } from './class-session-end-ms.js';

/**
 * reminder_sent=true ama başarılı WhatsApp logu yok → false (cron tekrar denesin).
 * status=completed ama ders henüz bitmedi → scheduled (sabah hatırlatması için).
 */
export async function reconcileClassSessionsForReminders(sessions, nowMs = Date.now()) {
  const list = [...(sessions || [])];
  if (!list.length) return { sessions: list, reopened: 0, resetReminderSent: 0 };

  let reopened = 0;
  let resetReminderSent = 0;

  const toReopen = list.filter((s) => shouldReopenScheduledSession(s, nowMs));
  if (toReopen.length) {
    const ids = toReopen.map((s) => s.id);
    const { error } = await supabaseAdmin.from('class_sessions').update({ status: 'scheduled' }).in('id', ids);
    if (!error) {
      reopened = ids.length;
      for (const s of list) {
        if (ids.includes(s.id)) s.status = 'scheduled';
      }
    } else {
      console.warn('[class-session-reconcile] reopen failed', error.message);
    }
  }

  const markedSent = list.filter((s) => s.reminder_sent && String(s.status || '') === 'scheduled');
  if (markedSent.length) {
    const ids = markedSent.map((s) => String(s.id));
    const { data: logs, error: logErr } = await supabaseAdmin
      .from('message_logs')
      .select('related_id')
      .eq('kind', CLASS_LESSON_REMINDER_KIND)
      .eq('status', 'sent')
      .in('related_id', ids);
    if (logErr) {
      console.warn('[class-session-reconcile] log check failed', logErr.message);
    } else {
      const okIds = new Set((logs || []).map((l) => String(l.related_id)));
      const staleIds = markedSent.filter((s) => !okIds.has(String(s.id))).map((s) => s.id);
      if (staleIds.length) {
        const { error } = await supabaseAdmin
          .from('class_sessions')
          .update({ reminder_sent: false })
          .in('id', staleIds);
        if (!error) {
          resetReminderSent = staleIds.length;
          for (const s of list) {
            if (staleIds.includes(s.id)) s.reminder_sent = false;
          }
        } else {
          console.warn('[class-session-reconcile] reset reminder_sent failed', error.message);
        }
      }
    }
  }

  return { sessions: list, reopened, resetReminderSent };
}
