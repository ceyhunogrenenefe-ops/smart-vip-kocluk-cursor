import crypto from 'crypto';
import { createBbbMeetingAndJoinLink, isBbbConfigured, sanitizeBbbMeetingId } from './bbb.js';
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

  try {
    const meetingId = sanitizeBbbMeetingId(
      `${meetingKeyPrefix}${Date.now()}${crypto.randomBytes(4).toString('hex')}`
    );
    const bbb = await createBbbMeetingAndJoinLink({
      meetingId,
      meetingName: meetingName || 'Canlı ders',
      attendeeName: attendeeName || 'Öğrenci',
      moderatorName: moderatorName || 'Öğretmen',
      durationMinutes
    });
    return {
      ok: true,
      meetingLink: bbb.attendeeJoinLink,
      meetingLinkModerator: bbb.moderatorJoinLink,
      platform: 'bbb',
      autoBbb: { ok: true, provider: 'bbb', meetingId: bbb.meetingId }
    };
  } catch (e) {
    return {
      ok: false,
      code: 'bbb_create_failed',
      error: e instanceof Error ? e.message : 'BBB oda oluşturulamadı'
    };
  }
}

export function applyResolvedMeetingLinkToRow(resolved) {
  if (!resolved?.ok) return {};
  return {
    meeting_link: resolved.meetingLink,
    ...(resolved.meetingLinkModerator ? { meeting_link_moderator: resolved.meetingLinkModerator } : {})
  };
}
