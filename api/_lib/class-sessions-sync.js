import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';
import { getIstanbulDateString, addCalendarDaysYmd } from './istanbul-time.js';
import { sessionEndUtcMs, shouldReopenScheduledSession } from './class-session-end-ms.js';

/**
 * `class_sessions` içinde `scheduled` olup bitiş zamanı geçenleri `completed` yapar.
 * Yanlışlıkla completed yapılmış ama ders saati gelmemiş oturumları `scheduled` yapar.
 */
/** Oturum durumu senkronu — poll başına en fazla bir kez (60s), ağır sorguyu sınırlar. */
let lastSyncAt = 0;
const SYNC_MIN_INTERVAL_MS = 60_000;

export async function syncClassSessionsScheduledToCompleted() {
  const now = Date.now();
  if (now - lastSyncAt < SYNC_MIN_INTERVAL_MS) {
    return { completed: 0, reopened: 0, skipped: true };
  }
  lastSyncAt = now;

  let completed = 0;
  let reopened = 0;
  const toReopen = [];
  const toComplete = [];
  try {
    const now = Date.now();
    const today = getIstanbulDateString();
    const horizonStr = addCalendarDaysYmd(today, 1);

    const { data: rows, error } = await supabaseAdmin
      .from('class_sessions')
      .select('id, lesson_date, start_time, end_time, status')
      .in('status', ['scheduled', 'completed'])
      .gte('lesson_date', addCalendarDaysYmd(today, -1))
      .lte('lesson_date', horizonStr)
      .limit(2000);
    if (error) throw error;

    for (const r of rows || []) {
      if (shouldReopenScheduledSession(r, now)) {
        toReopen.push(r.id);
        continue;
      }
      if (String(r.status || '') !== 'scheduled') continue;
      const endMs = sessionEndUtcMs(r.lesson_date, r.start_time, r.end_time);
      if (endMs != null && endMs <= now) {
        toComplete.push(r.id);
      }
    }

    for (let i = 0; i < toReopen.length; i += 50) {
      const slice = toReopen.slice(i, i + 50);
      const { error } = await supabaseAdmin
        .from('class_sessions')
        .update({ status: 'scheduled' })
        .in('id', slice);
      if (error) throw error;
      reopened += slice.length;
    }

    for (let i = 0; i < toComplete.length; i += 50) {
      const slice = toComplete.slice(i, i + 50);
      const { error } = await supabaseAdmin
        .from('class_sessions')
        .update({ status: 'completed' })
        .in('id', slice);
      if (error) throw error;
      completed += slice.length;
    }
  } catch (e) {
    console.warn('[class-sessions sync]', errorMessage(e));
  }
  return { completed, reopened };
}
