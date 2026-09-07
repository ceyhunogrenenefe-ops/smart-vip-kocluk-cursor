import { describe, expect, it } from 'vitest';
import {
  CLEAR_SCHEDULE_CLASS_KEYS,
  canonicalizeClearClassKey,
  matchClearTargetClass
} from './clear-group-class-targets.js';

describe('clear-group-class-targets', () => {
  it('lists the requested live group class keys', () => {
    expect(CLEAR_SCHEDULE_CLASS_KEYS).toEqual(['5A', '6A', '6B', '7A', '8A', '8B', '8E', '8F']);
  });

  it('canonicalizes common class name variants', () => {
    expect(canonicalizeClearClassKey('5-A')).toBe('5A');
    expect(canonicalizeClearClassKey('5A YAZ KAMPI')).toBe('5A');
    expect(canonicalizeClearClassKey('2026-2027 6 B SINIFI')).toBe('6B');
    expect(canonicalizeClearClassKey('8-F')).toBe('8F');
  });

  it('matches classes without colliding on wrong levels', () => {
    const classes = [
      { id: '1', name: '5A' },
      { id: '2', name: '6-A YAZ KAMPI' },
      { id: '3', name: '15A' },
      { id: '4', name: '8E' }
    ];
    expect(matchClearTargetClass(classes, '5A')?.id).toBe('1');
    expect(matchClearTargetClass(classes, '6A')?.id).toBe('2');
    expect(matchClearTargetClass(classes, '8E')?.id).toBe('4');
    // 15A should not satisfy 5A via canonicalize (leading 15)
    expect(canonicalizeClearClassKey('15A')).not.toBe('5A');
  });
});
