import assert from 'node:assert/strict';
import {
  logRowOnIstanbulDay,
  templateTelemetry,
  cronVisualState,
  isOperationalFailure,
  isConfigurationFailure
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
assert.equal(isConfigurationFailure({ error: '(#3) Application does not have the API granular permission' }), true);

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

const kitapTpl = {
  id: '2',
  type: 'kitap_siparis_bildirim',
  name: 'kitap_siparisi (Meta)',
  meta_template_name: 'kitap_siparisi',
  is_active: true
};
const kitapLogs = [
  {
    kind: 'book_order_notify',
    status: 'failed',
    sent_at: `${today}T11:00:00+03:00`,
    log_date: today,
    error: '(#3) Application does not have the API granular permission',
    meta_template_name: 'kitap_siparisi'
  },
  {
    kind: 'kitap_siparis_bildirim',
    status: 'failed',
    sent_at: `${today}T10:00:00+03:00`,
    log_date: today,
    error: '(#3) granular permission',
    meta_template_name: 'kitap_siparisi'
  }
];
const kitapTel = templateTelemetry(kitapTpl, kitapLogs, today);
assert.equal(kitapTel.failed_today, 2);
assert.equal(kitapTel.failed_today_configuration, 2);
assert.equal(kitapTel.badge, 'active');

const dailyDef = { expectEveryMinutes: 24 * 60, awaiting_first_run: false };
const lastDaily = { ran_at: `${today}T19:00:00.000Z`, ok: true, skipped: null };
assert.equal(cronVisualState(dailyDef, lastDaily, Date.now(), today).state, 'ok');

console.log('whatsapp-center-stats: ok');
