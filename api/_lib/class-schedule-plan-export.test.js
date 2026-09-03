import { describe, expect, it } from 'vitest';
import {
  inferTeacherIdForSubject,
  isTeacherOptionalSubject,
} from './class-schedule-plan-export.js';

describe('class-schedule-plan-export teacher optional subjects', () => {
  it('marks ETÜT / Deneme / Deneme Analizi as teacher-optional', () => {
    expect(isTeacherOptionalSubject('ETÜT')).toBe(true);
    expect(isTeacherOptionalSubject('Etüt')).toBe(true);
    expect(isTeacherOptionalSubject('DENEME')).toBe(true);
    expect(isTeacherOptionalSubject('DENEME SINAVI')).toBe(true);
    expect(isTeacherOptionalSubject('Deneme Analizi')).toBe(true);
    expect(isTeacherOptionalSubject('DENEME ANALİZİ')).toBe(true);
    expect(isTeacherOptionalSubject('MATEMATİK')).toBe(false);
  });

  it('does not force-assign a teacher for optional subjects', () => {
    const hints = new Map([['Etüt', 'teacher-etut'], ['Deneme', 'teacher-deneme']]);
    expect(inferTeacherIdForSubject('ETÜT', hints, ['teacher-a'])).toBeNull();
    expect(inferTeacherIdForSubject('Deneme Analizi', hints, ['teacher-a'])).toBeNull();
  });

  it('still infers teachers for normal subjects', () => {
    const hints = new Map([['Matematik', 'teacher-math']]);
    expect(inferTeacherIdForSubject('MATEMATİK', hints, [])).toBe('teacher-math');
    expect(inferTeacherIdForSubject('Fizik', new Map(), ['teacher-a', 'teacher-b'])).toBe('teacher-a');
  });
});
