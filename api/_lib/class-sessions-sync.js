import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';

function wallTimeToUtcMs(lessonDate, timeStr) {
  const safeTime = String(timeStr || '00:00:00').slice(0, 8);
  const ms = new Date(`${lessonDate}T${safeTime}+03:00`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * `class_sessions` içinde `scheduled` olup bitiş zamanı geçenleri `completed` yapar.
 */
export async function syncClassSessionsScheduledToCompleted() {
  try {
    const now = Date.now();
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 1);
    const horizonStr = horizon.toISOString().slice(0, 10);

    const { data: rows, error } = await supabaseAdmin
      .from('class_sessions')
      .select('id, lesson_date, end_time, status')
      .eq('status', 'scheduled')
      .lte('lesson_date', horizonStr)
      .limit(1000);
    if (error) throw error;

    for (const r of rows || []) {
      const endMs = wallTimeToUtcMs(r.lesson_date, r.end_time);
      if (endMs != null && endMs <= now) {
        await supabaseAdmin.from('class_sessions').update({ status: 'completed' }).eq('id', r.id);
      }
    }
  } catch (e) {
    console.warn('[class-sessions sync]', errorMessage(e));
  }
}
