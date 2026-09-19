import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { examCalendarLevelForClassLevel as lv } from './exam-calendar.js';
import { EXAM_CALENDAR_SEED } from './exam-calendar-seed.js';

describe('examCalendarLevelForClassLevel', () => {
  it('maps high-school grades to their own calendar', () => {
    assert.equal(lv('9'), '9');
    assert.equal(lv('10'), '10');
    assert.equal(lv('11'), '11');
    assert.equal(lv('9. Sınıf'), '9');
  });
  it('maps 12 / YKS / TYT to yks', () => {
    for (const v of ['12', 'YKS', 'YKS-Sayısal', 'TYT-Maarif', 'Mezun']) assert.equal(lv(v), 'yks', v);
  });
  it('returns null for LGS, YÖS and lower grades', () => {
    for (const v of ['LGS', '7', '6', '5. Sınıf', 'YOS', '7.sınıf LGS', '', null]) assert.equal(lv(v), null, String(v));
  });
});

describe('seed', () => {
  it('has 117 exams with valid levels and dates', () => {
    assert.equal(EXAM_CALENDAR_SEED.length, 117);
    for (const r of EXAM_CALENDAR_SEED) {
      assert.ok(['9', '10', '11', 'yks'].includes(r.level));
      assert.match(r.exam_date, /^\d{4}-\d{2}-\d{2}$/);
    }
    assert.equal(new Set(EXAM_CALENDAR_SEED.map((r) => r.id)).size, 117, 'id tekil');
  });
});
