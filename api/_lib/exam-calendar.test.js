import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXAM_CALENDAR_LEVELS,
  examCalendarLevelForClassLevel as lv,
  examCalendarLevelLabel
} from './exam-calendar.js';
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
  it('maps middle school grades to their own calendar', () => {
    // Deneme Kulübü için açıldı: önceden bu kademeler null dönüyordu
    assert.equal(lv('3'), '3');
    assert.equal(lv('4. Sınıf'), '4');
    assert.equal(lv('5'), '5');
    assert.equal(lv('6'), '6');
    assert.equal(lv('7. sınıf'), '7');
  });
  it('maps 8 and LGS to the lgs calendar', () => {
    for (const v of ['8', '8. Sınıf', 'LGS', 'lgs', '8.sınıf LGS']) assert.equal(lv(v), 'lgs', String(v));
  });
  it('returns null for YÖS, 2. sınıf and boş değer', () => {
    for (const v of ['YOS', 'YÖS', '2', '2. Sınıf', '', null, undefined]) assert.equal(lv(v), null, String(v));
  });
  it('bütün eşleşmeler geçerli bir kademe döndürür', () => {
    for (const v of ['3', '4', '5', '6', '7', '8', 'LGS', '9', '10', '11', '12', 'YKS']) {
      const r = lv(v);
      assert.ok(EXAM_CALENDAR_LEVELS.includes(r), `${v} -> ${r}`);
    }
  });
  it('her kademenin okunur bir adı var', () => {
    for (const l of EXAM_CALENDAR_LEVELS) {
      assert.ok(examCalendarLevelLabel(l).length > 0, l);
    }
    assert.equal(examCalendarLevelLabel('lgs'), 'LGS (8. Sınıf)');
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
