import { describe, expect, it } from 'vitest';
import { levelCandidates } from './classLevel';
import { topicPool } from '../../data/mockData';

describe('sınıf düzeyi eşlemesi', () => {
  it('LGS sınıfı 8. sınıf konularını da dener', () => {
    const out = levelCandidates('LGS');
    expect(out).toContain('LGS');
    expect(out).toContain(8);
  });

  it('8. sınıf LGS konularını da dener', () => {
    expect(levelCandidates(8)).toContain('LGS');
    expect(levelCandidates('8')).toContain('LGS');
  });

  it('diğer sınıflar kendi düzeyini kullanır', () => {
    expect(levelCandidates(7)).toEqual(expect.arrayContaining(['7', 7]));
    expect(levelCandidates('')).toEqual([]);
  });
});

describe('konu havuzu', () => {
  it('LGS için ders ve konu içerir', () => {
    const subjects = Object.keys(topicPool).filter(
      (s) => (topicPool[s]?.['LGS'] || []).length > 0
    );
    expect(subjects.length).toBeGreaterThan(0);
  });
});
