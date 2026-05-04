import type { TeacherLesson } from '../types';

/** İstanbul duvar saati +03:00 */
export function lessonInstantMs(lessonDateYmd: string, timeHms: string): number | null {
  const t = normalizeTimeHms(timeHms);
  const iso = `${lessonDateYmd}T${t}+03:00`;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function normalizeTimeHms(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return '00:00:00';
  if (/^\d{1,2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) return s;
  return '00:00:00';
}

/** Ders saatine 10 dk kala (henüz başlamamış). */
export function isApproaching(lesson: TeacherLesson, nowMs: number = Date.now()): boolean {
  if (lesson.status !== 'scheduled') return false;
  const start = lessonInstantMs(lesson.date, lesson.start_time);
  if (start == null) return false;
  const tenMin = 10 * 60_000;
  return nowMs >= start - tenMin && nowMs < start;
}

export function isOngoing(lesson: TeacherLesson, nowMs: number = Date.now()): boolean {
  if (lesson.status !== 'scheduled') return false;
  const start = lessonInstantMs(lesson.date, lesson.start_time);
  const end = lessonInstantMs(lesson.date, lesson.end_time);
  if (start == null || end == null) return false;
  return nowMs >= start && nowMs < end;
}

export const PLATFORM_LABEL: Record<string, string> = {
  zoom: 'Zoom',
  meet: 'Google Meet',
  bbb: 'BigBlueButton',
  other: 'Diğer'
};
