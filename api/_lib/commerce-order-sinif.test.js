import { describe, expect, it } from 'vitest';
import {
  classNumbersInText,
  extractSinifFromNotes,
  inferSinifFromTitles,
  isMultiClassBook,
  normalizeOrderSinif,
  resolveOrderSinif,
  withSinifTag,
} from './commerce-order-sinif.js';

describe('commerce-order-sinif', () => {
  it('normalizes class inputs', () => {
    expect(normalizeOrderSinif('6')).toBe('6');
    expect(normalizeOrderSinif('6. Sınıf')).toBe('6');
    expect(normalizeOrderSinif('9.SINIF')).toBe('9');
    expect(normalizeOrderSinif('lgs')).toBe('LGS');
    expect(normalizeOrderSinif('mezun')).toBe('Mezun');
    expect(normalizeOrderSinif('abc')).toBe('');
  });

  it('reads all classes from multi-class titles', () => {
    expect(classNumbersInText('5-6-7.SINIF DENEME KULÜBÜ 2O Lİ DENEME PAKETİ')).toEqual(['5', '6', '7']);
    expect(classNumbersInText('Online VIP Dershane – 9. ve 10. Sınıf Kurumsal Deneme Kulübü Paketi')).toEqual(['9', '10']);
    expect(classNumbersInText('7.SINIF İNGİLİZCE DERS KİTABI')).toEqual(['7']);
  });

  it('never guesses a single class from a multi-class title (the 6→7, 9→10 bug)', () => {
    expect(inferSinifFromTitles(['5-6-7.SINIF DENEME KULÜBÜ 2O Lİ DENEME PAKETİ'])).toEqual({
      level: '',
      ambiguous: ['5', '6', '7'],
    });
    const r = resolveOrderSinif({ titles: ['Online VIP Dershane – 9. ve 10. Sınıf Kurumsal Deneme Kulübü Paketi'] });
    expect(r.level).toBe('');
    expect(r.source).toBe('ambiguous');
    expect(r.label).toContain('9-10');
  });

  it('buyer choice wins over everything', () => {
    const notes = withSinifTag('IBAN havale · dekont yüklendi', '6');
    expect(notes).toBe('IBAN havale · dekont yüklendi · Sınıf: 6. Sınıf');
    expect(extractSinifFromNotes(notes)).toBe('6');
    const r = resolveOrderSinif({
      notes,
      studentClassLevel: '7',
      titles: ['5-6-7.SINIF DENEME KULÜBÜ 2O Lİ DENEME PAKETİ'],
    });
    expect(r).toEqual({ label: '6. Sınıf', level: '6', source: 'buyer' });
  });

  it('replaces an existing tag instead of duplicating', () => {
    expect(withSinifTag('Not · Sınıf: 7. Sınıf', '9')).toBe('Not · Sınıf: 9. Sınıf');
    expect(withSinifTag(null, '')).toBe(null);
  });

  it('falls back to student card, then package, then single-class title', () => {
    expect(resolveOrderSinif({ studentClassLevel: '9', titles: ['9. ve 10. Sınıf Paketi'] }).label).toBe('9. Sınıf');
    expect(resolveOrderSinif({ packageClassLevel: '10', titles: ['x'] }).label).toBe('10. Sınıf');
    expect(resolveOrderSinif({ titles: ['7.SINIF İNGİLİZCE DERS KİTABI'] }).label).toBe('7. Sınıf');
  });

  it('detects multi-class books', () => {
    expect(isMultiClassBook(['5', '6', '7'])).toBe(true);
    expect(isMultiClassBook(['10', '9'])).toBe(true);
    expect(isMultiClassBook(['8', 'LGS'])).toBe(false);
  });
});
