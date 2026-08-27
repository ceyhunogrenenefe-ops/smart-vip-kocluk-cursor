import { describe, expect, it } from 'vitest';
import {
  edesisGradeFromClassLevel,
  extractClassroomLetter,
  pickCreatedEdesisId,
  pickEdesisClassroom,
  shouldAutoEnrollEdesis,
  summarizeEdesisEnrollResult
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
  { id: 283258, name: 'A', gradeName: '12', fullName: '12-A' }
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

  it('puts LGS without branch into newest LGS-named classroom', () => {
    const room = pickEdesisClassroom(ROOMS, { classLevel: 'LGS' });
    expect(room.id).toBe(219076);
    expect(room.name).toMatch(/LGS/i);
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
});
