import { createGuestJoinShareLink } from './bbb-guest-join-core.js';
import { isBbbAutoMeetingLink, isBbbConfigured, isBbbJoinUrl } from './bbb.js';
import { publicAppBaseUrl } from './bbb-guest-token.js';

function fallbackAppUrl() {
  return publicAppBaseUrl();
}

function shouldUseGuestShareLink(meetingLink, row) {
  const raw = String(meetingLink || '').trim();
  if (!isBbbConfigured()) return false;
  if (isBbbAutoMeetingLink(raw) || isBbbJoinUrl(raw)) return true;
  if (String(row?.bbb_meeting_id || '').trim()) return true;
  if (String(row?.platform || '').trim().toLowerCase() === 'bbb') return true;
  return false;
}

/** Grup dersi hatırlatması / WhatsApp için kısa davet URL */
export async function resolveGuestShareUrlForClassSession(session) {
  const raw = String(session?.meeting_link || '').trim();
  if (shouldUseGuestShareLink(raw, session)) {
    try {
      const link = await createGuestJoinShareLink({ kind: 'class', id: session.id });
      if (link?.url) return String(link.url).trim();
    } catch {
      /* uzun link veya ham URL */
    }
  }
  return raw || fallbackAppUrl();
}

/** Özel ders hatırlatması için kısa davet URL */
export async function resolveGuestShareUrlForTeacherLesson(lesson) {
  const raw = String(lesson?.meeting_link || '').trim();
  if (shouldUseGuestShareLink(raw, lesson)) {
    try {
      const link = await createGuestJoinShareLink({ kind: 'private', id: lesson.id });
      if (link?.url) return String(link.url).trim();
    } catch {
      /* fall through */
    }
  }
  return raw || fallbackAppUrl();
}
