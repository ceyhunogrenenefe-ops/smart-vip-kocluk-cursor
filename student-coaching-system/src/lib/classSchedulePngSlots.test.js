import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isoToDowMon1,
  mergeWeeklyAndSessionSlots
} from './classSchedulePngSlots.js';

describe('mergeWeeklyAndSessionSlots', () => {
  it('builds PNG rows from dated sessions when weekly slots are empty (8C)', () => {
    const merged = mergeWeeklyAndSessionSlots([], [
      {
        lesson_date: '2026-08-27',
        start_time: '19:00:00',
        end_time: '19:40:00',
        subject: 'MATEMATİK',
        teacher_name: 'Mat öğretmen',
        status: 'scheduled'
      }
    ]);
    assert.equal(isoToDowMon1('2026-08-27'), 4);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].day_of_week, 4);
    assert.equal(merged[0].subject, 'MATEMATİK');
  });

  it('lets a dated session overlay a weekly template at the same weekday/time', () => {
    const merged = mergeWeeklyAndSessionSlots(
      [
        {
          day_of_week: 1,
          start_time: '19:00:00',
          end_time: '19:40:00',
          subject: 'FEN BİLİMLERİ',
          teacher_name: 'Fen A'
        }
      ],
      [
        {
          lesson_date: '2026-08-31',
          start_time: '19:00:00',
          end_time: '19:40:00',
          subject: 'FEN BİLİMLERİ',
          teacher_name: 'Fen C',
          status: 'scheduled'
        }
      ]
    );
    assert.equal(isoToDowMon1('2026-08-31'), 1);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].teacher_name, 'Fen C');
  });

  it('skips cancelled sessions', () => {
    const merged = mergeWeeklyAndSessionSlots([], [
      {
        lesson_date: '2026-08-27',
        start_time: '19:00:00',
        end_time: '19:40:00',
        subject: 'MATEMATİK',
        status: 'cancelled'
      }
    ]);
    assert.equal(merged.length, 0);
  });
});
