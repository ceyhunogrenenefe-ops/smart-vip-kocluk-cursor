/** İstanbul saati — sunucu `isSessionInLivePresenceWindow` ile uyumlu (yaklaşık). */

function normalizeTimeHms(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return '00:00:00';
  const parts = s.split(':');
  const h = parts[0]?.padStart(2, '0') || '00';
  const m = parts[1]?.padStart(2, '0') || '00';
  const sec = parts[2]?.padStart(2, '0') || '00';
  return `${h}:${m}:${sec}`;
}

function wallTimeToUtcMs(lessonDate: string, timeStr: string): number | null {
  const safeTime = normalizeTimeHms(timeStr);
  const ms = new Date(`${String(lessonDate || '').trim().slice(0, 10)}T${safeTime}+03:00`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function sessionEndUtcMs(lessonDate: string, startTime: string, endTime?: string | null): number | null {
  const startMs = wallTimeToUtcMs(lessonDate, startTime);
  if (startMs == null) return null;
  const endRaw = String(endTime || '').trim();
  const endMs = endRaw ? wallTimeToUtcMs(lessonDate, endTime!) : null;
  const defaultMin = 40;
  if (endMs == null || endMs <= startMs) return startMs + defaultMin * 60_000;
  return endMs;
}

export type LiveWindowSession = {
  lesson_date: string;
  start_time: string;
  end_time?: string | null;
  status?: string | null;
  class_id: string;
};

export function isSessionInLivePresenceWindow(session: LiveWindowSession, nowMs = Date.now()): boolean {
  const status = String(session.status || '');
  if (status !== 'scheduled' && status !== 'completed') return false;
  const startMs = wallTimeToUtcMs(session.lesson_date, session.start_time);
  const endMs = sessionEndUtcMs(session.lesson_date, session.start_time, session.end_time);
  if (startMs == null || endMs == null) return false;
  const windowStart = startMs - 15 * 60_000;
  const windowEnd = endMs + 45 * 60_000;
  return nowMs >= windowStart && nowMs <= windowEnd;
}

export function classIdsInLivePresenceWindow(
  sessions: LiveWindowSession[],
  nowMs = Date.now()
): string[] {
  const ids = new Set<string>();
  for (const s of sessions) {
    if (!isSessionInLivePresenceWindow(s, nowMs)) continue;
    const cid = String(s.class_id || '').trim();
    if (cid) ids.add(cid);
  }
  return [...ids];
}
