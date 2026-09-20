/** CRM vardiya: görevde olma hesabı ve uyarı alıcıları */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  istanbulDayMinute,
  shiftCoversMoment,
  onDutyUserIdsAt,
  alertRecipients,
  timeToMinutes
} from './crm-shifts.js';

// 2026-09-21 Pazartesi 10:30 İstanbul = 07:30 UTC
const monday1030 = Date.UTC(2026, 8, 21, 7, 30);

describe('istanbulDayMinute', () => {
  it('reads Istanbul weekday and minute', () => {
    assert.deepEqual(istanbulDayMinute(monday1030), { day: 1, minute: 10 * 60 + 30 });
    // Pazar 23:30 İstanbul = Pazar 20:30 UTC
    assert.deepEqual(istanbulDayMinute(Date.UTC(2026, 8, 20, 20, 30)), { day: 7, minute: 23 * 60 + 30 });
  });
});

describe('shiftCoversMoment', () => {
  const s = (d, a, b, extra = {}) => ({ day_of_week: d, start_time: a, end_time: b, user_id: 'u', ...extra });
  it('covers the normal daytime range, end exclusive', () => {
    assert.equal(shiftCoversMoment(s(1, '09:00', '14:00'), 1, 9 * 60), true);
    assert.equal(shiftCoversMoment(s(1, '09:00', '14:00'), 1, 13 * 60 + 59), true);
    assert.equal(shiftCoversMoment(s(1, '09:00', '14:00'), 1, 14 * 60), false, 'bitişte kapanır');
    assert.equal(shiftCoversMoment(s(1, '09:00', '14:00'), 1, 8 * 60 + 59), false);
    assert.equal(shiftCoversMoment(s(1, '09:00', '14:00'), 2, 10 * 60), false, 'başka gün');
  });
  it('supports 20:00-24:00 and overnight 22:00-02:00', () => {
    assert.equal(shiftCoversMoment(s(1, '20:00', '24:00'), 1, 23 * 60 + 59), true);
    const overnight = s(1, '22:00', '02:00');
    assert.equal(shiftCoversMoment(overnight, 1, 23 * 60), true, 'Pazartesi gecesi');
    assert.equal(shiftCoversMoment(overnight, 2, 60), true, 'Salı 01:00 hâlâ Pazartesi vardiyası');
    assert.equal(shiftCoversMoment(overnight, 2, 3 * 60), false);
    assert.equal(shiftCoversMoment(s(7, '22:00', '02:00'), 1, 60), true, 'Pazar gecesi → Pazartesi 01:00');
  });
  it('ignores passive or broken rows', () => {
    assert.equal(shiftCoversMoment(s(1, '09:00', '14:00', { is_active: false }), 1, 10 * 60), false);
    assert.equal(shiftCoversMoment(s(1, 'xx', '14:00'), 1, 10 * 60), false);
    assert.equal(shiftCoversMoment(null, 1, 600), false);
  });
});

describe('onDutyUserIdsAt', () => {
  it('returns everyone whose shift covers the moment', () => {
    const shifts = [
      { user_id: 'a', day_of_week: 1, start_time: '09:00', end_time: '14:00' },
      { user_id: 'b', day_of_week: 1, start_time: '09:00', end_time: '14:00' },
      { user_id: 'c', day_of_week: 1, start_time: '14:00', end_time: '20:00' },
      { user_id: 'd', day_of_week: 2, start_time: '09:00', end_time: '14:00' }
    ];
    assert.deepEqual(onDutyUserIdsAt(shifts, monday1030).sort(), ['a', 'b']);
    assert.deepEqual(onDutyUserIdsAt([], monday1030), []);
  });
});

describe('alertRecipients', () => {
  it('prefers the assigned agent when on duty', () => {
    assert.deepEqual(alertRecipients({ assignedUserId: 'a', onDuty: ['a', 'b'] }), ['a']);
  });
  it('falls back to on-duty agents when the assigned one is off duty', () => {
    assert.deepEqual(alertRecipients({ assignedUserId: 'z', onDuty: ['a', 'b'] }), ['a', 'b']);
  });
  it('adds the admin for red alerts and dedupes', () => {
    assert.deepEqual(alertRecipients({ assignedUserId: 'a', onDuty: ['a'], adminUserId: 'm', includeAdmin: true }), ['a', 'm']);
    assert.deepEqual(alertRecipients({ assignedUserId: 'a', onDuty: ['a'], adminUserId: 'a', includeAdmin: true }), ['a']);
    assert.deepEqual(alertRecipients({ assignedUserId: '', onDuty: [], adminUserId: 'm', includeAdmin: true }), ['m']);
  });
  it('keeps old behaviour when no shift is defined (onDuty null)', () => {
    assert.deepEqual(alertRecipients({ assignedUserId: 'a', onDuty: null }), ['a']);
    assert.deepEqual(alertRecipients({ assignedUserId: '', onDuty: null }), []);
  });
});

assert.equal(timeToMinutes('09:30'), 570);
assert.equal(timeToMinutes('24:00'), 1440);
assert.equal(timeToMinutes('abc'), null);
