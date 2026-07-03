import { bbbFindRunningMeetingAttendees } from './bbb.js';
import {
  collectBbbMeetingIdsForLiveSession,
  findBbbAttendeeForStudentName,
  normalizePersonNameForMatch,
  stripBbbDisplayNameNoise
} from './bbb-attendance.js';
import { sessionEndUtcMs, wallTimeToUtcMs } from './class-session-end-ms.js';

/** @type {Map<string, Map<string, { firstSeenAt: string, lastActiveAt: string }>>} */
const trackBySession = new Map();

const TRACK_TTL_MS = 6 * 60 * 60_000;
const JOIN_GRACE_MS = 90_000;

export function getBbbPassiveIdleSeconds(override) {
  const raw = override != null ? Number(override) : Number(process.env.BBB_PASSIVE_IDLE_SECONDS || 180);
  if (!Number.isFinite(raw) || raw < 30) return 180;
  return Math.min(900, Math.max(30, Math.floor(raw)));
}

function pruneSessionTrack(sessionId) {
  const sid = String(sessionId || '').trim();
  if (!sid) return;
  const map = trackBySession.get(sid);
  if (!map) return;
  const cutoff = Date.now() - TRACK_TTL_MS;
  for (const [k, v] of map.entries()) {
    if (new Date(v.lastActiveAt).getTime() < cutoff) map.delete(k);
  }
  if (!map.size) trackBySession.delete(sid);
}

function attendeeShowsActivity(attendee) {
  return Boolean(attendee?.hasVideo || attendee?.hasJoinedVoice || !attendee?.isListeningOnly);
}

function trackKeyForAttendee(attendee) {
  return normalizePersonNameForMatch(stripBbbDisplayNameNoise(attendee?.fullName || ''));
}

/**
 * @param {string} sessionId
 * @param {Array<{ fullName: string, hasVideo?: boolean, hasJoinedVoice?: boolean, isListeningOnly?: boolean }>} attendees
 * @param {string} nowIso
 */
function updateSessionTrack(sessionId, attendees, nowIso) {
  const sid = String(sessionId || '').trim();
  if (!sid) return;
  let map = trackBySession.get(sid);
  if (!map) {
    map = new Map();
    trackBySession.set(sid, map);
  }
  const seen = new Set();
  for (const a of attendees || []) {
    const key = trackKeyForAttendee(a);
    if (!key) continue;
    seen.add(key);
    const prev = map.get(key);
    const activeNow = attendeeShowsActivity(a);
    if (!prev) {
      map.set(key, { firstSeenAt: nowIso, lastActiveAt: nowIso });
    } else if (activeNow) {
      map.set(key, { firstSeenAt: prev.firstSeenAt, lastActiveAt: nowIso });
    } else {
      map.set(key, prev);
    }
  }
  for (const key of [...map.keys()]) {
    if (!seen.has(key)) map.delete(key);
  }
  pruneSessionTrack(sid);
}

function formatTrTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Europe/Istanbul'
    });
  } catch {
    return '—';
  }
}

function minutesSince(iso, nowMs) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((nowMs - t) / 60_000));
}

/**
 * @param {object} session
 * @param {number} [nowMs]
 */
export function isSessionInLivePresenceWindow(session, nowMs = Date.now()) {
  if (!session) return false;
  const status = String(session.status || '');
  if (status !== 'scheduled' && status !== 'completed') return false;
  const startMs = wallTimeToUtcMs(session.lesson_date, session.start_time);
  const endMs = sessionEndUtcMs(session.lesson_date, session.start_time, session.end_time);
  if (startMs == null || endMs == null) return false;
  const windowStart = startMs - 15 * 60_000;
  const windowEnd = endMs + 45 * 60_000;
  return nowMs >= windowStart && nowMs <= windowEnd;
}

function isStudentActive(tracked, idleMs, nowMs) {
  if (!tracked) return false;
  const lastActiveMs = new Date(tracked.lastActiveAt).getTime();
  const firstSeenMs = new Date(tracked.firstSeenAt).getTime();
  if (nowMs - firstSeenMs < JOIN_GRACE_MS) return true;
  return nowMs - lastActiveMs < idleMs;
}

/**
 * @param {object} opts
 * @param {object} opts.session
 * @param {{ id: string, name: string }[]} opts.roster
 * @param {number} [opts.idleSeconds]
 * @param {number} [opts.nowMs]
 */
export async function buildClassSessionLivePresence({ session, roster, idleSeconds, nowMs = Date.now() }) {
  const nowIso = new Date(nowMs).toISOString();
  const idle = getBbbPassiveIdleSeconds(idleSeconds);
  const meetingCandidates = collectBbbMeetingIdsForLiveSession(session);
  const base = {
    session_id: session?.id || null,
    subject: session?.subject || null,
    live_window: isSessionInLivePresenceWindow(session, nowMs),
    meeting_running: false,
    meeting_id: meetingCandidates[0] || null,
    idle_seconds: idle,
    polled_at: nowIso,
    summary: {
      total: roster.length,
      joined: 0,
      active: 0,
      passive: 0,
      absent: roster.length
    },
    active_students: [],
    passive_students: [],
    absent_students: roster.map((s) => ({ student_id: s.id, name: s.name }))
  };

  if (!meetingCandidates.length || !base.live_window) return base;

  const { meetingId, running, attendees } = await bbbFindRunningMeetingAttendees(meetingCandidates);
  base.meeting_running = running;
  if (meetingId) base.meeting_id = meetingId;
  if (!running || !attendees.length) {
    base.summary.absent = roster.length;
    return base;
  }

  updateSessionTrack(session.id, attendees, nowIso);
  const track = trackBySession.get(String(session.id)) || new Map();

  const activeStudents = [];
  const passiveStudents = [];
  const absentStudents = [];

  for (const student of roster) {
    const attendee = findBbbAttendeeForStudentName(student.name, attendees);
    const trackKey = attendee ? trackKeyForAttendee(attendee) : normalizePersonNameForMatch(student.name);
    const tracked = trackKey ? track.get(trackKey) : null;

    if (!attendee || !tracked) {
      absentStudents.push({ student_id: student.id, name: student.name });
      continue;
    }

    const idleMs = idle * 1000;
    const isActive = isStudentActive(tracked, idleMs, nowMs);
    const row = {
      student_id: student.id,
      name: student.name,
      joined_at: tracked.firstSeenAt,
      joined_at_label: formatTrTime(tracked.firstSeenAt),
      camera_on: Boolean(attendee.hasVideo),
      microphone_on: Boolean(attendee.hasJoinedVoice),
      last_active_at: tracked.lastActiveAt,
      last_active_label: formatTrTime(tracked.lastActiveAt),
      passive_minutes: isActive ? 0 : minutesSince(tracked.lastActiveAt, nowMs)
    };

    if (isActive) activeStudents.push(row);
    else passiveStudents.push(row);
  }

  const joined = activeStudents.length + passiveStudents.length;
  base.summary = {
    total: roster.length,
    joined,
    active: activeStudents.length,
    passive: passiveStudents.length,
    absent: absentStudents.length
  };
  base.active_students = activeStudents;
  base.passive_students = passiveStudents;
  base.absent_students = absentStudents;
  return base;
}
