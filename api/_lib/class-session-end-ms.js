import { normalizeTimeHms } from './class-lesson-reminder-logic.js';

const DEFAULT_LESSON_MINUTES = Math.max(
  15,
  Math.min(180, Number(process.env.CLASS_SESSION_DEFAULT_MINUTES || 40) || 40)
);

/** lesson_date + time → UTC ms (Europe/Istanbul +03:00) */
export function wallTimeToUtcMs(lessonDate, timeStr) {
  const safeTime = normalizeTimeHms(timeStr, '00:00:00');
  const ms = new Date(`${String(lessonDate || '').trim().slice(0, 10)}T${safeTime}+03:00`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Oturum bitiş anı. end_time yok veya gece yarısı (00:00) gibi geçersizse start + varsayılan süre.
 * Aksi halde sabah cron’undan önce oturum yanlışlıkla `completed` olur, hatırlatma gitmez.
 */
export function sessionEndUtcMs(lessonDate, startTime, endTime) {
  const startMs = wallTimeToUtcMs(lessonDate, startTime);
  if (startMs == null) return null;

  const endRaw = String(endTime || '').trim();
  const endMs = endRaw ? wallTimeToUtcMs(lessonDate, endTime) : null;

  if (endMs == null || endMs <= startMs) {
    return startMs + DEFAULT_LESSON_MINUTES * 60 * 1000;
  }
  return endMs;
}

/** Henüz başlamamış scheduled oturum yanlışlıkla completed yapılmış mı? */
export function shouldReopenScheduledSession(session, nowMs = Date.now()) {
  if (!session || String(session.status || '') !== 'completed') return false;
  const startMs = wallTimeToUtcMs(session.lesson_date, session.start_time);
  if (startMs == null) return false;
  const endMs = sessionEndUtcMs(session.lesson_date, session.start_time, session.end_time);
  if (endMs == null) return false;
  return nowMs < endMs;
}
