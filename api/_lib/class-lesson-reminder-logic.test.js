import assert from 'node:assert/strict';
import {
  isInReminderWindow,
  isSameLessonSession,
  shouldSkipConsecutiveSameLesson,
  toLessonStartUtcMs,
  normalizeTimeHms
} from './class-lesson-reminder-logic.js';

assert.equal(normalizeTimeHms('10:00'), '10:00:00');
assert.equal(normalizeTimeHms('10:00:00'), '10:00:00');

const base = { class_id: 'c1', subject: 'Matematik', meeting_link: 'https://zoom/a' };

assert.equal(isSameLessonSession(base, { ...base, id: '2' }), true);
assert.equal(isSameLessonSession(base, { ...base, subject: 'Fizik' }), false);
assert.equal(isSameLessonSession(base, { ...base, class_id: 'c2' }), false);

const day = [
  { id: 'a', start_time: '10:00:00', ...base },
  { id: 'b', start_time: '10:30:00', ...base },
  { id: 'c', start_time: '11:00:00', class_id: 'c1', subject: 'Fizik', meeting_link: 'https://zoom/a' }
];
assert.equal(shouldSkipConsecutiveSameLesson(day, 'a'), false);
assert.equal(shouldSkipConsecutiveSameLesson(day, 'b'), true);
assert.equal(shouldSkipConsecutiveSameLesson(day, 'c'), false);

const lessonDate = '2026-05-20';
const start = '14:00:00';
const startMs = toLessonStartUtcMs(lessonDate, start);
const nineMinBefore = startMs - 9 * 60 * 1000;
assert.equal(isInReminderWindow(lessonDate, start, nineMinBefore), true);
const fourteenMinBefore = startMs - 14 * 60 * 1000;
assert.equal(isInReminderWindow(lessonDate, start, fourteenMinBefore), false);
const fortyMinBefore = startMs - 40 * 60 * 1000;
assert.equal(isInReminderWindow(lessonDate, start, fortyMinBefore), false);

console.log('class-lesson-reminder-logic: ok');
