/**
 * Ardışık aynı sınıf/ders/öğretmen oturumları için tek BBB meeting yeniden kullanımı.
 * Koşullar sağlanmazsa veya hata olursa null/no-op döner; mevcut join akışı devam eder.
 * Ders programı (tarih/saat/konu/sınıf) değiştirilmez; yalnızca BBB meeting alanları hizalanır.
 */
import { supabaseAdmin } from './supabase-admin.js';
import {
  isBbbJoinUrl,
  isBbbAutoMeetingLink,
  resolveBbbMeetingDurationMinutes,
  fetchBbbMeetingInfo,
  BBB_AUTO_MEETING_LINK,
  isBbbConfigured
} from './bbb.js';
import { patchRowMeetingLinks } from './bbb-join-handler.js';
import { errorMessage } from './error-msg.js';

export function isConsecutiveBbbReuseEnabled() {
  return String(process.env.BBB_CONSECUTIVE_SESSION_REUSE || 'true').toLowerCase() !== 'false';
}

export function maxConsecutiveGapMinutes() {
  const n = Number(process.env.BBB_CONSECUTIVE_GAP_MINUTES || 20);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 20;
}

function normSubject(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function timeToMinutes(timeStr) {
  const s = String(timeStr || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** prev.end → next.start arası gap (dk); negatif = örtüşme (ardışık sayılır). */
export function areSessionsTimeConsecutive(prev, next, maxGapMinutes = maxConsecutiveGapMinutes()) {
  const prevEnd = timeToMinutes(prev?.end_time);
  const nextStart = timeToMinutes(next?.start_time);
  if (prevEnd == null || nextStart == null) return false;
  const gap = nextStart - prevEnd;
  if (gap < 0) return gap >= -5;
  return gap <= maxGapMinutes;
}

export function sessionMinutesSpan(startTime, endTime) {
  const a = timeToMinutes(startTime);
  const b = timeToMinutes(endTime);
  if (a == null || b == null || b <= a) return 0;
  return b - a;
}

export function hasReusableBbbSeed(row) {
  if (!row) return false;
  if (String(row.bbb_meeting_id || '').trim()) return true;
  const att = String(row.meeting_link || '').trim();
  const mod = String(row.meeting_link_moderator || '').trim();
  if (att && !isBbbAutoMeetingLink(att) && isBbbJoinUrl(att)) return true;
  if (mod && !isBbbAutoMeetingLink(mod) && isBbbJoinUrl(mod)) return true;
  return false;
}

/**
 * Aynı gün / sınıf / öğretmen / ders, start_time sıralı listeden mevcut oturumu içeren ardışık zincir.
 * @param {Array<Record<string, unknown>>} orderedSameLesson
 * @param {string} sessionId
 */
export function extractConsecutiveChain(orderedSameLesson, sessionId, maxGapMinutes = maxConsecutiveGapMinutes()) {
  const list = Array.isArray(orderedSameLesson) ? orderedSameLesson : [];
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

function sortByStartTime(rows) {
  return [...(rows || [])].sort((a, b) => {
    const ta = timeToMinutes(a.start_time) ?? 0;
    const tb = timeToMinutes(b.start_time) ?? 0;
    if (ta !== tb) return ta - tb;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

function chainDurationMinutes(chain) {
  if (!chain?.length) return null;
  const first = chain[0];
  const last = chain[chain.length - 1];
  const span = sessionMinutesSpan(first.start_time, last.end_time);
  if (span > 0) return resolveBbbMeetingDurationMinutes(span);
  let sum = 0;
  for (const s of chain) {
    sum += sessionMinutesSpan(s.start_time, s.end_time) || 0;
  }
  return sum > 0 ? resolveBbbMeetingDurationMinutes(sum) : null;
}

function stableJoinPrefix(sessionId) {
  return `cljoin${String(sessionId || '').replace(/-/g, '')}`;
}

/**
 * @param {Record<string, unknown>} session
 * @returns {Promise<{
 *   peers: Array<Record<string, unknown>>,
 *   meetingKeyPrefix: string,
 *   chainDurationMinutes: number | null,
 *   seedAttendeeLink: string | null,
 *   seedModeratorLink: string | null,
 *   storedMeetingId: string | null,
 *   seedAttendeePw: string | null,
 *   seededFromPeer: boolean,
 *   syncMeetingLinksToRow: boolean,
 * } | null>}
 */
export async function resolveConsecutiveClassBbbReuse(session) {
  if (!isConsecutiveBbbReuseEnabled() || !session?.id) return null;
  try {
    const classId = String(session.class_id || '').trim();
    const teacherId = String(session.teacher_id || '').trim();
    const lessonDate = String(session.lesson_date || '').trim().slice(0, 10);
    const subject = normSubject(session.subject);
    if (!classId || !teacherId || !lessonDate || !subject) return null;

    const { data, error } = await supabaseAdmin
      .from('class_sessions')
      .select(
        'id, class_id, teacher_id, subject, lesson_date, start_time, end_time, status, meeting_link, meeting_link_moderator, bbb_meeting_id, bbb_attendee_pw'
      )
      .eq('class_id', classId)
      .eq('teacher_id', teacherId)
      .eq('lesson_date', lessonDate);

    if (error) throw error;

    const sameLesson = sortByStartTime(
      (data || []).filter((row) => {
        if (String(row.status || '') === 'cancelled') return false;
        return normSubject(row.subject) === subject;
      })
    );

    const chain = extractConsecutiveChain(sameLesson, String(session.id));
    if (chain.length <= 1) {
      return {
        peers: chain.length === 1 ? chain : [session],
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

    const earliest = chain[0];
    const meetingKeyPrefix = stableJoinPrefix(earliest.id);

    /** Zincirde canlı (running) meeting varsa ona öncelik ver — mevcut ayrı ID’ler dahil. */
    let liveSeed = null;
    for (const peer of chain) {
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
        /* bir sonraki peer */
      }
    }

    let seed = liveSeed;
    if (!seed) {
      for (const peer of chain) {
        if (hasReusableBbbSeed(peer)) {
          seed = peer;
          break;
        }
      }
    }

    const seedIsOther = Boolean(seed && String(seed.id) !== String(session.id));
    /** Mevcut ayrı meeting_id'li kayıtlarda da paylaşımı zorla. */
    const applySeedFromPeer =
      seedIsOther &&
      Boolean(
        liveSeed ||
          !hasReusableBbbSeed(session) ||
          String(session.bbb_meeting_id || '').trim() !== String(seed.bbb_meeting_id || '').trim()
      );

    return {
      peers: chain,
      meetingKeyPrefix,
      chainDurationMinutes: chainDurationMinutes(chain),
      seedAttendeeLink: applySeedFromPeer ? String(seed.meeting_link || '').trim() || null : null,
      seedModeratorLink: applySeedFromPeer
        ? seed.meeting_link_moderator
          ? String(seed.meeting_link_moderator).trim()
          : null
        : null,
      storedMeetingId: applySeedFromPeer ? String(seed.bbb_meeting_id || '').trim() || null : null,
      seedAttendeePw: applySeedFromPeer ? String(seed.bbb_attendee_pw || '').trim() || null : null,
      seededFromPeer: applySeedFromPeer,
      syncMeetingLinksToRow: applySeedFromPeer
    };
  } catch (e) {
    console.warn('[consecutive-bbb] resolve failed, fallback to per-session:', errorMessage(e));
    return null;
  }
}

function isSafeToResetMeetingFields(row) {
  const link = String(row?.meeting_link || '').trim();
  if (!link || isBbbAutoMeetingLink(link)) return true;
  if (isBbbJoinUrl(link)) return true;
  return false;
}

/**
 * Mevcut planlı programı bozmadan: ardışık aynı ders oturumlarının BBB alanlarını
 * ortak kullanıma hazırlar (tarih/saat/konu/sınıf değişmez).
 * @param {{ skipLiveCheck?: boolean }} [opts] — liste yüklemede BBB probe atlanır (hızlı hizalama)
 */
export async function backfillScheduledConsecutiveBbbAlignment(classId, dateFrom, dateTo, opts = {}) {
  if (!isConsecutiveBbbReuseEnabled() || !isBbbConfigured()) {
    return { chains: 0, reset: 0, skipped_live: 0 };
  }
  const cid = String(classId || '').trim();
  const from = String(dateFrom || '').trim().slice(0, 10);
  const to = String(dateTo || '').trim().slice(0, 10);
  if (!cid || !from || !to) return { chains: 0, reset: 0, skipped_live: 0 };
  const skipLiveCheck = Boolean(opts.skipLiveCheck);

  try {
    const { data, error } = await supabaseAdmin
      .from('class_sessions')
      .select(
        'id, class_id, teacher_id, subject, lesson_date, start_time, end_time, status, meeting_link, meeting_link_moderator, bbb_meeting_id, bbb_attendee_pw'
      )
      .eq('class_id', cid)
      .gte('lesson_date', from)
      .lte('lesson_date', to)
      .eq('status', 'scheduled');
    if (error) throw error;

    const byKey = new Map();
    for (const row of data || []) {
      if (!isSafeToResetMeetingFields(row)) continue;
      const key = [
        String(row.lesson_date || '').slice(0, 10),
        String(row.teacher_id || ''),
        normSubject(row.subject)
      ].join('|');
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(row);
    }

    let chains = 0;
    let reset = 0;
    let skippedLive = 0;

    for (const rows of byKey.values()) {
      const ordered = sortByStartTime(rows);
      if (ordered.length < 2) continue;

      const visited = new Set();
      for (const row of ordered) {
        if (visited.has(String(row.id))) continue;
        const chain = extractConsecutiveChain(ordered, String(row.id));
        for (const c of chain) visited.add(String(c.id));
        if (chain.length < 2) continue;
        chains += 1;

        if (!skipLiveCheck) {
          let hasLive = false;
          for (const peer of chain) {
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

        const earliest = chain[0];
        const sharedId = String(earliest.bbb_meeting_id || '').trim();
        const sharedLink = String(earliest.meeting_link || '').trim();
        const sharedHasRoom =
          Boolean(sharedId) ||
          (sharedLink && !isBbbAutoMeetingLink(sharedLink) && isBbbJoinUrl(sharedLink));

        for (let i = 1; i < chain.length; i += 1) {
          const peer = chain[i];
          if (!isSafeToResetMeetingFields(peer)) continue;
          const peerMid = String(peer.bbb_meeting_id || '').trim();
          const peerLink = String(peer.meeting_link || '').trim();

          if (sharedHasRoom) {
            if (sharedId && peerMid === sharedId) continue;
            try {
              await patchRowMeetingLinks('class_sessions', peer.id, {
                meeting_link: sharedLink || BBB_AUTO_MEETING_LINK,
                ...(earliest.meeting_link_moderator
                  ? { meeting_link_moderator: String(earliest.meeting_link_moderator) }
                  : {}),
                ...(sharedId ? { bbb_meeting_id: sharedId } : {}),
                ...(earliest.bbb_attendee_pw
                  ? { bbb_attendee_pw: String(earliest.bbb_attendee_pw) }
                  : {})
              });
              reset += 1;
            } catch (e) {
              console.warn('[consecutive-bbb] align peer failed', peer.id, errorMessage(e));
            }
            continue;
          }

          /* Liste yüklemede (skipLiveCheck) canlı odayı kazara silmemek için reset yok. */
          if (skipLiveCheck) continue;
          if (!peerMid && (!peerLink || isBbbAutoMeetingLink(peerLink))) continue;
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
          if (!uErr) reset += 1;
        }
      }
    }

    return { chains, reset, skipped_live: skippedLive };
  } catch (e) {
    console.warn('[consecutive-bbb] backfill failed:', errorMessage(e));
    return { chains: 0, reset: 0, skipped_live: 0, error: errorMessage(e) };
  }
}

/**
 * Zincirdeki diğer oturumlara aynı BBB linklerini yazar (kartlar aynı odaya işaret eder).
 * @param {Array<Record<string, unknown>>} peers
 * @param {string} currentId
 * @param {{ meeting_link: string, meeting_link_moderator?: string, bbb_meeting_id?: string, bbb_attendee_pw?: string }} links
 * @param {{ force?: boolean }} [opts] — birleşik sınıf: eski link olsa bile zorla hizala
 */
export async function syncConsecutivePeerMeetingLinks(peers, currentId, links, opts = {}) {
  if (!isConsecutiveBbbReuseEnabled() || !links?.meeting_link || !peers?.length) return;
  const force = Boolean(opts.force);
  const meetingId = String(links.bbb_meeting_id || '').trim();
  const patch = {
    meeting_link: links.meeting_link,
    ...(links.meeting_link_moderator ? { meeting_link_moderator: links.meeting_link_moderator } : {}),
    ...(meetingId ? { bbb_meeting_id: meetingId } : {}),
    ...(links.bbb_attendee_pw ? { bbb_attendee_pw: links.bbb_attendee_pw } : {})
  };

  for (const peer of peers) {
    const pid = String(peer?.id || '').trim();
    if (!pid || pid === String(currentId || '')) continue;
    const peerMid = String(peer.bbb_meeting_id || '').trim();
    if (!force && meetingId && peerMid && peerMid === meetingId) {
      const peerLink = String(peer.meeting_link || '').trim();
      if (peerLink && !isBbbAutoMeetingLink(peerLink) && isBbbJoinUrl(peerLink)) continue;
    }
    try {
      await patchRowMeetingLinks('class_sessions', pid, patch);
      peer.bbb_meeting_id = meetingId || peer.bbb_meeting_id;
      peer.meeting_link = patch.meeting_link;
      if (patch.meeting_link_moderator) peer.meeting_link_moderator = patch.meeting_link_moderator;
      if (patch.bbb_attendee_pw) peer.bbb_attendee_pw = patch.bbb_attendee_pw;
    } catch (e) {
      console.warn('[consecutive-bbb] peer sync failed', pid, errorMessage(e));
    }
  }
}
