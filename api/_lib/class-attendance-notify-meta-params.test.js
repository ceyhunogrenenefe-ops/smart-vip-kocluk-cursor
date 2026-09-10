import { describe, expect, it } from 'vitest';
import {
  numberedStudentNamesForMeta,
  sanitizeMetaTemplateParam
} from './class-attendance-notify.js';

describe('Meta coach report params', () => {
  it('strips newlines from template params', () => {
    expect(sanitizeMetaTemplateParam('A\nB\tC')).toBe('A · B · C');
    expect(sanitizeMetaTemplateParam('')).toBe('—');
  });

  it('formats student lists as single-line for Meta', () => {
    const s = numberedStudentNamesForMeta([
      { name: 'Ali' },
      { name: 'Veli' }
    ]);
    expect(s).toBe('1. Ali · 2. Veli');
    expect(s.includes('\n')).toBe(false);
  });
});
