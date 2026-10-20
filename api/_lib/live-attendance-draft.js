/**
 * Canlı oda katılımcısından yoklama taslağı.
 * Kayıt yazmaz, WhatsApp göndermez. Öğretmen onayı ayrı adımdır.
 */

import { matchRosterToAttendeesUnique } from './bbb-attendance.js';

/** Öğretmen kaydı veya izinli/geç — canlı liste bunların üstüne yazmaz. */
export function attendanceRowLocked(row) {
  if (!row) return false;
  if (row.marked_by) return true;
  const st = String(row.status || '');
  return st === 'excused' || st === 'late';
}

/**
 * Zoom / BBB katılımcısındaki kamera alanı.
 * @returns {'on'|'off'|null} null = platform söylemedi
 */
export function cameraFromAttendee(attendee) {
  if (!attendee) return null;
  if (typeof attendee.hasVideo === 'boolean') return attendee.hasVideo ? 'on' : 'off';
  const q = String(attendee.video_quality || attendee.videoQuality || '')
    .trim()
    .toLowerCase();
  if (q === 'good' || q === 'fair' || q === 'bad' || q === 'poor') return 'on';
  if (q === 'none' || q === 'na' || q === 'n/a' || q === 'off') return 'off';
  const cam = attendee.camera;
  if (typeof cam === 'boolean') return cam ? 'on' : 'off';
  const s = String(cam || '').trim().toLowerCase();
  if (s === 'on' || s === 'yes' || s === 'true' || s === 'open') return 'on';
  if (s === 'off' || s === 'no' || s === 'false' || s === 'closed') return 'off';
  return null;
}

/**
 * @param {{ student_id: string, student_name?: string }[]} roster
 * @param {{ fullName?: string, hasVideo?: boolean, video_quality?: string, camera?: string|boolean }[]} attendees
 * @param {{ student_id: string, status?: string, marked_by?: string|null, camera_status?: string|null }[]} priorRows
 * @param {boolean} running  oda açık değilse kimseye "katılmadı" yazılmaz
 */
export function buildLiveAttendanceDraft(roster, attendees, priorRows, running) {
  const prior = new Map((priorRows || []).map((r) => [String(r.student_id), r]));
  const people = (roster || []).map((s) => ({
    id: String(s.student_id),
    name: String(s.student_name || '')
  }));
  const matched = running
    ? matchRosterToAttendeesUnique(people, attendees || [])
    : new Map();

  const suggestions = people.map((p) => {
    const row = prior.get(p.id);
    if (attendanceRowLocked(row)) {
      return {
        student_id: p.id,
        status: String(row.status || ''),
        camera_status: row.camera_status || null,
        locked: true
      };
    }
    const hit = matched.get(p.id);
    if (!running) {
      return { student_id: p.id, status: '', camera_status: null, locked: false };
    }
    if (!hit) {
      return { student_id: p.id, status: 'absent', camera_status: null, locked: false };
    }
    return {
      student_id: p.id,
      status: 'present',
      camera_status: cameraFromAttendee(hit),
      locked: false
    };
  });

  return { suggestions };
}
