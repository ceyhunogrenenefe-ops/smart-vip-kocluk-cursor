import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canReadPrograms,
  canWritePrograms,
  normalizeProgramName,
  validateProgramName,
  checkMembershipTarget
} from './edu-programs.js';

describe('eğitim programı yetkileri', () => {
  it('yönetici ve süper admin yazabilir, koç yalnız okur', () => {
    assert.equal(canWritePrograms('admin'), true);
    assert.equal(canWritePrograms('super_admin'), true);
    assert.equal(canWritePrograms('coach', ['admin']), true);
    assert.equal(canWritePrograms('coach'), false);
    assert.equal(canReadPrograms('coach'), true);
  });
  it('öğretmen ve öğrenci programlara erişemez', () => {
    assert.equal(canReadPrograms('teacher'), false);
    assert.equal(canReadPrograms('student'), false);
    assert.equal(canWritePrograms('teacher'), false);
  });
});

describe('program adı', () => {
  it('boşlukları toparlar ve boş adı reddeder', () => {
    assert.equal(normalizeProgramName('  Yaz   Okulu '), 'Yaz Okulu');
    assert.ok(validateProgramName(''));
    assert.equal(validateProgramName('Deneme Kulübü'), null);
    assert.ok(validateProgramName('x'.repeat(81)));
  });
});

describe('öğrenciyi başka programın grubuna ekleme', () => {
  const student = { id: 's1', institution_id: 'i1', deleted_at: null };
  it('aynı kurum ve aktif programda izin verir', () => {
    assert.equal(
      checkMembershipTarget({ cls: { id: 'c1', institution_id: 'i1' }, student, program: { is_active: true } }),
      null
    );
  });
  it('farklı kurum, pasif program ve silinmiş öğrenciyi reddeder', () => {
    assert.equal(checkMembershipTarget({ cls: { institution_id: 'i2' }, student, program: null }).status, 400);
    assert.equal(
      checkMembershipTarget({ cls: { institution_id: 'i1' }, student, program: { is_active: false } }).status,
      400
    );
    assert.equal(
      checkMembershipTarget({ cls: { institution_id: 'i1' }, student: { ...student, deleted_at: 'x' }, program: null }).status,
      404
    );
    assert.equal(checkMembershipTarget({ cls: null, student, program: null }).status, 404);
  });
});
