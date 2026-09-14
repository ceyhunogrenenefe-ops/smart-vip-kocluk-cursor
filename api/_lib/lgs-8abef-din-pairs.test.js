import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LGS_8ABEF_SCHEDULE } from './lgs-8abef-schedule.js';
import {
  lgs8DinPartnerSections,
  lgs8DinSharedMeetingKeyPrefix,
  sessionsShareLgs8DinRoom
} from './lgs8-din-shared-bbb.js';

function norm(s) {
  return String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i');
}

function dinSlots(classKey) {
  return (LGS_8ABEF_SCHEDULE[classKey] || []).filter((s) => norm(s.subject).includes('din'));
}

describe('lgs8 Din schedule pairs + shared BBB', () => {
  it('keeps 8B and 8F Din on Friday 20:40 (Excel)', () => {
    const b = dinSlots('8B');
    const f = dinSlots('8F');
    assert.equal(b.length, 1);
    assert.equal(f.length, 1);
    assert.equal(b[0].day_of_week, f[0].day_of_week);
    assert.equal(b[0].start_time, f[0].start_time);
    assert.equal(b[0].day_of_week, 5);
    assert.equal(String(b[0].start_time).slice(0, 5), '20:40');
  });

  it('keeps 8A and 8C Din on Thursday 19:50 (Excel)', () => {
    const a = dinSlots('8A');
    const c = dinSlots('8C');
    assert.equal(a.length, 1);
    assert.equal(c.length, 1);
    assert.equal(a[0].day_of_week, c[0].day_of_week);
    assert.equal(a[0].start_time, c[0].start_time);
    assert.equal(a[0].day_of_week, 4);
    assert.equal(String(a[0].start_time).slice(0, 5), '19:50');
  });

  it('uses distinct shared BBB rooms for 8A+8C vs 8B+8F', () => {
    assert.deepEqual(lgs8DinPartnerSections('8B', ''), ['8F']);
    assert.deepEqual(lgs8DinPartnerSections('8A', ''), ['8C']);
    const a = lgs8DinSharedMeetingKeyPrefix({
      subject: 'DİN KÜLTÜRÜ',
      className: '8A',
      dayOfWeek: 4,
      startTime: '19:50:00'
    });
    const c = lgs8DinSharedMeetingKeyPrefix({
      subject: 'DİN KÜLTÜRÜ',
      className: '8C',
      dayOfWeek: 4,
      startTime: '19:50:00'
    });
    const b = lgs8DinSharedMeetingKeyPrefix({
      subject: 'DİN KÜLTÜRÜ',
      className: '8B',
      dayOfWeek: 5,
      startTime: '20:40:00'
    });
    const f = lgs8DinSharedMeetingKeyPrefix({
      subject: 'DİN KÜLTÜRÜ',
      className: '8F',
      dayOfWeek: 5,
      startTime: '20:40:00'
    });
    assert.equal(a, c);
    assert.equal(b, f);
    assert.notEqual(a, b);
    assert.equal(
      sessionsShareLgs8DinRoom(
        { subject: 'DİN KÜLTÜRÜ', className: '8B' },
        { subject: 'DİN KÜLTÜRÜ', className: '8F' }
      ),
      true
    );
    assert.equal(
      sessionsShareLgs8DinRoom(
        { subject: 'DİN KÜLTÜRÜ', className: '8A' },
        { subject: 'DİN KÜLTÜRÜ', className: '8B' }
      ),
      false
    );
  });
});
