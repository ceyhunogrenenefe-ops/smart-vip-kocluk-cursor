/**
 * Grup dersi WhatsApp hatırlatması — ders başlamadan ~10 dk (7–13 dk penceresi, cron 5 dk).
 */
import { parseReminderWindowConfig, isWithinReminderWindowMs } from './lesson-reminder-window.js';

const CLASS_WINDOW = parseReminderWindowConfig('CLASS_LESSON_REMINDER');

/** @deprecated UI etiketi */
export const CLASS_LESSON_REMINDER_LEAD_MINUTES = CLASS_WINDOW.maxMinutes;
export const CLASS_LESSON_REMINDER_MAX_LEAD_MINUTES = CLASS_WINDOW.maxMinutes;
export const CLASS_LESSON_REMINDER_WINDOW_LABEL = CLASS_WINDOW.label;
export function normalizeTimeHms(timeStr, fallback = '00:00:00') {
  const s = String(timeStr || '').trim();
  if (/^\d{2}:\d{2}:\d{2}/.test(s)) return s.slice(0, 8);
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return fallback;
}

export function toLessonStartUtcMs(dateStr, timeStr) {
  const safeTime = normalizeTimeHms(timeStr);
  return new Date(`${String(dateStr).trim().slice(0, 10)}T${safeTime}+03:00`).getTime();
}

/** Ders başlangıcına kalan ms; henüz başlamadıysa pozitif */
export function msUntilLessonStart(dateStr, timeStr, nowMs = Date.now()) {
  return toLessonStartUtcMs(dateStr, timeStr) - nowMs;
}

/** Cron penceresi — varsayılan 7–13 dk kala (≈10 dk önce) */
export function isInReminderWindow(dateStr, timeStr, nowMs = Date.now()) {
  const until = msUntilLessonStart(dateStr, timeStr, nowMs);
  return isWithinReminderWindowMs(until, CLASS_WINDOW);
}
/** Hatırlatma henüz gitmemiş oturumları sınıflandır (panel özeti). */
export function classifyUnsentSessionReminder(session, nowMs = Date.now()) {
  if (session?.reminder_sent) return 'already_sent';
  const until = msUntilLessonStart(session.lesson_date, session.start_time, nowMs);
  if (until <= 0) return 'started_without_reminder';
  if (isInReminderWindow(session.lesson_date, session.start_time, nowMs)) return 'due_now';
  return 'waiting_for_window';
}

export function summarizeUnsentClassSessions(sessions, nowMs = Date.now()) {
  let due_now = 0;
  let waiting_for_window = 0;
  let started_without_reminder = 0;
  for (const s of sessions || []) {
    if (s?.reminder_sent || String(s?.status || '') !== 'scheduled') continue;
    const bucket = classifyUnsentSessionReminder(s, nowMs);
    if (bucket === 'due_now') due_now += 1;
    else if (bucket === 'waiting_for_window') waiting_for_window += 1;
    else if (bucket === 'started_without_reminder') started_without_reminder += 1;
  }
  return {
    due_now,
    waiting_for_window,
    started_without_reminder,
    total_unsent: due_now + waiting_for_window + started_without_reminder
  };
}

function norm(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Ardışık oturumlar “aynı ders” sayılır mı (sınıf + konu + link) */
export function isSameLessonSession(a, b) {
  if (!a || !b) return false;
  if (String(a.class_id || '') !== String(b.class_id || '')) return false;
  if (norm(a.subject) !== norm(b.subject)) return false;
  const linkA = norm(a.meeting_link);
  const linkB = norm(b.meeting_link);
  if (linkA && linkB && linkA !== linkB) return false;
  return true;
}

/**
 * Öğrencinin o günkü zaman sıralı oturumları içinde hemen önceki oturumla aynı ders mi?
 * @param {Array<{ id: string, start_time: string, class_id: string, subject: string, meeting_link?: string }>} orderedSessions — start_time’a göre sıralı
 * @param {string} sessionId
 */
export function shouldSkipConsecutiveSameLesson(orderedSessions, sessionId) {
  const idx = orderedSessions.findIndex((s) => String(s.id) === String(sessionId));
  if (idx <= 0) return false;
  return isSameLessonSession(orderedSessions[idx - 1], orderedSessions[idx]);
}

/**
 * class_id → öğrenci id listesi
 * @param {Array<{ class_id: string, student_id: string }>} classStudentRows
 */
export function buildClassStudentMap(classStudentRows) {
  const map = new Map();
  for (const row of classStudentRows || []) {
    const cid = String(row.class_id || '');
    const sid = String(row.student_id || '');
    if (!cid || !sid) continue;
    if (!map.has(cid)) map.set(cid, []);
    map.get(cid).push(sid);
  }
  return map;
}

/**
 * Öğrenci → bugünkü scheduled oturumlar (start_time sıralı)
 * @param {Array<object>} daySessions
 * @param {Map<string, string[]>} classToStudents
 */
export function buildStudentDaySessionIndex(daySessions, classToStudents) {
  /** @type {Map<string, object[]>} */
  const byStudent = new Map();
  const sorted = [...(daySessions || [])].sort((a, b) =>
    String(a.start_time || '').localeCompare(String(b.start_time || ''))
  );
  for (const session of sorted) {
    const studentIds = classToStudents.get(String(session.class_id)) || [];
    for (const sid of studentIds) {
      if (!byStudent.has(sid)) byStudent.set(sid, []);
      byStudent.get(sid).push(session);
    }
  }
  return byStudent;
}
