import assert from 'node:assert/strict';
import {
  isClassLessonReminderForceDisabled,
  isClassLessonReminderMetaEnabled,
  validateClassLessonReminderTemplate
} from './class-lesson-reminder-send.js';

const prevEnabled = process.env.CLASS_LESSON_REMINDER_ENABLED;
const prevMeta = process.env.CLASS_LESSON_REMINDER_META_ENABLED;

try {
  delete process.env.CLASS_LESSON_REMINDER_ENABLED;
  assert.equal(isClassLessonReminderForceDisabled(), false, 'default: reminders enabled');

  process.env.CLASS_LESSON_REMINDER_ENABLED = '1';
  assert.equal(isClassLessonReminderForceDisabled(), false);

  process.env.CLASS_LESSON_REMINDER_ENABLED = '0';
  assert.equal(isClassLessonReminderForceDisabled(), true);
  assert.equal(
    validateClassLessonReminderTemplate({ content: 'x', is_active: true }).code,
    'class_lesson_reminders_suspended'
  );

  process.env.CLASS_LESSON_REMINDER_ENABLED = '1';
  assert.equal(validateClassLessonReminderTemplate({ content: 'x', is_active: true }).ok, true);
  assert.equal(validateClassLessonReminderTemplate({ content: 'x', is_active: false }).code, 'template_inactive');
  assert.equal(validateClassLessonReminderTemplate(null).code, 'template_not_found');

  delete process.env.CLASS_LESSON_REMINDER_META_ENABLED;
  assert.equal(isClassLessonReminderMetaEnabled(), true, 'Meta channel default on');
  process.env.CLASS_LESSON_REMINDER_META_ENABLED = '0';
  assert.equal(isClassLessonReminderMetaEnabled(), false);
} finally {
  if (prevEnabled === undefined) delete process.env.CLASS_LESSON_REMINDER_ENABLED;
  else process.env.CLASS_LESSON_REMINDER_ENABLED = prevEnabled;
  if (prevMeta === undefined) delete process.env.CLASS_LESSON_REMINDER_META_ENABLED;
  else process.env.CLASS_LESSON_REMINDER_META_ENABLED = prevMeta;
}

console.log('class-lesson-reminder-send tests ok');
