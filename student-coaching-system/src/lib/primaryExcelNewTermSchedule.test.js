import { describe, expect, it } from 'vitest';
import {
  PRIMARY_DAYS,
  PRIMARY_SATURDAY_PERIODS,
  PRIMARY_WEEKDAY_PERIODS,
  buildPrimaryExcelNewTermPlannerState,
  countPrimaryExcelLessons,
  mergePrimaryExcelIntoPlannerState,
  plannerNeedsPrimaryExcelSeed,
} from './primaryExcelNewTermSchedule.ts';

describe('primaryExcelNewTermSchedule', () => {
  it('builds 2A/4A/5A/6A/7A with weekday and Saturday periods', () => {
    const state = buildPrimaryExcelNewTermPlannerState();
    expect(state.days).toEqual([...PRIMARY_DAYS]);
    expect(state.periods).toEqual(PRIMARY_WEEKDAY_PERIODS);
    expect(state.periodsByDay['5']).toEqual(PRIMARY_SATURDAY_PERIODS);
    expect(state.groups.map((g) => g.name)).toEqual(['2A', '4A', '5A', '6A', '7A']);
    expect(countPrimaryExcelLessons(state.groups)).toBeGreaterThan(70);
  });

  it('maps 2A Tuesday math and Thursday coding', () => {
    const g = buildPrimaryExcelNewTermPlannerState().groups.find((x) => x.name === '2A');
    expect(g?.schedule['1_2']).toEqual({ subject: 'MATEMATİK', teacher: '' });
    expect(g?.schedule['1_3']).toEqual({ subject: 'MATEMATİK', teacher: '' });
    expect(g?.schedule['3_2']).toEqual({ subject: 'KODLAMA', teacher: '' });
    expect(g?.schedule['3_3']).toEqual({ subject: 'KODLAMA', teacher: '' });
  });

  it('maps 5A/6A/7A weekday and Saturday blocks from PNG', () => {
    const byName = Object.fromEntries(
      buildPrimaryExcelNewTermPlannerState().groups.map((g) => [g.name, g])
    );
    expect(byName['5A'].schedule['0_1']?.subject).toBe('REHBERLİK');
    expect(byName['5A'].schedule['2_2']?.subject).toBe('SOSYAL BİLGİLER');
    expect(byName['5A'].schedule['5_0']?.subject).toBe('DENEME SINAVI');
    expect(byName['5A'].schedule['5_1']?.subject).toBe('MATEMATİK');
    expect(byName['5A'].schedule['5_3']?.subject).toBe('İNGİLİZCE');

    expect(byName['6A'].schedule['0_2']?.subject).toBe('SOSYAL BİLGİLER');
    expect(byName['6A'].schedule['5_1']?.subject).toBe('İNGİLİZCE');
    expect(byName['6A'].schedule['5_3']?.subject).toBe('MATEMATİK');

    expect(byName['7A'].schedule['1_2']?.subject).toBe('TÜRKÇE');
    expect(byName['7A'].schedule['1_4']?.subject).toBe('SOSYAL BİLGİLER');
    expect(byName['7A'].schedule['5_1']?.subject).toBe('FEN BİLGİSİ');
  });

  it('merges into existing planner groups without wiping 8A', () => {
    const merged = mergePrimaryExcelIntoPlannerState({
      groups: [{ name: '8A', schedule: { '0_0': { subject: 'ETÜT', teacher: 'X' } } }],
    });
    expect(merged.groups.map((g) => g.name)).toEqual(['8A', '2A', '4A', '5A', '6A', '7A']);
    expect(plannerNeedsPrimaryExcelSeed({ groups: [] })).toBe(true);
    expect(plannerNeedsPrimaryExcelSeed(merged)).toBe(false);
  });
});
