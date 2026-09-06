import { describe, expect, it } from 'vitest';
import {
  LGS8_DAYS,
  LGS8_SATURDAY_PERIODS,
  LGS8_WEEKDAY_PERIODS,
  buildLgs8ExcelNewTermPlannerState,
  countLgs8ExcelLessons,
  countPlannerLessonCells,
  plannerNeedsLgs8ExcelSeed,
} from './lgs8ExcelNewTermSchedule.ts';

describe('lgs8ExcelNewTermSchedule', () => {
  it('builds four 8th-grade groups with Excel weekday/weekend periods', () => {
    const state = buildLgs8ExcelNewTermPlannerState();
    expect(state.days).toEqual([...LGS8_DAYS]);
    expect(state.periods).toEqual(LGS8_WEEKDAY_PERIODS);
    expect(state.periodsByDay['5']).toEqual(LGS8_SATURDAY_PERIODS);
    expect(state.groups.map((g) => g.name)).toEqual(['8A', '8B', '8C', '8F']);
    expect(countLgs8ExcelLessons(state)).toBeGreaterThan(100);
  });

  it('places rehberlik and weekend deneme for 8F', () => {
    const state = buildLgs8ExcelNewTermPlannerState();
    const g = state.groups.find((x) => x.name === '8F');
    expect(g?.schedule['0_2']).toEqual({ subject: 'REHBERLİK', teacher: 'Doğan Aktürk' });
    expect(g?.schedule['5_0']?.subject).toBe('DENEME SINAVI SÖZEL');
    expect(g?.schedule['5_2']).toMatchObject({ subject: 'MATEMATİK', teacher: 'Doğan Aktürk' });
    expect(g?.schedule['6_1']?.subject).toBe('DENEME SINAVI TEKRAR');
  });

  it('keeps class-specific math teachers and Thursday layouts', () => {
    const state = buildLgs8ExcelNewTermPlannerState();
    const byName = Object.fromEntries(state.groups.map((g) => [g.name, g]));
    expect(byName['8A'].schedule['3_2']).toMatchObject({
      subject: 'MATEMATİK',
      teacher: 'Ahmet Dağüstü',
    });
    expect(byName['8A'].schedule['3_3']?.subject).toBe('DİN KÜLTÜRÜ');
    expect(byName['8A'].schedule['3_4']?.subject).toBe('İNKILAP TARİHİ');
    expect(byName['8B'].schedule['4_2']).toMatchObject({
      subject: 'MATEMATİK',
      teacher: 'Merve Yurdakul',
    });
    expect(byName['8C'].schedule['3_2']?.subject).toBe('İNKILAP TARİHİ');
    expect(byName['8C'].schedule['3_4']).toMatchObject({
      subject: 'MATEMATİK',
      teacher: 'Erdal Karadaş',
    });
    expect(byName['8C'].schedule['5_4']?.subject).toBe('İNGİLİZCE');
  });

  it('detects empty plans that need Excel seed', () => {
    expect(plannerNeedsLgs8ExcelSeed({ groups: [] })).toBe(true);
    expect(plannerNeedsLgs8ExcelSeed({ groups: [{ name: '8A', schedule: {} }] })).toBe(true);
    expect(plannerNeedsLgs8ExcelSeed(buildLgs8ExcelNewTermPlannerState())).toBe(false);
    expect(countPlannerLessonCells(buildLgs8ExcelNewTermPlannerState())).toBeGreaterThan(100);
  });
});
