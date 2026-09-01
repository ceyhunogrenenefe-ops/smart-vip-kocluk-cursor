import { describe, expect, it } from 'vitest';
import {
  NEW_TERM_END,
  NEW_TERM_START,
  blankNewTermPlannerState,
  isNewTermPlanName,
  pickNewTermPlan,
} from './newTermSchedulePlanner.ts';

describe('newTermSchedulePlanner', () => {
  it('names the 2026-2027 academic canvas', () => {
    expect(isNewTermPlanName('Ders Saatleri 2026-2027')).toBe(true);
    expect(isNewTermPlanName('Ders Saatleri Yeni Dönem Programı 2026-2027')).toBe(true);
    expect(isNewTermPlanName('2025 Yaz Dönemi')).toBe(false);
    expect(isNewTermPlanName('Yaz Kampı 2026-2027-YAZ')).toBe(false);
  });

  it('picks the newest matching draft, not last summer plan', () => {
    const picked = pickNewTermPlan([
      { id: 'summer', name: '2026 Yaz Dönemi', updated_at: '2026-08-20' },
      { id: 'old', name: 'Ders Saatleri 2026-2027', updated_at: '2026-08-01' },
      { id: 'new', name: 'Ders Saatleri Yeni Dönem Programı', updated_at: '2026-09-01' },
    ]);
    expect(picked?.id).toBe('new');
  });

  it('starts empty with academic-year dates', () => {
    const s = blankNewTermPlannerState();
    expect(s.groups).toEqual([]);
    expect(s.term.start).toBe(NEW_TERM_START);
    expect(s.term.end).toBe(NEW_TERM_END);
    expect(s.periods[0].time).toMatch(/17:00/);
  });
});
