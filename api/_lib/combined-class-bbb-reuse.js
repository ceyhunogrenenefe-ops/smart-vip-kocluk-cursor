/**
 * Birleşik sınıf dersleri (6A+6B aynı saat/konu/öğretmen) için tek BBB meeting.
 * Ders programı satırları ayrı kalır; yalnızca BBB alanları paylaşılır.
 */
import { supabaseAdmin } from './supabase-admin.js';
import {
  isBbbJoinUrl,
  isBbbAutoMeetingLink,
  fetchBbbMeetingInfo,
  BBB_AUTO_MEETING_LINK,
  isBbbConfigured,
  sanitizeBbbMeetingId,
  parseBbbMeetingIdFromJoinUrl
} from './bbb.js';
import { patchRowMeetingLinks } from './bbb-join-handler.js';
import { errorMessage } from './error-msg.js';
import {
  hasReusableBbbSeed,
  syncConsecutivePeerMeetingLinks
} from './consecutive-class-bbb-reuse.js';

export function isCombinedClassBbbReuseEnabled() {
  return String(process.env.BBB_COMBINED_CLASS_REUSE ?? 'true').toLowerCase() !== 'false';
}

function normSubject(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normTimeHms(timeStr) {
  const s = String(timeStr || '').trim();
  if (/^\d{2}:\d{2}:\d{2}/.test(s)) return s.slice(0, 8);
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return s;
}

function sameTimeSlot(a, b) {
  return (
    normTimeHms(a?.start_time) === normTimeHms(b?.start_time) &&
    normTimeHms(a?.end_time) === normTimeHms(b?.end_time)
  );
}

function combinedSlotKey(row) {
  return [
    String(row.lesson_date || '').slice(0, 10),
    String(row.teacher_id || ''),
    normSubject(row.subject),
    normTimeHms(row.start_time),
    normTimeHms(row.end_time)
  ].join('|');
}

/** Canlı katılım / join: aynı slottaki birleşik oturumlar için anchor oturum. */
export function combinedClassSlotKey(row) {
  return combinedSlotKey(row);
}

export function isCombinedMultiClassGroup(sessions) {
  const ids = new Set((sessions || []).map((s) => String(s.class_id || '').trim()).filter(Boolean));
  return ids.size >= 2;
}

export function pickCombinedAnchorSession(sessions) {
  return sortSessionsById(sessions)[0] || null;
}

function canonicalCombinedMeetingId(anchor, meetingKeyPrefix, seedRow = null) {
  const fromSeed = String(seedRow?.bbb_meeting_id || '').trim();
  if (fromSeed) return fromSeed;
  const fromAnchor = String(anchor?.bbb_meeting_id || '').trim();
  if (fromAnchor) return fromAnchor;
  return sanitizeBbbMeetingId(meetingKeyPrefix);
}

function stableJoinPrefix(sessionId) {
  return `cljoin${String(sessionId || '').replace(/-/g, '')}`;
}

function sortSessionsById(rows) {
  return [...(rows || [])].sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
}

function isSafeToResetMeetingFields(row) {
  const link = String(row?.meeting_link || '').trim();
  if (!link || isBbbAutoMeetingLink(link)) return true;
  if (isBbbJoinUrl(link)) return true;
  return false;
}

/**
 * @param {Record<string, unknown>} session
 * @returns {Promise<import('./consecutive-class-bbb-reuse.js').resolveConsecutiveClassBbbReuse extends (...args: any) => Promise<infer R> ? R : never | null>}
 */
export async function resolveCombinedClassBbbReuse(session) {
  if (!isCombinedClassBbbReuseEnabled() || !session?.id) return null;
  try {
    const teacherId = String(session.teacher_id || '').trim();
    const lessonDate = String(session.lesson_date || '').trim().slice(0, 10);
    const subject = normSubject(session.subject);
    if (!teacherId || !lessonDate || !subject) return null;

    const { data, error } = await supabaseAdmin
      .from('class_sessions')
      .select(
        'id, class_id, teacher_id, subject, lesson_date, start_time, end_time, status, meeting_link, meeting_link_moderator, bbb_meeting_id, bbb_attendee_pw'
      )
      .eq('teacher_id', teacherId)
      .eq('lesson_date', lessonDate);

    if (error) throw error;

    const group = sortSessionsById(
      (data || []).filter((row) => {
        if (String(row.status || '') === 'cancelled') return false;
        if (normSubject(row.subject) !== subject) return false;
        return sameTimeSlot(row, session);
      })
    );

    const classIds = new Set(group.map((r) => String(r.class_id || '')));
    if (classIds.size < 2) {
      return {
        peers: group.length ? group : [session],
        meetingKeyPrefix: stableJoinPrefix(session.id),
        chainDurationMinutes: null,
        seedAttendeeLink: null,
        seedModeratorLink: null,
        storedMeetingId: null,
        seedAttendeePw: null,
        seededFromPeer: false,
        syncMeetingLinksToRow: false
      };
    }

    const anchor = group[0];
    const meetingKeyPrefix = stableJoinPrefix(anchor.id);

    let liveSeed = null;
    for (const peer of group) {
      if (!hasReusableBbbSeed(peer)) continue;
      const mid = String(peer.bbb_meeting_id || '').trim();
      if (!mid) continue;
      try {
        const info = await fetchBbbMeetingInfo(mid);
        if (info?.attendeePW && info.running !== false) {
          liveSeed = peer;
          break;
        }
      } catch {
        /* sonraki peer */
      }
    }

    let seed = liveSeed;
    if (!seed) {
      for (const peer of group) {
        if (hasReusableBbbSeed(peer)) {
          seed = peer;
          break;
        }
      }
    }

    const seedIsOther = Boolean(seed && String(seed.id) !== String(session.id));
    const applySeedFromPeer =
      seedIsOther &&
      Boolean(
        liveSeed ||
          !hasReusableBbbSeed(session) ||
          String(session.bbb_meeting_id || '').trim() !== String(seed.bbb_meeting_id || '').trim()
      );

    const canonicalMeetingId = canonicalCombinedMeetingId(anchor, meetingKeyPrefix, liveSeed || seed);
    const rowMid = String(session.bbb_meeting_id || '').trim();
    const rowLinkMid = parseBbbMeetingIdFromJoinUrl(String(session.meeting_link || ''));
    const needsCanonicalId =
      rowMid && rowMid !== canonicalMeetingId && rowLinkMid && rowLinkMid !== canonicalMeetingId;

    return {
      peers: group,
      meetingKeyPrefix,
      canonicalMeetingId,
      chainDurationMinutes: null,
      seedAttendeeLink: applySeedFromPeer ? String(seed.meeting_link || '').trim() || null : null,
      seedModeratorLink: applySeedFromPeer
        ? seed.meeting_link_moderator
          ? String(seed.meeting_link_moderator).trim()
          : null
        : null,
      storedMeetingId: canonicalMeetingId,
      seedAttendeePw: applySeedFromPeer ? String(seed.bbb_attendee_pw || '').trim() || null : null,
      seededFromPeer: applySeedFromPeer,
      syncMeetingLinksToRow: applySeedFromPeer || needsCanonicalId
    };
  } catch (e) {
    console.warn('[combined-bbb] resolve failed, fallback to per-session:', errorMessage(e));
    return null;
  }
}

/** Birleşik + ardışık peer listesini tekilleştirir. */
export function mergeBbbReusePeerLists(...lists) {
  const byId = new Map();
  for (const list of lists) {
    for (const row of list || []) {
      const id = String(row?.id || '').trim();
      if (id) byId.set(id, row);
    }
  }
  return [...byId.values()];
}

/**
 * Birleşik sınıf öncelikli; ardışık zincir ikincil (canlı oda / seed).
 * @param {Record<string, unknown>} session
 * @param {Awaited<ReturnType<import('./consecutive-class-bbb-reuse.js').resolveConsecutiveClassBbbReuse>> | null} consecutive
 */
export async function resolveClassSessionBbbReuse(session, consecutive = null) {
  const combined = await resolveCombinedClassBbbReuse(session);
  const combinedMultiClass =
    combined?.peers?.length >= 2 &&
    new Set((combined.peers || []).map((p) => String(p.class_id || ''))).size >= 2;
  const consecutiveChain = consecutive?.peers?.length >= 2;

  let primary = null;
  if (combined?.seededFromPeer && combinedMultiClass) primary = combined;
  else if (consecutive?.seededFromPeer && consecutiveChain) primary = consecutive;
  else if (combinedMultiClass) primary = combined;
  else if (consecutiveChain) primary = consecutive;
  else primary = combined || consecutive;

  if (!primary) return null;

  const peers = mergeBbbReusePeerLists(combined?.peers, consecutive?.peers);
  return { ...primary, peers };
}

export { syncConsecutivePeerMeetingLinks as syncClassSessionPeerMeetingLinks };

/**
 * Mevcut planlı birleşik derslerde BBB alanlarını hizalar (tarih/saat/konu/sınıf kartları aynı kalır).
 */
export async function backfillCombinedClassBbbAlignment(classId, dateFrom, dateTo, teacherIds = [], opts = {}) {
  if (!isCombinedClassBbbReuseEnabled() || !isBbbConfigured()) {
    return { groups: 0, aligned: 0, skipped_live: 0 };
  }
  const from = String(dateFrom || '').trim().slice(0, 10);
  const to = String(dateTo || '').trim().slice(0, 10);
  const teachers = [...new Set((teacherIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
  if (!from || !to || !teachers.length) return { groups: 0, aligned: 0, skipped_live: 0 };
  const skipLiveCheck = Boolean(opts.skipLiveCheck);

  try {
    const { data, error } = await supabaseAdmin
      .from('class_sessions')
      .select(
        'id, class_id, teacher_id, subject, lesson_date, start_time, end_time, status, meeting_link, meeting_link_moderator, bbb_meeting_id, bbb_attendee_pw'
      )
      .in('teacher_id', teachers)
      .gte('lesson_date', from)
      .lte('lesson_date', to)
      .eq('status', 'scheduled');
    if (error) throw error;

    const bySlot = new Map();
    for (const row of data || []) {
      if (!isSafeToResetMeetingFields(row)) continue;
      const key = combinedSlotKey(row);
      if (!bySlot.has(key)) bySlot.set(key, []);
      bySlot.get(key).push(row);
    }

    let groups = 0;
    let aligned = 0;
    let skippedLive = 0;

    for (const rows of bySlot.values()) {
      const classIds = new Set(rows.map((r) => String(r.class_id || '')));
      if (classIds.size < 2) continue;
      groups += 1;

      const ordered = sortSessionsById(rows);
      const touchesClass = !classId || ordered.some((r) => String(r.class_id) === String(classId));
      if (!touchesClass) continue;

      if (!skipLiveCheck) {
        let hasLive = false;
        for (const peer of ordered) {
          const mid = String(peer.bbb_meeting_id || '').trim();
          if (!mid) continue;
          try {
            const info = await fetchBbbMeetingInfo(mid);
            if (info?.attendeePW && info.running !== false) {
              hasLive = true;
              break;
            }
          } catch {
            /* ignore */
          }
        }
        if (hasLive) {
          skippedLive += 1;
          continue;
        }
      }

      const anchor = ordered[0];
      const sharedId = String(anchor.bbb_meeting_id || '').trim();
      const sharedLink = String(anchor.meeting_link || '').trim();
      const sharedHasRoom =
        Boolean(sharedId) ||
        (sharedLink && !isBbbAutoMeetingLink(sharedLink) && isBbbJoinUrl(sharedLink));

      for (let i = 1; i < ordered.length; i += 1) {
        const peer = ordered[i];
        if (!isSafeToResetMeetingFields(peer)) continue;
        const peerMid = String(peer.bbb_meeting_id || '').trim();

        if (sharedHasRoom) {
          if (sharedId && peerMid === sharedId) continue;
          try {
            await patchRowMeetingLinks('class_sessions', peer.id, {
              meeting_link: sharedLink || BBB_AUTO_MEETING_LINK,
              ...(anchor.meeting_link_moderator
                ? { meeting_link_moderator: String(anchor.meeting_link_moderator) }
                : {}),
              ...(sharedId ? { bbb_meeting_id: sharedId } : {}),
              ...(anchor.bbb_attendee_pw ? { bbb_attendee_pw: String(anchor.bbb_attendee_pw) } : {})
            });
            aligned += 1;
          } catch (e) {
            console.warn('[combined-bbb] align peer failed', peer.id, errorMessage(e));
          }
          continue;
        }

        if (skipLiveCheck) continue;
        if (!peerMid && (!String(peer.meeting_link || '').trim() || isBbbAutoMeetingLink(peer.meeting_link))) {
          continue;
        }
        const { error: uErr } = await supabaseAdmin
          .from('class_sessions')
          .update({
            meeting_link: BBB_AUTO_MEETING_LINK,
            meeting_link_moderator: null,
            bbb_meeting_id: null,
            bbb_attendee_pw: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', peer.id);
        if (!uErr) aligned += 1;
      }
    }

    return { groups, aligned, skipped_live: skippedLive };
  } catch (e) {
    console.warn('[combined-bbb] backfill failed:', errorMessage(e));
    return { groups: 0, aligned: 0, skipped_live: 0, error: errorMessage(e) };
  }
}
