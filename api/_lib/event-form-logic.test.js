import assert from 'node:assert/strict';
import {
  slugifyTr,
  isValidSlug,
  normalizeFormSettings,
  validateSubmission,
  normalizeTrMobile,
  eventStartMs,
  reminderFireMs,
  isReminderDue,
  participantEligibleForReminder,
  normalizeReminderInput,
  describeReminder,
  REMINDER_LATE_GRACE_MS,
  AFTER_REMINDER_LATE_GRACE_MS,
  validateSurvey,
  summarizeSurvey,
  DEFAULT_REMINDERS
} from './event-form-logic.js';

// slug
assert.equal(slugifyTr('Paragraf Etkinliği'), 'paragraf-etkinligi');
assert.equal(slugifyTr('  YKS Stresi: Başarını ETKİLEMESİN!  '), 'yks-stresi-basarini-etkilemesin');
assert.equal(isValidSlug('paragraf-etkinligi'), true);
assert.equal(isValidSlug('-bad'), false);
assert.equal(isValidSlug('a'), false);

// settings defaults
const s = normalizeFormSettings({});
assert.equal(s.fields.student_name.enabled, true);
assert.equal(s.fields.grade.enabled, false);
assert.equal(s.send_confirmation, true);
assert.equal(s.add_to_crm, true);
assert.equal(normalizeFormSettings({ add_to_crm: false }).add_to_crm, false);

// phone
assert.equal(normalizeTrMobile('0532 123 45 67'), '+905321234567');
assert.equal(normalizeTrMobile('5321234567'), '+905321234567');
assert.equal(normalizeTrMobile('+90 532 123 45 67'), '+905321234567');
assert.equal(normalizeTrMobile('0212 123 45 67'), null); // sabit hat
assert.equal(normalizeTrMobile('+49 151 23456789'), '+4915123456789');
assert.equal(normalizeTrMobile('123'), null);

// submission
const bad = validateSubmission({ parent_name: 'A', phone: '1', kvkk: false }, {});
assert.equal(bad.ok, false);
assert.ok(bad.errors.parent_name && bad.errors.phone && bad.errors.kvkk && bad.errors.student_name);
const good = validateSubmission(
  { parent_name: ' Ayşe  Yılmaz ', student_name: 'Ali', phone: '05321234567', kvkk: true },
  {}
);
assert.equal(good.ok, true);
assert.equal(good.data.parent_name, 'Ayşe Yılmaz');
assert.equal(good.data.phone, '+905321234567');
const noStudent = validateSubmission(
  { parent_name: 'Ayşe Yılmaz', phone: '05321234567', kvkk: true },
  { fields: { student_name: { enabled: false } } }
);
assert.equal(noStudent.ok, true);
assert.equal(validateSubmission({ parent_name: 'Ayşe Yılmaz', student_name: 'Ali', phone: '05321234567', kvkk: 'true' }, {}).ok, false);

// timing: etkinlik 2026-11-10 21:00 İstanbul = 18:00Z
const ev = { event_date: '2026-11-10', event_time: '21:00:00' };
const start = eventStartMs(ev);
assert.equal(new Date(start).toISOString(), '2026-11-10T18:00:00.000Z');
const dayBefore = { kind: 'before', offset_minutes: 1440, enabled: true };
const morning = { kind: 'day_of', at_time: '10:00', enabled: true };
const tenMin = { kind: 'before', offset_minutes: 10, enabled: true };
assert.equal(new Date(reminderFireMs(ev, dayBefore)).toISOString(), '2026-11-09T18:00:00.000Z');
assert.equal(new Date(reminderFireMs(ev, morning)).toISOString(), '2026-11-10T07:00:00.000Z');
assert.equal(new Date(reminderFireMs(ev, tenMin)).toISOString(), '2026-11-10T17:50:00.000Z');
assert.equal(reminderFireMs(ev, { kind: 'day_of', at_time: '22:00' }), null); // etkinlikten sonra
assert.equal(reminderFireMs({ event_date: null }, tenMin), null);

const fire10 = reminderFireMs(ev, tenMin);
assert.equal(isReminderDue(ev, tenMin, fire10 - 1), false);
assert.equal(isReminderDue(ev, tenMin, fire10), true);
assert.equal(isReminderDue(ev, tenMin, fire10 + 5 * 60 * 1000), true);
assert.equal(isReminderDue(ev, tenMin, start + 1), false); // başladı
assert.equal(isReminderDue(ev, { ...tenMin, enabled: false }, fire10), false);
const fireDay = reminderFireMs(ev, dayBefore);
assert.equal(isReminderDue(ev, dayBefore, fireDay + REMINDER_LATE_GRACE_MS + 1), false); // çok geç

// eligibility
assert.equal(participantEligibleForReminder({ phone: '+90', created_at: '2026-11-10T17:00:00Z' }, fire10), true);
assert.equal(participantEligibleForReminder({ phone: '+90', created_at: '2026-11-10T17:55:00Z' }, fire10), false);
assert.equal(participantEligibleForReminder({ phone: '' }, fire10), false);

// reminder input
assert.deepEqual(normalizeReminderInput({ kind: 'day_of', at_time: '9:05' }).at_time, '09:05');
assert.equal(normalizeReminderInput({ kind: 'day_of', at_time: '25:00' }), null);
assert.equal(normalizeReminderInput({ kind: 'before', offset_minutes: -5 }), null);
assert.equal(normalizeReminderInput({ kind: 'before', offset_minutes: '60' }).offset_minutes, 60);

assert.equal(describeReminder(dayBefore), '1 gün önce');
assert.equal(describeReminder(tenMin), '10 dakika önce');
assert.equal(describeReminder({ kind: 'before', offset_minutes: 120 }), '2 saat önce');
assert.equal(describeReminder(morning), 'Etkinlik günü saat 10:00');

// etkinlik sonrası (anket)
const after2h = { kind: 'after', offset_minutes: 120, enabled: true };
assert.equal(new Date(reminderFireMs(ev, after2h)).toISOString(), '2026-11-10T20:00:00.000Z');
const fireAfter = reminderFireMs(ev, after2h);
assert.equal(isReminderDue(ev, after2h, fireAfter - 1), false);
assert.equal(isReminderDue(ev, after2h, fireAfter), true); // etkinlik başlamış olsa da gider
assert.equal(isReminderDue(ev, after2h, fireAfter + 3 * 3600 * 1000), true);
assert.equal(isReminderDue(ev, after2h, fireAfter + AFTER_REMINDER_LATE_GRACE_MS + 1), false);
assert.equal(describeReminder(after2h), 'Etkinlikten 2 saat sonra');
assert.equal(normalizeReminderInput({ kind: 'after', offset_minutes: 90 }).template_type, 'institution_event_survey');
assert.equal(normalizeReminderInput({ kind: 'after', offset_minutes: 90 }).kind, 'after');
assert.ok(DEFAULT_REMINDERS.some((r) => r.kind === 'after'));
// kayıt, anket gönderiminden önce olduysa alır
assert.equal(participantEligibleForReminder({ phone: '+90', created_at: '2026-11-10T17:00:00Z' }, fireAfter), true);

// anket doğrulama
assert.equal(validateSurvey({}).ok, false);
assert.equal(validateSurvey({ rating: 6 }).ok, false);
const sv = validateSurvey({ rating: '4', expectation: 'kismen', want_info: true, comment: '  güzeldi ' });
assert.equal(sv.ok, true);
assert.deepEqual(sv.data, { rating: 4, expectation: 'kismen', want_info: true, topics: null, comment: 'güzeldi' });
assert.equal(validateSurvey({ rating: 5, expectation: 'xx' }).data.expectation, null);

const sum = summarizeSurvey([
  { rating: 5, expectation: 'evet', want_info: true },
  { rating: 4, expectation: 'kismen', want_info: false },
  { rating: 3, expectation: null, want_info: null }
]);
assert.equal(sum.count, 3);
assert.equal(sum.average, 4);
assert.equal(sum.distribution[5], 1);
assert.equal(sum.expectation.kismen, 1);
assert.equal(sum.want_info, 1);
assert.equal(summarizeSurvey([]).average, null);

console.log('event-form-logic ok');
