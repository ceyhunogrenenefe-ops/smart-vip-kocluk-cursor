import { requireAuthenticatedActor } from './auth.js';
import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';
import { ensureBbbMeetingAlive, isBbbJoinUrl } from './bbb.js';

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
    return jsonError(res, 400, 'Bu kayıtta toplantı bağlantısı yok.', { code: 'meeting_link_missing' });
  }

  if (!isBbbJoinUrl(directUrl)) {
    return res.status(200).json({ url: directUrl, refreshed: false, provider: 'external' });
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
      meetingKeyPrefix: ctx.meetingKeyPrefix
    });

    if (ensured.refreshed) {
      await config.patchLinks(id, {
        meeting_link: ensured.attendeeLink,
        ...(ensured.moderatorLink ? { meeting_link_moderator: ensured.moderatorLink } : {})
      });
    }

    const url = pickJoinUrl({
      isStudent,
      attendeeLink: ensured.attendeeLink,
      moderatorLink: ensured.moderatorLink,
      joinLink: null
    });

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
  if (links.meeting_link_moderator) {
    patch.meeting_link_moderator = links.meeting_link_moderator;
  }
  const { error } = await supabaseAdmin.from(table).update(patch).eq('id', id);
  if (error && links.meeting_link_moderator && /meeting_link_moderator/i.test(errorMessage(error))) {
    const { meeting_link_moderator: _m, ...withoutMod } = patch;
    await supabaseAdmin.from(table).update(withoutMod).eq('id', id);
    return;
  }
  if (error) throw error;
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
