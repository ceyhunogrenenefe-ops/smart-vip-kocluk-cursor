import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  INACTIVE_ENROLLMENT_STATUSES,
  phoneKey,
  studentRowIsInactive
} from './student-messaging-mute.js';

describe('pasif öğrenci tespiti', () => {
  it('withdrawn pasiftir', () => {
    assert.equal(studentRowIsInactive({ enrollment_status: 'withdrawn' }), true);
    assert.equal(studentRowIsInactive({ enrollment_status: 'WITHDRAWN' }), true);
  });

  it('deleted_at doluysa pasiftir', () => {
    assert.equal(studentRowIsInactive({ enrollment_status: 'confirmed', deleted_at: '2026-09-01' }), true);
  });

  it('confirmed ve trial aktiftir', () => {
    assert.equal(studentRowIsInactive({ enrollment_status: 'confirmed' }), false);
    assert.equal(studentRowIsInactive({ enrollment_status: 'trial' }), false);
    assert.equal(studentRowIsInactive({ enrollment_status: 'confirmed', deleted_at: null }), false);
  });

  it('diğer pasif adlandırmaları da sayılır', () => {
    for (const st of ['cancelled', 'inactive', 'passive', 'archived', 'frozen']) {
      assert.equal(studentRowIsInactive({ enrollment_status: st }), true, st);
      assert.equal(INACTIVE_ENROLLMENT_STATUSES.has(st), true, st);
    }
  });

  it('boş satır aktif sayılmaz da pasif de sayılmaz', () => {
    assert.equal(studentRowIsInactive(null), false);
    assert.equal(studentRowIsInactive({}), false);
  });
});

describe('numara anahtarı', () => {
  it('aynı numaranın farklı yazımları aynı anahtara düşer', () => {
    const a = phoneKey('0506 187 74 94');
    const b = phoneKey('+905061877494');
    const c = phoneKey('905061877494');
    assert.ok(a);
    assert.equal(a, b);
    assert.equal(b, c);
  });

  it('geçersiz / kısa numara anahtar üretmez', () => {
    assert.equal(phoneKey(''), '');
    assert.equal(phoneKey('123'), '');
    assert.equal(phoneKey(null), '');
  });

  it('farklı numaralar farklı anahtar', () => {
    assert.notEqual(phoneKey('05061877494'), phoneKey('05061877495'));
  });
});
