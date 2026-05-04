import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';

/** İstanbul duvar saati + sabit +03:00 */
function wallTimeToUtcMs(lessonDate, timeStr) {
  const t = normalizeTimeForParse(timeStr);
  const iso = `${lessonDate}T${t}+03:00`;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function normalizeTimeForParse(raw) {
  const s = String(raw || '').trim();
  if (!s) return '00:00:00';
  if (/^\d{1,2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) return s;
  return '00:00:00';
}

/**
 * `scheduled` derslerden bitiş zamanı geçmiş olanları `completed` yapar.
 */
export async function syncTeacherLessonsScheduledToCompleted() {
  try {
    const now = Date.now();
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 1);
    const horizonStr = horizon.toISOString().slice(0, 10);

    const { data: rows, error } = await supabaseAdmin
      .from('teacher_lessons')
      .select('id, lesson_date, end_time, status')
      .eq('status', 'scheduled')
      .lte('lesson_date', horizonStr)
      .limit(800);
    if (error) throw error;

    for (const r of rows || []) {
      const endMs = wallTimeToUtcMs(r.lesson_date, r.end_time);
      if (endMs != null && endMs <= now) {
        await supabaseAdmin.from('teacher_lessons').update({ status: 'completed' }).eq('id', r.id);
      }
    }
  } catch (e) {
    console.warn('[teacher-lessons sync]', errorMessage(e));
  }
}
