import { describe, expect, it } from 'vitest';
import {
  buildFullNewTermPlannerState,
  buildYazBackupNewTermPlannerState,
  canonicalizePlannerGroupName,
  countYazBackupLessons,
  plannerNeedsFullNewTermSeed,
  mergeYazBackupIntoPlannerState,
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

  it('loads yaz backup groups including high school and YÖS', () => {
    const state = buildYazBackupNewTermPlannerState();
    const names = state.groups.map((g) => g.name);
    expect(names).toEqual(expect.arrayContaining(['9A', '10A', '11A', '11B', 'YKS', 'YÖS', '2A', '8A']));
    expect(countYazBackupLessons(state.groups)).toBeGreaterThan(50);
    const yos = state.groups.find((g) => g.name === 'YÖS');
    expect(Object.keys(yos?.schedule || {}).length).toBeGreaterThan(0);
    const yks = state.groups.find((g) => g.name === 'YKS');
    expect(Object.keys(yks?.schedule || {}).length).toBeGreaterThan(20);
  });

  it('merges excel primary/lgs8 over empty yaz shells into one program', () => {
    const full = buildFullNewTermPlannerState();
    const by = Object.fromEntries(full.groups.map((g) => [g.name, g]));
    expect(by['2A']).toBeTruthy();
    expect(by['5A']).toBeTruthy();
    expect(by['8F']).toBeTruthy();
    expect(by['9A']).toBeTruthy();
    expect(by['YÖS']).toBeTruthy();
    // Excel PNG filled 2A (math/coding) should not stay empty
    expect(Object.keys(by['2A'].schedule || {}).length).toBeGreaterThan(0);
    // Yaz high-school lessons remain
    expect(Object.keys(by['11A'].schedule || {}).length).toBeGreaterThan(0);
    expect(plannerNeedsFullNewTermSeed({ groups: [] })).toBe(true);
    expect(plannerNeedsFullNewTermSeed(full)).toBe(false);
  });
});

  it('does not wipe filled existing groups when merging yaz backup shells', () => {
    const current = {
      groups: [
        {
          id: 'keep-8a',
          name: '8A',
          schedule: {
            '0_0': { subject: 'MATEMATİK', teacher: 'Ali' },
            '0_1': { subject: 'MATEMATİK', teacher: 'Ali' },
            '1_0': { subject: 'FEN', teacher: 'Veli' },
          },
        },
      ],
    };
    const merged = mergeYazBackupIntoPlannerState(current);
    const eightA = merged.groups.find((g) => g.name === '8A');
    expect(eightA?.schedule['0_0']).toEqual({ subject: 'MATEMATİK', teacher: 'Ali' });
    expect(Object.keys(eightA?.schedule || {}).length).toBeGreaterThanOrEqual(3);
    // yaz backup high-school still added
    expect(merged.groups.some((g) => g.name === 'YÖS')).toBe(true);
    expect(merged.groups.some((g) => g.name === '9A')).toBe(true);
  });
