import type { SessionBatchPeerRow } from './classSessionBatchPeers';

const DEFAULT_GAP_MIN = 20;

function timeToMinutes(timeStr: string): number | null {
  const s = String(timeStr || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function normLessonSubject(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function areSessionsTimeConsecutive(
  prev: SessionBatchPeerRow,
  next: SessionBatchPeerRow,
  maxGapMinutes = DEFAULT_GAP_MIN
): boolean {
  const prevEnd = timeToMinutes(prev?.end_time);
  const nextStart = timeToMinutes(next?.start_time);
  if (prevEnd == null || nextStart == null) return false;
  const gap = nextStart - prevEnd;
  if (gap < 0) return gap >= -5;
  return gap <= maxGapMinutes;
}

function sortByStartTime(rows: SessionBatchPeerRow[]): SessionBatchPeerRow[] {
  return [...rows].sort((a, b) => {
    const ta = timeToMinutes(a.start_time) ?? 0;
    const tb = timeToMinutes(b.start_time) ?? 0;
    if (ta !== tb) return ta - tb;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

function extractConsecutiveChain(
  orderedSameLesson: SessionBatchPeerRow[],
  sessionId: string,
  maxGapMinutes = DEFAULT_GAP_MIN
): SessionBatchPeerRow[] {
  const list = orderedSameLesson;
  const idx = list.findIndex((s) => String(s?.id || '') === String(sessionId || ''));
  if (idx < 0) return [];
  let start = idx;
  let end = idx;
  while (start > 0 && areSessionsTimeConsecutive(list[start - 1], list[start], maxGapMinutes)) {
    start -= 1;
  }
  while (end < list.length - 1 && areSessionsTimeConsecutive(list[end], list[end + 1], maxGapMinutes)) {
    end += 1;
  }
  return list.slice(start, end + 1);
}

export function sameLessonDayGroup(a: SessionBatchPeerRow, b: SessionBatchPeerRow): boolean {
  return (
    String(a.class_id || '') === String(b.class_id || '') &&
    normLessonSubject(a.subject) === normLessonSubject(b.subject) &&
    String(a.teacher_id || '') === String(b.teacher_id || '') &&
    String(a.lesson_date || '').slice(0, 10) === String(b.lesson_date || '').slice(0, 10)
  );
}

export function filterSameLessonDaySessions<T extends SessionBatchPeerRow>(session: T, pool: T[]): T[] {
  return sortByStartTime(
    pool.filter((s) => sameLessonDayGroup(session, s) && String(s.status || '') !== 'cancelled')
  );
}

export function isTerminalConsecutiveSession<T extends SessionBatchPeerRow>(session: T, pool: T[]): boolean {
  const peers = filterSameLessonDaySessions(session, pool);
  if (!peers.length) return true;
  const chain = extractConsecutiveChain(peers, session.id);
  if (!chain.length) return true;
  return chain[chain.length - 1].id === session.id;
}

/** Istanbul +03:00 bitiş anı (yaklaşık). */
export function sessionEndMs(lessonDate: string, startTime: string, endTime: string): number | null {
  const date = String(lessonDate || '').slice(0, 10);
  const norm = (t: string) => {
    const p = String(t || '').trim().slice(0, 8);
    return p.length >= 5 ? (p.length === 5 ? `${p}:00` : p) : '00:00:00';
  };
  const startMs = new Date(`${date}T${norm(startTime)}+03:00`).getTime();
  let endMs = new Date(`${date}T${norm(endTime)}+03:00`).getTime();
  if (Number.isNaN(startMs)) return null;
  if (Number.isNaN(endMs) || endMs <= startMs) {
    endMs = startMs + 40 * 60 * 1000;
  }
  return endMs;
}

export function isClassSessionEnded(
  session: Pick<SessionBatchPeerRow, 'lesson_date' | 'start_time' | 'end_time' | 'status'>,
  nowMs = Date.now()
): boolean {
  if (String(session.status || '') === 'cancelled') return false;
  if (String(session.status || '') === 'completed') return true;
  const end = sessionEndMs(session.lesson_date, session.start_time, session.end_time);
  return end != null && end <= nowMs;
}

export function shouldPromptTopicCheckpoint<T extends SessionBatchPeerRow>(session: T, pool: T[]): boolean {
  if (!isClassSessionEnded(session)) return false;
  return isTerminalConsecutiveSession(session, pool);
}
