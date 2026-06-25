import { requireAuthenticatedActor } from './auth.js';
import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';
import {
  ensureBbbMeetingAlive,
  isBbbJoinUrl,
  isBbbAutoMeetingLink,
  isBbbConfigured,
  isBbbPlaybackUrl,
  isBbbAudioOnlyPlaybackUrl,
  buildBbbAttendeeJoinUrl,
  buildBbbModeratorJoinUrl,
  parseBbbJoinCredentials,
  parseBbbPasswordFromJoinUrl,
  parseBbbMeetingIdFromJoinUrl,
  getBbbRecordingPlaybackUrlForMeetingIds,
  collectBbbMeetingIdsForRecording
} from './bbb.js';

const jsonError = (res, status, error, extra) => res.status(status).json({ error, ...extra });

function pickJoinUrl({ isStudent, attendeeLink, moderatorLink, joinLink }) {
  if (joinLink) return String(joinLink).trim();
  const attendee = String(attendeeLink || '').trim();
  const moderator = String(moderatorLink || '').trim();
  return isStudent ? attendee : moderator || attendee;
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {{
 *   table: string,
 *   idParam?: string,
 *   loadRow: (id: string) => Promise<Record<string, unknown> | null>,
 *   canAccess: (actor: object, row: Record<string, unknown>) => boolean | Promise<boolean>,
 *   buildContext: (row: Record<string, unknown>) => Promise<{
 *     meetingName: string,
 *     attendeeName: string,
 *     moderatorName: string,
 *     durationMinutes: number,
 *     meetingKeyPrefix: string,
 *   }>,
 *   patchLinks: (id: string, links: { meeting_link: string, meeting_link_moderator?: string }) => Promise<void>,
 *   getLinks: (row: Record<string, unknown>) => { attendeeLink: string, moderatorLink: string | null },
 *   resolveStudentJoinUrl?: (actor: object, row: Record<string, unknown>, ensured: object) => Promise<string | null>,
 * }} config
 */
export async function handleBbbJoinGet(req, res, config) {
  if (req.method !== 'GET') return jsonError(res, 405, 'Method not allowed');

  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch (e) {
    return jsonError(res, 401, errorMessage(e) || 'Missing token');
  }

  const id = String(req.query?.[config.idParam || 'id'] || req.query?.meeting_id || '').trim();
  if (!id) return jsonError(res, 400, 'id gerekli');

  const row = await config.loadRow(id);
  if (!row) return jsonError(res, 404, 'Kayıt bulunamadı');

  const allowed = await config.canAccess(actor, row);
  if (!allowed) return jsonError(res, 403, 'Yetkiniz yok');

  const isStudent = String(actor.role || '').toLowerCase() === 'student';
  const { attendeeLink, moderatorLink } = config.getLinks(row);
  const directUrl = pickJoinUrl({
    isStudent,
    attendeeLink,
    moderatorLink,
    joinLink: row.join_link
  });

  if (!directUrl) {
    if (!isBbbConfigured()) {
      return jsonError(res, 400, 'Bu kayıtta toplantı bağlantısı yok.', { code: 'meeting_link_missing' });
    }
  } else if (!isBbbJoinUrl(directUrl) && !isBbbAutoMeetingLink(directUrl)) {
    return res.status(200).json({ url: directUrl, refreshed: false, provider: 'external' });
  }

  if (!isBbbConfigured()) {
    return jsonError(res, 503, 'BBB API ayarları eksik.', { code: 'bbb_not_configured' });
  }

  try {
    const ctx = await config.buildContext(row);
    const ensured = await ensureBbbMeetingAlive({
      attendeeLink,
      moderatorLink,
      meetingName: ctx.meetingName,
      attendeeName: ctx.attendeeName,
      moderatorName: ctx.moderatorName,
      durationMinutes: ctx.durationMinutes,
      meetingKeyPrefix: ctx.meetingKeyPrefix,
      storedMeetingId: row.bbb_meeting_id
    });

    if (ensured.refreshed) {
      await config.patchLinks(id, {
        meeting_link: ensured.attendeeLink,
        ...(ensured.moderatorLink ? { meeting_link_moderator: ensured.moderatorLink } : {}),
        ...(ensured.meetingId ? { bbb_meeting_id: ensured.meetingId } : {}),
        ...(ensured.attendeePW ? { bbb_attendee_pw: ensured.attendeePW } : {})
      });
    } else if (ensured.meetingId && !String(row.bbb_meeting_id || '').trim()) {
      await config.patchLinks(id, {
        meeting_link: ensured.attendeeLink,
        ...(ensured.moderatorLink ? { meeting_link_moderator: ensured.moderatorLink } : {}),
        bbb_meeting_id: ensured.meetingId
      });
    }

    let url = pickJoinUrl({
      isStudent,
      attendeeLink: ensured.attendeeLink,
      moderatorLink: ensured.moderatorLink,
      joinLink: null
    });

    if (isStudent && config.resolveStudentJoinUrl) {
      const studentUrl = await config.resolveStudentJoinUrl(actor, row, ensured);
      if (studentUrl) url = studentUrl;
    } else if (!isStudent) {
      const meetingId =
        String(ensured.meetingId || row.bbb_meeting_id || '').trim() ||
        parseBbbMeetingIdFromJoinUrl(ensured.moderatorLink || '') ||
        parseBbbMeetingIdFromJoinUrl(ensured.attendeeLink || '');
      const modPw =
        parseBbbPasswordFromJoinUrl(ensured.moderatorLink || '') ||
        String(ensured.moderatorPW || '').trim() ||
        null;
      const actorName = String(actor.name || actor.email || ctx.moderatorName || 'Öğretmen')
        .trim()
        .slice(0, 64);
      if (meetingId && modPw) {
        url = buildBbbModeratorJoinUrl({
          meetingId,
          moderatorPassword: modPw,
          fullName: actorName || 'Öğretmen'
        });
      }
    }

    return res.status(200).json({
      url,
      refreshed: ensured.refreshed,
      provider: 'bbb',
      meeting_id: ensured.meetingId || null
    });
  } catch (e) {
    return jsonError(res, 502, errorMessage(e), { code: 'bbb_join_failed' });
  }
}

export async function patchRowMeetingLinks(table, id, links) {
  const patch = {
    meeting_link: links.meeting_link,
    updated_at: new Date().toISOString()
  };
  if (links.meeting_link_moderator) patch.meeting_link_moderator = links.meeting_link_moderator;
  if (links.bbb_meeting_id) patch.bbb_meeting_id = links.bbb_meeting_id;
  if (links.bbb_attendee_pw) patch.bbb_attendee_pw = links.bbb_attendee_pw;

  const { error } = await supabaseAdmin.from(table).update(patch).eq('id', id);
  if (error) {
    const msg = errorMessage(error);
    if (/meeting_link_moderator|PGRST204|schema cache/i.test(msg)) {
      const { meeting_link_moderator: _m, bbb_meeting_id: _b, bbb_attendee_pw: _p, ...core } = patch;
      const { error: e2 } = await supabaseAdmin.from(table).update(core).eq('id', id);
      if (e2) throw e2;
      return;
    }
    throw error;
  }
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {{
 *   idParam?: string,
 *   loadRow: (id: string) => Promise<Record<string, unknown> | null>,
 *   canAccess: (actor: object, row: Record<string, unknown>) => boolean | Promise<boolean>,
 *   patchRecordingLink?: (id: string, playbackUrl: string) => Promise<void>,
 *   getMeetingKeyPrefix?: (row: Record<string, unknown>) => string,
 * }} config
 */
export async function handleBbbRecordingGet(req, res, config) {
  if (req.method !== 'GET') return jsonError(res, 405, 'Method not allowed');

  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch (e) {
    return jsonError(res, 401, errorMessage(e) || 'Missing token');
  }

  const id = String(req.query?.[config.idParam || 'id'] || req.query?.meeting_id || '').trim();
  if (!id) return jsonError(res, 400, 'id gerekli');

  const row = await config.loadRow(id);
  if (!row) {
    return jsonError(res, 404, 'Oturum bulunamadı.', { code: 'session_not_found' });
  }

  const allowed = await config.canAccess(actor, row);
  if (!allowed) return jsonError(res, 403, 'Yetkiniz yok');

  const cached = String(row.recording_link || '').trim();
  if (cached && (isBbbPlaybackUrl(cached) || !isBbbJoinUrl(cached))) {
    return res.status(200).json({ ok: true, playbackUrl: cached, cached: true });
  }

  const meetingId =
    String(row.bbb_meeting_id || '').trim() ||
    parseBbbMeetingIdFromJoinUrl(String(row.meeting_link || '')) ||
    parseBbbMeetingIdFromJoinUrl(String(row.meeting_link_moderator || '')) ||
    '';

  const keyPrefix = config.getMeetingKeyPrefix ? String(config.getMeetingKeyPrefix(row) || '').trim() : '';
  const meetingIds = collectBbbMeetingIdsForRecording(row, keyPrefix);
  if (!meetingIds.length && !meetingId) {
    return jsonError(res, 400, 'BBB toplantı kimliği bulunamadı.', { code: 'bbb_meeting_id_missing' });
  }

  try {
    const playbackUrl = await getBbbRecordingPlaybackUrlForMeetingIds(
      meetingIds.length ? meetingIds : [meetingId]
    );
    if (!playbackUrl) {
      return jsonError(res, 404, 'Ders kaydı henüz hazır değil. BBB\'de kayıt başlatıldığından emin olun; ders bitince 5–15 dk bekleyin veya BBB yönetiminden kayıt URL\'sini oturuma yapıştırın.', {
        code: 'recording_not_found'
      });
    }
    if (isBbbAudioOnlyPlaybackUrl(playbackUrl)) {
      return jsonError(res, 404, 'Video kaydı henüz hazır değil (yalnızca ses kaydı bulundu). Birkaç dakika sonra tekrar deneyin.', {
        code: 'recording_audio_only'
      });
    }

    if (config.patchRecordingLink) {
      try {
        await config.patchRecordingLink(id, playbackUrl);
      } catch {
        /* recording_link sütunu yoksa sessizce devam */
      }
    }

    return res.status(200).json({ ok: true, playbackUrl, cached: false });
  } catch (e) {
    const code = String(e?.code || e?.name || '');
    if (code === 'bbb_timeout' || code === 'BbbApiTimeoutError') {
      return jsonError(
        res,
        504,
        'BBB sunucusu kayıt listesine zamanında yanıt vermedi. Birkaç dakika sonra tekrar deneyin veya BBB yönetiminden kayıt URL\'sini oturuma yapıştırın.',
        { code: 'bbb_recording_timeout' }
      );
    }
    return jsonError(res, 502, errorMessage(e), { code: 'bbb_recording_failed' });
  }
}

export async function patchRowRecordingLink(table, id, recordingLink) {
  const patch = {
    recording_link: recordingLink,
    updated_at: new Date().toISOString()
  };
  const { error } = await supabaseAdmin.from(table).update(patch).eq('id', id);
  if (error) {
    const msg = errorMessage(error);
    if (/recording_link|PGRST204|schema cache/i.test(msg)) return;
    throw error;
  }
}

export async function patchCoachingMeetingLinks(id, links) {
  const patch = {
    meet_link: links.meeting_link,
    link_bbb: links.meeting_link_moderator || links.meeting_link,
    updated_at: new Date().toISOString()
  };
  const { error } = await supabaseAdmin.from('meetings').update(patch).eq('id', id);
  if (error) throw error;
}
