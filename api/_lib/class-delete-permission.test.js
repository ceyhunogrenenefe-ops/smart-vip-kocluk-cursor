import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canDeleteClass } from '../../handlers/class-live-lessons.js';

describe('grup sınıfı silme yetkisi', () => {
  it('admin ve süper admin silebilir', () => {
    assert.equal(canDeleteClass('admin'), true);
    assert.equal(canDeleteClass('super_admin'), true);
    assert.equal(canDeleteClass('teacher', ['admin']), true);
    assert.equal(canDeleteClass('coach', ['super_admin']), true);
  });

  it('koç silemez — 11 B sınıfı böyle silinmişti', () => {
    assert.equal(canDeleteClass('coach'), false);
    assert.equal(canDeleteClass('coach', ['coach']), false);
    assert.equal(canDeleteClass('coach', ['teacher', 'coach']), false);
  });

  it('öğretmen ve öğrenci silemez', () => {
    assert.equal(canDeleteClass('teacher'), false);
    assert.equal(canDeleteClass('teacher', ['teacher']), false);
    assert.equal(canDeleteClass('student'), false);
    assert.equal(canDeleteClass(''), false);
    assert.equal(canDeleteClass(undefined, undefined), false);
  });
});
