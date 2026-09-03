import { describe, expect, it } from 'vitest';
import { inferTeacherIdForSubject } from './class-schedule-plan-export.js';

describe('class-schedule-plan-export teacher inference', () => {
  it('reuses ETÜT teacher from prior slots', () => {
    const hints = new Map([['Etüt', 'teacher-etut']]);
    expect(inferTeacherIdForSubject('ETÜT', hints, [])).toBe('teacher-etut');
  });

  it('falls back to first class teacher when no hint exists', () => {
    expect(inferTeacherIdForSubject('MATEMATİK', new Map(), ['teacher-a', 'teacher-b'])).toBe('teacher-a');
  });

  it('matches Din subject family', () => {
    const hints = new Map([['Din Kültürü', 'teacher-din']]);
    expect(inferTeacherIdForSubject('DİN KÜLTÜRÜ', hints, [])).toBe('teacher-din');
  });
});
