import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';
import { getIstanbulDateString, addCalendarDaysYmd } from './istanbul-time.js';
import { sessionEndUtcMs, shouldReopenScheduledSession } from './class-session-end-ms.js';

/**
 * `class_sessions` içinde `scheduled` olup bitiş zamanı geçenleri `completed` yapar.
 * Yanlışlıkla completed yapılmış ama ders saati gelmemiş oturumları `scheduled` yapar.
 */
export async function syncClassSessionsScheduledToCompleted() {
  let completed = 0;
  let reopened = 0;
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
        await supabaseAdmin.from('class_sessions').update({ status: 'scheduled' }).eq('id', r.id);
        reopened += 1;
        continue;
      }
      if (String(r.status || '') !== 'scheduled') continue;

      const endMs = sessionEndUtcMs(r.lesson_date, r.start_time, r.end_time);
      if (endMs != null && endMs <= now) {
        await supabaseAdmin.from('class_sessions').update({ status: 'completed' }).eq('id', r.id);
        completed += 1;
      }
    }
  } catch (e) {
    console.warn('[class-sessions sync]', errorMessage(e));
  }
  return { completed, reopened };
}
