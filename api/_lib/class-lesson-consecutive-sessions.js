import { sessionEndUtcMs } from './class-session-end-ms.js';
import {
  areSessionsTimeConsecutive,
  extractConsecutiveChain,
  maxConsecutiveGapMinutes,
  timeToMinutes
} from './consecutive-class-bbb-reuse.js';

export function normLessonSubject(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function sameLessonDayGroup(a, b) {
  if (!a || !b) return false;
  return (
    String(a.class_id || '') === String(b.class_id || '') &&
    normLessonSubject(a.subject) === normLessonSubject(b.subject) &&
    String(a.teacher_id || '') === String(b.teacher_id || '') &&
    String(a.lesson_date || '').slice(0, 10) === String(b.lesson_date || '').slice(0, 10)
  );
}

function sortByStartTime(rows) {
  return [...(rows || [])].sort((a, b) => {
    const ta = timeToMinutes(a.start_time) ?? 0;
    const tb = timeToMinutes(b.start_time) ?? 0;
    if (ta !== tb) return ta - tb;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

/** Aynı gün / sınıf / ders / öğretmen oturumları (iptal hariç). */
export function filterSameLessonDaySessions(session, pool) {
  const list = Array.isArray(pool) ? pool : [];
  return sortByStartTime(
    list.filter(
      (s) =>
        sameLessonDayGroup(session, s) && String(s.status || '') !== 'cancelled'
    )
  );
}

/** Ardışık zincirin son oturumu mu? (tek ders veya art arda ikinci ders) */
export function isTerminalConsecutiveSession(session, pool, maxGap = maxConsecutiveGapMinutes()) {
  const peers = filterSameLessonDaySessions(session, pool);
  if (!peers.length) return true;
  const chain = extractConsecutiveChain(peers, session.id, maxGap);
  if (!chain.length) return true;
  const last = chain[chain.length - 1];
  return String(last?.id || '') === String(session?.id || '');
}

export function isClassSessionEnded(session, nowMs = Date.now()) {
  if (!session) return false;
  if (String(session.status || '') === 'cancelled') return false;
  if (String(session.status || '') === 'completed') return true;
  const endMs = sessionEndUtcMs(session.lesson_date, session.start_time, session.end_time);
  return endMs != null && endMs <= nowMs;
}

export function shouldPromptTopicCheckpoint(session, pool, nowMs = Date.now()) {
  if (!isClassSessionEnded(session, nowMs)) return false;
  return isTerminalConsecutiveSession(session, pool);
}
