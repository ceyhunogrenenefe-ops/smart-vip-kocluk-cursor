import { describe, expect, it } from 'vitest';
import { periodsForPlannerDay } from './class-schedule-plan-periods.js';

describe('periodsForPlannerDay', () => {
  const pj = {
    periods: [{ label: '1', time: '10:00–10:40' }],
    periodsByDay: {
      0: [{ label: 'Pzt', time: '09:00–09:40' }],
      5: [{ label: 'Cmt', time: '10:00–11:00' }]
    }
  };

  it('prefers group day periods, then state day periods, then group default', () => {
    expect(periodsForPlannerDay({ periods: [{ label: 'G', time: '17:00–17:40' }] }, pj, 0)[0].time).toBe(
      '09:00–09:40'
    );
    expect(periodsForPlannerDay({ periods: [{ label: 'G', time: '17:00–17:40' }] }, pj, 1)[0].time).toBe(
      '17:00–17:40'
    );
    expect(periodsForPlannerDay({ periods: [{ label: 'G', time: '17:00–17:40' }] }, pj, 5)[0].time).toBe(
      '10:00–11:00'
    );
    expect(
      periodsForPlannerDay(
        { periodsByDay: { 1: [{ label: 'X', time: '20:00–20:40' }] } },
        pj,
        1
      )[0].time
    ).toBe('20:00–20:40');
  });
});
