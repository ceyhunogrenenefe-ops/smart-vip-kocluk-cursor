import { describe, expect, it } from 'vitest';
import {
  gosterilenKonum,
  haftalikBirim,
  ilerlemeYuzde,
  kaynakNotuOku,
  kaynakNotuYaz
} from './kaynakIlerleme';
import type { WeeklyEntry } from '../types';

const entry = (patch: Partial<WeeklyEntry>): WeeklyEntry => ({
  id: 'e',
  studentId: 's1',
  date: '2026-10-01',
  subject: 'Türkçe',
  topic: '',
  targetQuestions: 0,
  solvedQuestions: 0,
  correctAnswers: 0,
  wrongAnswers: 0,
  blankAnswers: 0,
  createdAt: '2026-10-01'
  , ...patch
});

describe('kaynak ilerleme', () => {
  it('notu yazar ve okur', () => {
    const note = kaynakNotuYaz({ subject: 'Türkçe', unit: 'test', total: 40 });
    expect(kaynakNotuOku(note)).toEqual({ subject: 'Türkçe', unit: 'test', total: 40 });
    expect(kaynakNotuOku('düz metin')).toBeNull();
  });

  it('haftalık planda aynı kaynak adının sorularını toplar', () => {
    const n = haftalikBirim(
      { studentId: 's1', name: '8. Sınıf Paragraf Soru Bankası', subject: 'Türkçe', unit: 'test' },
      [
        entry({ bookTitle: '8. Sınıf Paragraf Soru Bankası', solvedQuestions: 12 }),
        entry({ bookTitle: 'Başka kitap', solvedQuestions: 30 }),
        entry({ studentId: 's2', bookTitle: '8. Sınıf Paragraf Soru Bankası', solvedQuestions: 9 })
      ]
    );
    expect(n).toBe(12);
  });

  it('konum elle girilen ile haftalık toplamın büyüğüdür', () => {
    expect(gosterilenKonum(20, 65)).toBe(65);
    expect(gosterilenKonum(80, 10)).toBe(80);
    expect(ilerlemeYuzde(65, 100)).toBe(65);
    expect(ilerlemeYuzde(140, 100)).toBe(100);
  });
});