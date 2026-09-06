import { describe, expect, it } from 'vitest';
import {
  compactClassKey,
  extractGradeBranchKey,
  pickClassForPlannerGroup,
} from './plannerClassMatch.ts';

describe('plannerClassMatch', () => {
  const rows = [
    { id: '1', name: '8-A' },
    { id: '2', name: '8-B LGS' },
    { id: '3', name: '8C' },
    { id: '4', name: '8-F' },
    { id: '5', name: '9A' },
  ];

  it('matches 8F to 8-F', () => {
    expect(compactClassKey('8-F')).toBe('8f');
    expect(extractGradeBranchKey('8-F')).toBe('8f');
    expect(pickClassForPlannerGroup('8F', rows)?.id).toBe('4');
    expect(pickClassForPlannerGroup('8-F', rows)?.name).toBe('8-F');
  });

  it('matches 8A / 8B / 8C variants', () => {
    expect(pickClassForPlannerGroup('8A', rows)?.name).toBe('8-A');
    expect(pickClassForPlannerGroup('8B', rows)?.id).toBe('2');
    expect(pickClassForPlannerGroup('8C', rows)?.name).toBe('8C');
  });
});
