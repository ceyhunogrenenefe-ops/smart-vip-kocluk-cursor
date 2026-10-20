/**
 * Dersin gerçekten açıldığı odayı seçer: etüt sabit Zoom, diğer ders BBB.
 * Katılımcı döner; yoklama satırı yazmaz.
 */

import { isBbbJoinUrl, bbbFindRunningMeetingAttendees } from './bbb.js';
import { collectBbbMeetingIdsForLiveSession } from './bbb-attendance.js';
import { primary4567ZoomIfApplicable } from './primary-4567-zoom.js';
import { parseZoomMeetingId, zoomLiveParticipants } from './zoom-meeting-participants.js';

export function effectiveMeetingLink(session, classRow) {
  const zoom = primary4567ZoomIfApplicable({
    subject: session?.subject,
    className: classRow?.name,
    classLevel: classRow?.class_level
  });
  if (zoom) return zoom;
  return String(session?.meeting_link || '').trim();
}

/**
 * @returns {Promise<{ provider: 'zoom'|'bbb'|'', running: boolean, attendees: object[], note: string }>}
 */
export async function fetchLiveAttendees(session, classRow) {
  const link = effectiveMeetingLink(session, classRow);
  if (/zoom\.us\//i.test(link)) {
    const id = parseZoomMeetingId(link);
    const z = await zoomLiveParticipants(id);
    const attendees = z.participants || [];
    return {
      provider: 'zoom',
      running: z.ok && attendees.length > 0,
      attendees,
      note: z.reason || (attendees.length ? '' : 'zoom_not_running')
    };
  }

  const probe = { ...session, meeting_link: link };
  const ids = collectBbbMeetingIdsForLiveSession(probe);
  if (!ids.length && !isBbbJoinUrl(link)) {
    return { provider: '', running: false, attendees: [], note: 'no_live_room' };
  }
  const found = await bbbFindRunningMeetingAttendees(ids);
  return {
    provider: 'bbb',
    running: Boolean(found.running),
    attendees: found.attendees || [],
    note: found.running ? '' : 'bbb_not_running'
  };
}
