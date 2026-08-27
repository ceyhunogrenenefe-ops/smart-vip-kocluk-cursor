import { describe, expect, it } from 'vitest';
import {
  edesisGradeFromClassLevel,
  edesisTermKindFromClassLevel,
  extractClassroomLetter,
  pickCreatedEdesisId,
  pickEdesisClassroom,
  pickEdesisTerm,
  shouldAutoEnrollEdesis,
  skipEdesisAutoEnrollStudent,
  summarizeEdesisEnrollResult,
  findInTermRows
} from './edesis-auto-enroll.js';

const ROOMS = [
  { id: 104361, name: 'A', gradeName: '8', fullName: '8-A' },
  { id: 294967, name: 'A', gradeName: '8', fullName: '8-A' },
  { id: 294968, name: 'B', gradeName: '8', fullName: '8-B' },
  { id: 329887, name: 'C', gradeName: '8', fullName: '8-C' },
  { id: 294965, name: 'F', gradeName: '8', fullName: '8-F' },
  { id: 160395, name: 'LGS A SINIFI', gradeName: '8', fullName: '8-LGS A SINIFI' },
  { id: 219076, name: 'LGS A SINIFI', gradeName: '8', fullName: '8-LGS A SINIFI' },
  { id: 162820, name: 'KAYIT SİLEN', gradeName: '8', fullName: '8-KAYIT SİLEN' },
  { id: 104365, name: 'A', gradeName: '5', fullName: '5-A' },
  { id: 192156, name: 'A', gradeName: '5', fullName: '5-A' },
  { id: 185258, name: 'A', gradeName: '12', fullName: '12-A' },
  { id: 283258, name: 'A', gradeName: '12', fullName: '12-A' },
  { id: 185255, name: 'A', gradeName: '9Y', fullName: '9Y-A' },
  { id: 185252, name: 'A', gradeName: '9', fullName: '9-A' },
  { id: 283261, name: 'A', gradeName: '10Y', fullName: '10Y-A' },
  { id: 282242, name: 'A', gradeName: '10', fullName: '10-A' },
  { id: 120121, name: 'YAZ', gradeName: '8', fullName: '8-YAZ' }
];

const TERMS = [
  { id: 113, name: '2026-2027', isDefault: true },
  { id: 142, name: '2026-2027-YAZ', isDefault: false },
  { id: 40, name: '2025-2026', isDefault: false }
];

describe('edesis-auto-enroll classroom pick', () => {
  it('maps LGS / 8. sınıf to grade 8', () => {
    expect(edesisGradeFromClassLevel('LGS')).toBe('8');
    expect(edesisGradeFromClassLevel('8. Sınıf')).toBe('8');
    expect(edesisGradeFromClassLevel('5')).toBe('5');
    expect(edesisGradeFromClassLevel('TYT-Maarif')).toBe('12');
    expect(edesisGradeFromClassLevel('YKS')).toBe('12');
    expect(edesisGradeFromClassLevel('AYT')).toBe('12');
  });

  it('reads branch letter from 8C / C', () => {
    expect(extractClassroomLetter('LGS', 'C')).toBe('C');
    expect(extractClassroomLetter('8', '8C SINIFI')).toBe('C');
    expect(extractClassroomLetter('', 'B')).toBe('B');
  });

  it('does not treat LGS / TYT school names as classroom letters', () => {
    expect(extractClassroomLetter('LGS', 'Fatih Koleji')).toBe('');
    expect(extractClassroomLetter('LGS', 'Fen Lisesi')).toBe('');
    expect(extractClassroomLetter('TYT-Maarif', 'Maarif Anadolu')).toBe('');
    const room = pickEdesisClassroom(ROOMS, {
      classLevel: 'LGS',
      branch: 'Fatih Koleji',
      termKind: 'regular'
    });
    expect(room.id).toBe(294967);
  });

  it('puts LGS without branch into newest 8-A used in 2026-2027', () => {
    const room = pickEdesisClassroom(ROOMS, { classLevel: 'LGS' });
    expect(room.id).toBe(294967);
    expect(room.name).toBe('A');
  });

  it('puts 8C into newest 8-C', () => {
    const room = pickEdesisClassroom(ROOMS, { classLevel: '8', branch: 'C' });
    expect(room.id).toBe(329887);
  });

  it('puts 5. sınıf into newest 5-A and skips junk names', () => {
    const room = pickEdesisClassroom(ROOMS, { classLevel: '5' });
    expect(room.id).toBe(192156);
    expect(room.gradeName).toBe('5');
  });

  it('only auto-enrolls Online VIP Ders ve Koçluk', () => {
    expect(shouldAutoEnrollEdesis('73323d75-eea1-4552-8bba-d50555423589')).toBe(true);
    expect(shouldAutoEnrollEdesis(null)).toBe(true);
    expect(shouldAutoEnrollEdesis('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe(false);
  });

  it('puts 8. sınıf without branch into newest 8-A, not LGS-named', () => {
    const room = pickEdesisClassroom(ROOMS, { classLevel: '8. Sınıf' });
    expect(room.id).toBe(294967);
    expect(room.name).toBe('A');
  });

  it('puts TYT into newest 12-A', () => {
    const room = pickEdesisClassroom(ROOMS, { classLevel: 'TYT-Maarif' });
    expect(room.id).toBe(283258);
  });

  it('reads created student id from nested Edesis payload', () => {
    expect(pickCreatedEdesisId({ id: 7738465 })).toBe('7738465');
    expect(pickCreatedEdesisId({ result: { ogrenciId: 99 } })).toBe('99');
    expect(pickCreatedEdesisId({ item: { studentId: '12' } })).toBe('12');
    expect(pickCreatedEdesisId({ data: { id: 7 } })).toBe('7');
  });

  it('summarizes approve toast extras', () => {
    expect(summarizeEdesisEnrollResult({ skipped: true }).extra).toBe('');
    expect(
      summarizeEdesisEnrollResult({
        ok: true,
        created: true,
        edesisStudentId: '11',
        classroom: { name: '8-C' }
      }).extra
    ).toContain('Edesis kaydı açıldı: 11 (8-C)');
    expect(summarizeEdesisEnrollResult({ ok: false, error: 'timeout' }).tone).toBe('warning');
  });

  it('maps 9-11 / TYT / YKS to summer and LGS / 5-7 to regular', () => {
    expect(edesisTermKindFromClassLevel('9')).toBe('summer');
    expect(edesisTermKindFromClassLevel('11')).toBe('summer');
    expect(edesisTermKindFromClassLevel('TYT-Maarif')).toBe('summer');
    expect(edesisTermKindFromClassLevel('YKS-Sayısal')).toBe('summer');
    expect(edesisTermKindFromClassLevel('LGS')).toBe('regular');
    expect(edesisTermKindFromClassLevel('5')).toBe('regular');
    expect(edesisTermKindFromClassLevel('7')).toBe('regular');
  });

  it('picks 2026-2027 vs 2026-2027-YAZ from live-like terms', () => {
    expect(pickEdesisTerm(TERMS, 'LGS')).toEqual({ id: 113, name: '2026-2027', kind: 'regular' });
    expect(pickEdesisTerm(TERMS, '9')).toEqual({ id: 142, name: '2026-2027-YAZ', kind: 'summer' });
    expect(pickEdesisTerm(TERMS, 'TYT-Maarif').id).toBe(142);
  });

  it('puts yaz 9 into 9Y-A and skips regular 9-A', () => {
    const room = pickEdesisClassroom(ROOMS, { classLevel: '9', termKind: 'summer' });
    expect(room.id).toBe(185255);
    expect(room.gradeName).toBe('9Y');
  });

  it('does not put LGS into 8-YAZ', () => {
    const room = pickEdesisClassroom(ROOMS, { classLevel: 'LGS' });
    expect(room.name).not.toMatch(/YAZ/i);
    expect(room.id).toBe(294967);
  });

  it('skips demo / test student rows', () => {
    expect(skipEdesisAutoEnrollStudent({ email: 'cursor-setup-test@example.com', name: 'X' })).toBe(true);
    expect(skipEdesisAutoEnrollStudent({ email: 'admin@smartvip.com', name: 'Admin' })).toBe(true);
    expect(skipEdesisAutoEnrollStudent({ email: 'veli@gmail.com', name: 'Ada' })).toBe(false);
    expect(skipEdesisAutoEnrollStudent({ email: 'a@b.com', name: 'TEST TESY' })).toBe(true);
  });

  it('prefers classrooms already used in the target term', () => {
    const room = pickEdesisClassroom(ROOMS, {
      classLevel: 'LGS',
      termKind: 'regular',
      preferredIds: [294967, 329887]
    });
    expect(room.id).toBe(294967);
  });

  it('matches Edesis placeholder emails by unique name', () => {
    const rows = [
      { id: 7197508, name: 'Emir Aras Uzun', email: '2345@edesis.com' },
      { id: 7692721, name: 'BADE MERSİN', email: 'navfrn@edesis.com' },
      { id: 6781847, name: 'Serap Mira Özyanık', email: 'h.m.ozynk@qmail.com' },
      { id: 3474519, name: 'EMİRHAN ÇELİK', email: '2492@edesis.com' }
    ];
    expect(findInTermRows(rows, { name: 'Emir aras Uzun', email: 'efsunuzun90@gmail.com' })).toEqual({
      edesisStudentId: '7197508',
      matchMethod: 'name'
    });
    expect(findInTermRows(rows, { name: 'Zübeyde Bade Mersin', email: 'zubeydebademersin@gmail.com' })).toEqual({
      edesisStudentId: '7692721',
      matchMethod: 'name'
    });
    expect(findInTermRows(rows, { name: 'Serap mira Ozyanık', email: 'hasanozyanikk@gmail.com' })).toEqual({
      edesisStudentId: '6781847',
      matchMethod: 'name'
    });
    expect(findInTermRows(rows, { name: 'Emir Kökmen', email: 'x@y.com' })).toBeNull();
  });
});
