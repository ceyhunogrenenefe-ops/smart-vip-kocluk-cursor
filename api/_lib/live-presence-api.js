import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';
import { buildClassSessionAttendanceRoster } from './class-session-attendance-roster.js';
import {
  buildClassSessionLivePresence,
  isSessionInLivePresenceWindow,
  getBbbPassiveIdleSeconds
} from './bbb-live-presence.js';
import { bbbFindRunningMeetingAttendees } from './bbb.js';
import { collectBbbMeetingIdsForLiveSession } from './bbb-attendance.js';
import { wallTimeToUtcMs } from './class-session-end-ms.js';
import {
  getCachedLivePresenceResponse,
  livePresenceCacheKey,
  setCachedLivePresenceResponse
} from './live-presence-response-cache.js';
import { withSupabaseTimeout } from './supabase-query-timeout.js';
import {
  combinedClassSlotKey,
  isCombinedMultiClassGroup,
  pickCombinedAnchorSession
} from './combined-class-bbb-reuse.js';

const STAFF_ROLES = new Set(['super_admin', 'admin', 'coach', 'teacher']);
const MAX_CLASS_IDS = 40;

/**
 * Optimize edilmiş canlı katılım — BBB yalnızca canlı penceredeki oturumlar için, kısa TTL önbellek.
 */
export async function handleLivePresenceRequest({ actor, role, query, getManagedClassIds, normalizeRole }) {
  const normalized = normalizeRole(role);
  if (!STAFF_ROLES.has(normalized)) {
    return { status: 403, body: { error: 'forbidden' } };
  }

  const idleSeconds = getBbbPassiveIdleSeconds(query?.idle_seconds);
  const allowedClassIds = await getManagedClassIds(actor);
  const requested = String(query?.class_ids || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_CLASS_IDS);

  let classIds = requested.length ? requested : (allowedClassIds || []).slice(0, MAX_CLASS_IDS);
  if (allowedClassIds) {
    const allowedSet = new Set(allowedClassIds);
    classIds = classIds.filter((id) => allowedSet.has(id));
  }

  const emptyPayload = () => ({
    classes: {},
    idle_seconds: idleSeconds,
    polled_at: new Date().toISOString()
  });

  if (!classIds.length) {
    return { status: 200, body: { data: emptyPayload() } };
  }

  const cacheKey = livePresenceCacheKey(actor.sub, classIds, idleSeconds);
  const cached = getCachedLivePresenceResponse(cacheKey);
  if (cached) {
    return { status: 200, body: { data: cached, cached: true } };
  }

  const started = Date.now();
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
    const { data: sessions, error: sessErr } = await withSupabaseTimeout(
      () =>
        supabaseAdmin
          .from('class_sessions')
          .select(
            'id,class_id,teacher_id,lesson_date,start_time,end_time,status,subject,bbb_meeting_id,meeting_link,meeting_link_moderator'
          )
          .in('class_id', classIds)
          .eq('lesson_date', today)
          .in('status', ['scheduled', 'completed'])
          .order('start_time', { ascending: true }),
      10_000,
      'live_presence_sessions'
    );
    if (sessErr) throw sessErr;

    const nowMs = Date.now();
    /** Sınıf başına pencere içi oturum: meeting id’si olan + zamana en yakın */
    const candidatesByClass = new Map();
    for (const s of sessions || []) {
      if (!isSessionInLivePresenceWindow(s, nowMs)) continue;
      const cid = String(s.class_id || '').trim();
      if (!cid) continue;
      const arr = candidatesByClass.get(cid) || [];
      arr.push(s);
      candidatesByClass.set(cid, arr);
    }

    const sessionByClass = new Map();
    const anchorBySlot = new Map();
    const slotBuckets = new Map();
    for (const s of sessions || []) {
      if (!isSessionInLivePresenceWindow(s, nowMs)) continue;
      const key = combinedClassSlotKey(s);
      if (!slotBuckets.has(key)) slotBuckets.set(key, []);
      slotBuckets.get(key).push(s);
    }
    for (const [slotKey, list] of slotBuckets.entries()) {
      if (isCombinedMultiClassGroup(list)) {
        anchorBySlot.set(slotKey, pickCombinedAnchorSession(list));
      }
    }

    for (const [cid, list] of candidatesByClass.entries()) {
      const ranked = [...list].sort((a, b) => {
        const ha = Boolean(String(a.bbb_meeting_id || '').trim() || a.meeting_link);
        const hb = Boolean(String(b.bbb_meeting_id || '').trim() || b.meeting_link);
        if (ha !== hb) return ha ? -1 : 1;
        const da = Math.abs((wallTimeToUtcMs(a.lesson_date, a.start_time) ?? 0) - nowMs);
        const db = Math.abs((wallTimeToUtcMs(b.lesson_date, b.start_time) ?? 0) - nowMs);
        return da - db;
      });
      const picked = ranked[0];
      const anchor = anchorBySlot.get(combinedClassSlotKey(picked)) || picked;
      sessionByClass.set(cid, anchor);
    }

    const polledAt = new Date().toISOString();
    const classesOut = {};

    if (!sessionByClass.size) {
      for (const classId of classIds) {
        classesOut[classId] = {
          session_id: null,
          live_window: false,
          meeting_running: false,
          idle_seconds: idleSeconds,
          polled_at: polledAt,
          summary: { total: 0, joined: 0, active: 0, passive: 0, absent: 0, cameras_on: 0, microphones_on: 0 },
          active_students: [],
          passive_students: [],
          absent_students: []
        };
      }
      const payload = { classes: classesOut, idle_seconds: idleSeconds, polled_at: polledAt };
      setCachedLivePresenceResponse(cacheKey, payload);
      return { status: 200, body: { data: payload, live_count: 0 } };
    }

    const liveClassIds = classIds.filter((id) => sessionByClass.has(id));
    const rosterByClass = new Map();
    await Promise.all(
      liveClassIds.map(async (classId) => {
        const session = sessionByClass.get(classId);
        const roster = await buildClassSessionAttendanceRoster({
          classId,
          subject: session?.subject
        });
        rosterByClass.set(classId, roster);
      })
    );

    const meetingPollCache = new Map();
    for (const classId of classIds) {
      const session = sessionByClass.get(classId);
      if (!session) {
        classesOut[classId] = {
          session_id: null,
          live_window: false,
          meeting_running: false,
          idle_seconds: idleSeconds,
          polled_at: polledAt,
          summary: { total: 0, joined: 0, active: 0, passive: 0, absent: 0, cameras_on: 0, microphones_on: 0 },
          active_students: [],
          passive_students: [],
          absent_students: []
        };
        continue;
      }

      const roster = rosterByClass.get(classId) || [];
      const pollSession = sessionByClass.get(classId) || session;
      const meetingCandidates = collectBbbMeetingIdsForLiveSession(pollSession);
      const meetingKey = meetingCandidates.join('|') || String(pollSession.id || '');
      let snapshotPromise = meetingPollCache.get(meetingKey);
      if (!snapshotPromise) {
        snapshotPromise = bbbFindRunningMeetingAttendees(meetingCandidates);
        meetingPollCache.set(meetingKey, snapshotPromise);
      }
      const bbbSnapshot = await snapshotPromise;
      classesOut[classId] = await buildClassSessionLivePresence({
        session,
        roster: roster.map((r) => ({ id: r.student_id, name: r.student_name })),
        idleSeconds,
        nowMs,
        bbbSnapshot
      });
    }

    const payload = { classes: classesOut, idle_seconds: idleSeconds, polled_at: polledAt };
    setCachedLivePresenceResponse(cacheKey, payload);

    const ms = Date.now() - started;
    if (ms > 8000) {
      console.warn('[live-presence-api] slow', {
        ms,
        actor: actor.sub,
        classes: classIds.length,
        live: sessionByClass.size
      });
    }

    return { status: 200, body: { data: payload, live_count: sessionByClass.size } };
  } catch (e) {
    console.error('[live-presence-api]', errorMessage(e), e);
    return {
      status: 500,
      body: { error: 'live_presence_failed', message: errorMessage(e) }
    };
  }
}
