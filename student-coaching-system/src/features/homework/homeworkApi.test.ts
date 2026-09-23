import { describe, expect, it } from 'vitest';
import { COACHING_INSTITUTION_ID, homeworkModuleBlocked } from './homeworkApi';
import { PLATFORM_PRIMARY_INSTITUTION_ID } from '../../lib/activeInstitutionScope';

describe('ödev modülü kurum kuralı', () => {
  it('platform kurumunda kapalı', () => {
    expect(homeworkModuleBlocked(PLATFORM_PRIMARY_INSTITUTION_ID)).toBe(true);
  });

  it('Ders & Koçluk kurumunda kapalı', () => {
    expect(homeworkModuleBlocked(COACHING_INSTITUTION_ID)).toBe(true);
  });

  it('kurum bilinmiyorsa kapalı', () => {
    expect(homeworkModuleBlocked('')).toBe(true);
    expect(homeworkModuleBlocked(null)).toBe(true);
    expect(homeworkModuleBlocked(undefined)).toBe(true);
  });

  it('TÜRKÇE UZMANI gibi kurumlarda açılabilir', () => {
    expect(homeworkModuleBlocked('f222d8bb-4d46-40b4-b78b-d7c1f1964af7')).toBe(false);
  });
});
