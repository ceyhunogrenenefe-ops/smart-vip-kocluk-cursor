import assert from 'node:assert/strict';
import {
  logRowOnIstanbulDay,
  templateTelemetry,
  cronVisualState,
  isOperationalFailure
} from './whatsapp-center-stats.js';

const today = '2026-05-20';
assert.equal(
  logRowOnIstanbulDay(
    { log_date: '2026-05-19', sent_at: '2026-05-20T08:00:00+03:00' },
    today
  ),
  true
);
assert.equal(logRowOnIstanbulDay({ log_date: today, sent_at: null }, today), true);

assert.equal(isOperationalFailure({ error: 'invalid_phone' }), true);
assert.equal(isOperationalFailure({ error: 'Meta API (#132001)' }), false);

const tpl = {
  id: '1',
  type: 'class_lesson_reminder',
  name: 'Grup',
  meta_template_name: 'class_lesson_reminder',
  is_active: true,
  variables: ['student_name']
};
const logs = [
  { kind: 'class_lesson_reminder', status: 'sent', sent_at: `${today}T10:00:00+03:00`, log_date: today },
  { kind: 'class_lesson_reminder', status: 'failed', sent_at: `${today}T09:00:00+03:00`, log_date: today, error: 'invalid_phone' },
  { kind: 'class_lesson_reminder', status: 'failed', sent_at: `${today}T08:00:00+03:00`, log_date: today, error: 'Meta 132001' }
];
const tel = templateTelemetry(tpl, logs, today);
assert.equal(tel.success_today, 1);
assert.equal(tel.failed_today, 2);
assert.equal(tel.failed_today_operational, 1);
assert.equal(tel.badge, 'active');

const dailyDef = { expectEveryMinutes: 24 * 60, awaiting_first_run: false };
const lastDaily = { ran_at: `${today}T19:00:00.000Z`, ok: true, skipped: null };
assert.equal(cronVisualState(dailyDef, lastDaily, Date.now(), today).state, 'ok');

console.log('whatsapp-center-stats: ok');
