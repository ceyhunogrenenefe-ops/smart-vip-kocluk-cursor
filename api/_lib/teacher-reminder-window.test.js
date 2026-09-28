import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTeacherReminderSession,
  teacherReminderSkippedSubject,
  teacherReminderWindowConfig
} from './teacher-lesson-reminder-job.js';
import { isWithinReminderWindowMs } from './lesson-reminder-window.js';

const dk = (n) => n * 60_000;

describe('öğretmen hatırlatma penceresi', () => {
  it('ayardan 10 dk önce, 2 dk genişlik', () => {
    const w = teacherReminderWindowConfig({ minutes_before: 10, window_minutes: 2 });
    assert.equal(w.minMinutes, 10);
    assert.equal(w.maxMinutes, 12);
    assert.equal(w.label, '10–12 dk kala');
  });

  it('10 dk kala gönderilir, 9 ve 13 dk kala gönderilmez', () => {
    const w = teacherReminderWindowConfig({ minutes_before: 10, window_minutes: 2 });
    assert.equal(isWithinReminderWindowMs(dk(10), w), true);
    assert.equal(isWithinReminderWindowMs(dk(11), w), true);
    assert.equal(isWithinReminderWindowMs(dk(12), w), true);
    assert.equal(isWithinReminderWindowMs(dk(9), w), false);
    assert.equal(isWithinReminderWindowMs(dk(13), w), false);
  });

  it('ders başladıysa hiç gönderilmez', () => {
    const w = teacherReminderWindowConfig({ minutes_before: 10, window_minutes: 2 });
    assert.equal(isWithinReminderWindowMs(0, w), false);
    assert.equal(isWithinReminderWindowMs(dk(-5), w), false);
  });

  it('ayar yoksa varsayılan yine 10 dk', () => {
    const w = teacherReminderWindowConfig(null);
    assert.equal(w.minMinutes, 10);
  });

  it('yönetici süreyi değiştirebilir', () => {
    const w = teacherReminderWindowConfig({ minutes_before: 30, window_minutes: 5 });
    assert.equal(w.minMinutes, 30);
    assert.equal(w.maxMinutes, 35);
    assert.equal(isWithinReminderWindowMs(dk(32), w), true);
    assert.equal(isWithinReminderWindowMs(dk(10), w), false);
  });

  it('sınırlar zorlanamaz', () => {
    assert.equal(teacherReminderWindowConfig({ minutes_before: 0 }).minMinutes, 10);
    assert.equal(teacherReminderWindowConfig({ minutes_before: 999 }).minMinutes, 55);
  });
});

describe('gönderim hattı çözümleme', () => {
  it('panelden seçim her zaman önceliklidir', async () => {
    const r = await resolveTeacherReminderSession({ gateway_user_id: 'abc-123' });
    assert.equal(r.sessionId, 'abc-123');
    assert.equal(r.source, 'manual');
  });

  it('seçim yoksa süper admin hattına bakılır', async () => {
    // Bağlı oturum yoksa none döner; sıra manual -> super_admin -> env
    const r = await resolveTeacherReminderSession({ gateway_user_id: '' });
    assert.ok(['super_admin', 'env', 'none'].includes(r.source));
    if (r.source === 'none') assert.equal(r.sessionId, '');
  });
});

describe('etüt / deneme derslerinde hatırlatma', () => {
  it('etüt ve deneme atlanır', () => {
    assert.equal(teacherReminderSkippedSubject('Etüt'), true);
    assert.equal(teacherReminderSkippedSubject('etüt'), true);
    assert.equal(teacherReminderSkippedSubject('ETÜT'), true);
    assert.equal(teacherReminderSkippedSubject('Etüd'), true);
    assert.equal(teacherReminderSkippedSubject('DENEME'), true);
    assert.equal(teacherReminderSkippedSubject('Deneme analizi'), true);
    assert.equal(teacherReminderSkippedSubject('Deneme Analizi'), true);
  });

  it('normal dersler atlanmaz', () => {
    assert.equal(teacherReminderSkippedSubject('Matematik'), false);
    assert.equal(teacherReminderSkippedSubject('Fizik'), false);
    assert.equal(teacherReminderSkippedSubject('Türkçe'), false);
    assert.equal(teacherReminderSkippedSubject('Biyoloji'), false);
    assert.equal(teacherReminderSkippedSubject('Kimya'), false);
  });

  it('boş konu atlanmaz', () => {
    assert.equal(teacherReminderSkippedSubject(''), false);
    assert.equal(teacherReminderSkippedSubject(null), false);
  });
});
