import test from 'node:test';
import assert from 'node:assert/strict';

test('studentActiveForReminders: yalnız sistemde aktif öğrenciler', async () => {
  process.env.SUPABASE_URL ||= 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'x';
  const { studentActiveForReminders } = await import('./daily-report-reminder-job.js');
  const users = new Map([
    ['u-on', true],
    ['u-off', false]
  ]);
  assert.equal(studentActiveForReminders({ enrollment_status: 'confirmed', platform_user_id: 'u-on' }, users), true);
  assert.equal(studentActiveForReminders({ enrollment_status: 'trial' }, users), true);
  assert.equal(studentActiveForReminders({ enrollment_status: null }, users), true);
  assert.equal(studentActiveForReminders({ enrollment_status: 'withdrawn' }, users), false);
  assert.equal(studentActiveForReminders({ enrollment_status: 'confirmed', deleted_at: '2026-09-01' }, users), false);
  assert.equal(studentActiveForReminders({ enrollment_status: 'confirmed', user_id: 'u-off' }, users), false);
  assert.equal(studentActiveForReminders({ enrollment_status: 'confirmed', user_id: 'bilinmeyen' }, users), true);
});

test('rapor hatırlatması yalnız koç gateway (Meta yedeği yok)', async () => {
  delete process.env.NOTIFY_CHANNEL_REPORT_REMINDER;
  const { resolveEffectiveSendChannel, SEND_CHANNELS } = await import('./notification-config.js');
  assert.equal(resolveEffectiveSendChannel('report_reminder'), SEND_CHANNELS.COACH_GATEWAY);
  const { getNotificationDefinition } = await import('./notification-config.js');
  // Koç hattı bağlı değilse 0850'den gönderilmez; koç QR ile hattını bağlamalı
  assert.equal(getNotificationDefinition('report_reminder').allowMetaFallback, false);
  assert.equal(getNotificationDefinition('class_lesson_reminder').allowMetaFallback, false);
});
