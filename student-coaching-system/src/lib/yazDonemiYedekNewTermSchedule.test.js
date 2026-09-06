import { describe, expect, it } from 'vitest';
import {
  buildFullNewTermPlannerState,
  buildYazBackupNewTermPlannerState,
  canonicalizePlannerGroupName,
  countYazBackupLessons,
  plannerNeedsFullNewTermSeed,
  writeYazBackupJsonIntoPlanner,
} from './yazDonemiYedekNewTermSchedule.ts';

describe('yazDonemiYedekNewTermSchedule', () => {
  it('canonicalizes class and YÖS names', () => {
    expect(canonicalizePlannerGroupName('8A YAZ KAMPI')).toBe('8A');
    expect(canonicalizePlannerGroupName('2026-2027 11-B SINIFI')).toBe('11B');
    expect(canonicalizePlannerGroupName('2026-2027 9 A SINIFI')).toBe('9A');
    expect(canonicalizePlannerGroupName('YÖS 2026 EKİM YILDIZLAR')).toBe('YÖS');
    expect(canonicalizePlannerGroupName('2026-2027 YILDIZLAR YKS GRUBU')).toBe('YKS');
    expect(canonicalizePlannerGroupName('SAT')).toBe('SAT');
  });

  it('loads yaz backups including high school, YÖS and filled 8th grade', () => {
    const state = buildYazBackupNewTermPlannerState();
    const names = state.groups.map((g) => g.name);
    expect(names).toEqual(expect.arrayContaining(['9A', '10A', '11A', '11B', 'YKS', 'YÖS', '2A', '8A', '8F']));
    expect(countYazBackupLessons(state.groups)).toBeGreaterThan(100);
    expect(Object.keys(state.groups.find((g) => g.name === '8A')?.schedule || {}).length).toBeGreaterThan(10);
    expect(Object.keys(state.groups.find((g) => g.name === 'YÖS')?.schedule || {}).length).toBeGreaterThan(0);
  });

  it('writes backup into planner without breaking existing structure or filled classes', () => {
    const current = {
      term: { start: '2026-09-01', end: '2027-06-19' },
      days: ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'],
      periods: [
        { label: 'A', time: '10:00–10:40' },
        { label: 'B', time: '10:50–11:30' },
      ],
      periodsByDay: { '0': [{ label: 'A', time: '10:00–10:40' }] },
      groups: [
        {
          id: 'keep-x',
          name: 'Özel Grup',
          schedule: { '0_0': { subject: 'DENEME', teacher: 'Z' } },
          periods: [{ label: 'A', time: '10:00–10:40' }],
        },
      ],
    };
    const merged = writeYazBackupJsonIntoPlanner(current);
    // structure preserved
    expect(merged.periods).toEqual(current.periods);
    expect(merged.days).toEqual(current.days);
    expect(merged.periodsByDay).toEqual(current.periodsByDay);
    // existing group kept
    expect(merged.groups.find((g) => g.name === 'Özel Grup')?.schedule['0_0']?.subject).toBe('DENEME');
    // backup groups added
    expect(merged.groups.some((g) => g.name === 'YÖS')).toBe(true);
    expect(merged.groups.some((g) => g.name === '8A')).toBe(true);
  });

  it('builds full program and detects seed need', () => {
    const full = buildFullNewTermPlannerState();
    expect(full.groups.length).toBeGreaterThan(10);
    expect(plannerNeedsFullNewTermSeed({ groups: [] })).toBe(true);
    expect(plannerNeedsFullNewTermSeed(full)).toBe(false);
  });
});
