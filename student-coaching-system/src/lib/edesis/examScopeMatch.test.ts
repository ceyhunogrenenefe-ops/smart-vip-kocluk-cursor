import { describe, it, expect } from 'vitest';
import { examMatchesStudentScope, examProgramGroup, studentProgramGroup } from './examScopeMatch';

const yks = { classLevel: '11', gradeName: '11. Sınıf', programKeys: ['tyt', 'ayt'] };
const lgs = { classLevel: 'LGS', gradeName: '8. Sınıf', programKeys: ['lgs'] };

describe('öğrenci programı', () => {
  it('lise ve LGS ayrılır', () => {
    expect(studentProgramGroup(yks)).toBe('lise');
    expect(studentProgramGroup(lgs)).toBe('lgs');
    expect(studentProgramGroup({ classLevel: '6' })).toBe('ortaokul');
    expect(studentProgramGroup({})).toBeNull();
  });
});

describe('deneme programı', () => {
  it('ad ve türden çıkarılır', () => {
    expect(examProgramGroup({ name: 'ÖZDEBİR İLK PROVA TYT', examType: 'TYT' })).toBe('lise');
    expect(examProgramGroup({ name: '11 SINIF PARAF MAARİF MODEL TYT-1', examType: null })).toBe('lise');
    expect(examProgramGroup({ name: 'ADAY LGS-2 Müfredat İzleme', examType: 'LGS' })).toBe('lgs');
    expect(examProgramGroup({ name: '7. Sınıf Deneme', examType: null })).toBe('ortaokul');
    expect(examProgramGroup({ name: 'Genel Deneme', examType: null })).toBeNull();
  });
});

describe('eşleşme', () => {
  it('YKS öğrencisinde TYT/AYT kalır, LGS elenir', () => {
    expect(examMatchesStudentScope({ name: 'ÖZDEBİR İLK PROVA TYT', examType: 'TYT' }, yks)).toBe(true);
    expect(examMatchesStudentScope({ name: 'ÜÇDÖRTBEŞ AYT', examType: 'AYT' }, yks)).toBe(true);
    expect(examMatchesStudentScope({ name: 'ADAY LGS-2', examType: 'LGS' }, yks)).toBe(false);
    expect(examMatchesStudentScope({ name: '7. Sınıf Deneme' }, yks)).toBe(false);
  });

  it('LGS öğrencisinde LGS kalır, TYT elenir', () => {
    expect(examMatchesStudentScope({ name: 'YANIT LGS-3', examType: 'LGS' }, lgs)).toBe(true);
    expect(examMatchesStudentScope({ name: 'ÖZDEBİR TYT-7', examType: 'TYT' }, lgs)).toBe(false);
  });

  it('bilinmeyen durumlarda gizlemez', () => {
    expect(examMatchesStudentScope({ name: 'Genel Deneme' }, yks)).toBe(true);
    expect(examMatchesStudentScope({ name: 'ÖZDEBİR TYT' }, {})).toBe(true);
  });
});
