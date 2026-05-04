import type { TeacherLessonPlatform } from '../types';

export function detectPlatform(link: string): TeacherLessonPlatform {
  const s = String(link || '').toLowerCase();
  if (s.includes('zoom.us')) return 'zoom';
  if (s.includes('meet.google.com')) return 'meet';
  if (s.includes('bbb') || s.includes('bigbluebutton')) return 'bbb';
  return 'other';
}
