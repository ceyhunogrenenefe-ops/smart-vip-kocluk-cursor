import {
  BBB_AUTO_MEETING_LINK,
  isBbbConfigured
} from './bbb.js';
import { detectPlatform } from './detect-meeting-platform.js';

export function manualLinkFromBody(body) {
  return String(body?.meeting_link ?? body?.meetingLink ?? body?.link ?? '').trim();
}

/**
 * Manuel link yoksa BBB API ile oda açar (Online Görüşmeler ile aynı mantık).
 * @returns {Promise<{ ok: true, meetingLink, meetingLinkModerator, platform, autoBbb } | { ok: false, code, error }>}
 */
export async function resolveBbbOrManualMeetingLink({
  manualLink,
  meetingName,
  attendeeName,
  moderatorName,
  durationMinutes,
  meetingKeyPrefix
}) {
  const trimmed = String(manualLink || '').trim();
  if (trimmed) {
    return {
      ok: true,
      meetingLink: trimmed,
      meetingLinkModerator: null,
      platform: detectPlatform(trimmed),
      autoBbb: null
    };
  }

  if (!isBbbConfigured()) {
    return {
      ok: false,
      code: 'meeting_link_required',
      error:
        'Toplantı bağlantısı gerekli. Meet/Zoom/BBB linki girin veya sunucuda BBB_API_ENDPOINT + BBB_API_SECRET tanımlayın (Online Görüşmeler ile aynı ayar).'
    };
  }

  /** Odayı planlama anında açma — ilk katılımda oluşturulur; ham BBB linki tarayıcıda hemen süresi dolmaz. */
  return {
    ok: true,
    meetingLink: BBB_AUTO_MEETING_LINK,
    meetingLinkModerator: null,
    platform: 'bbb',
    bbbMeetingId: null,
    bbbAttendeePw: null,
    autoBbb: { ok: true, provider: 'bbb', deferred: true }
  };
}

export function applyResolvedMeetingLinkToRow(resolved) {
  if (!resolved?.ok) return {};
  return {
    meeting_link: resolved.meetingLink,
    ...(resolved.meetingLinkModerator ? { meeting_link_moderator: resolved.meetingLinkModerator } : {}),
    ...(resolved.bbbMeetingId ? { bbb_meeting_id: resolved.bbbMeetingId } : {}),
    ...(resolved.bbbAttendeePw ? { bbb_attendee_pw: resolved.bbbAttendeePw } : {})
  };
}
