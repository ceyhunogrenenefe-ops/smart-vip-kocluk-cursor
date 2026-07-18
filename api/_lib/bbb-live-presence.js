import { bbbFindRunningMeetingAttendees } from './bbb.js';
import {
  collectBbbMeetingIdsForLiveSession,
  matchRosterToAttendeesUnique,
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

/** Anlık etkileşim: kamera veya mikrofon açık */
function attendeeIsEngaged(attendee) {
  return Boolean(attendee?.hasVideo || attendee?.hasJoinedVoice);
}

function trackKeyForAttendee(attendee) {
  const uid = String(attendee?.userId || '').trim();
  if (uid) return `uid:${uid}`;
  return normalizePersonNameForMatch(stripBbbDisplayNameNoise(attendee?.fullName || ''));
}

/**
 * @param {string} sessionId
 * @param {Array<{ fullName: string, userId?: string, hasVideo?: boolean, hasJoinedVoice?: boolean, isListeningOnly?: boolean }>} attendees
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
    const engaged = attendeeIsEngaged(a);
    if (!prev) {
      map.set(key, { firstSeenAt: nowIso, lastActiveAt: nowIso });
    } else if (engaged) {
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

/**
 * Aktif = kamerada veya mikrofonda; uzun süre etkileşimsiz ise pasife düş.
 * (Serverless cold start’ta idle zamanı güvenilmez — anlık kamera/mikrofon öncelikli.)
 */
function classifyStudent(attendee, tracked, idleMs, nowMs) {
  const engagedNow = attendeeIsEngaged(attendee);
  if (engagedNow) return 'active';
  if (!tracked) return 'passive';
  const firstSeenMs = new Date(tracked.firstSeenAt).getTime();
  if (Number.isFinite(firstSeenMs) && nowMs - firstSeenMs < JOIN_GRACE_MS) {
    return 'active';
  }
  const lastActiveMs = new Date(tracked.lastActiveAt).getTime();
  if (Number.isFinite(lastActiveMs) && nowMs - lastActiveMs < idleMs) {
    /* yakın zamanda etkileşimi vardı ama şu an cam/mic kapalı → pasif */
    return 'passive';
  }
  return 'passive';
}

/**
 * @param {object} opts
 * @param {object} opts.session
 * @param {{ id: string, name: string }[]} opts.roster
 * @param {number} [opts.idleSeconds]
 * @param {number} [opts.nowMs]
 * @param {{ meetingId?: string | null, running?: boolean, attendees?: object[] }} [opts.bbbSnapshot]
 */
export async function buildClassSessionLivePresence({
  session,
  roster,
  idleSeconds,
  nowMs = Date.now(),
  bbbSnapshot = null
}) {
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
      absent: roster.length,
      cameras_on: 0,
      microphones_on: 0
    },
    active_students: [],
    passive_students: [],
    absent_students: roster.map((s) => ({ student_id: s.id, name: s.name }))
  };

  if (!meetingCandidates.length || !base.live_window) return base;

  let meetingId;
  let running;
  let attendees;
  if (bbbSnapshot && typeof bbbSnapshot === 'object') {
    meetingId = bbbSnapshot.meetingId || null;
    running = Boolean(bbbSnapshot.running);
    attendees = Array.isArray(bbbSnapshot.attendees) ? bbbSnapshot.attendees : [];
  } else {
    const polled = await bbbFindRunningMeetingAttendees(meetingCandidates);
    meetingId = polled.meetingId;
    running = polled.running;
    attendees = polled.attendees || [];
  }
  base.meeting_running = running;
  if (meetingId) base.meeting_id = meetingId;
  if (!running) {
    base.summary.absent = roster.length;
    return base;
  }

  updateSessionTrack(session.id, attendees, nowIso);
  const track = trackBySession.get(String(session.id)) || new Map();
  const matched = matchRosterToAttendeesUnique(roster, attendees);

  const activeStudents = [];
  const passiveStudents = [];
  const absentStudents = [];
  let camerasOn = 0;
  let microphonesOn = 0;

  for (const student of roster) {
    const attendee = matched.get(String(student.id));
    if (!attendee) {
      absentStudents.push({ student_id: student.id, name: student.name });
      continue;
    }

    const trackKey = trackKeyForAttendee(attendee);
    const tracked = trackKey ? track.get(trackKey) : null;
    const idleMs = idle * 1000;
    const kind = classifyStudent(attendee, tracked, idleMs, nowMs);
    const cameraOn = Boolean(attendee.hasVideo);
    const micOn = Boolean(attendee.hasJoinedVoice);
    if (cameraOn) camerasOn += 1;
    if (micOn) microphonesOn += 1;

    const row = {
      student_id: student.id,
      name: student.name,
      joined_at: tracked?.firstSeenAt || nowIso,
      joined_at_label: formatTrTime(tracked?.firstSeenAt || nowIso),
      camera_on: cameraOn,
      microphone_on: micOn,
      last_active_at: tracked?.lastActiveAt || nowIso,
      last_active_label: formatTrTime(tracked?.lastActiveAt || nowIso),
      passive_minutes: kind === 'active' ? 0 : minutesSince(tracked?.lastActiveAt || nowIso, nowMs)
    };

    if (kind === 'active') activeStudents.push(row);
    else passiveStudents.push(row);
  }

  const joined = activeStudents.length + passiveStudents.length;
  base.summary = {
    total: roster.length,
    joined,
    active: activeStudents.length,
    passive: passiveStudents.length,
    absent: absentStudents.length,
    cameras_on: camerasOn,
    microphones_on: microphonesOn
  };
  base.active_students = activeStudents;
  base.passive_students = passiveStudents;
  base.absent_students = absentStudents;
  return base;
}
