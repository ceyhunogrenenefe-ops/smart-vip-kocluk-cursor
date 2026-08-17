import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTrPhone,
  normalizeGradeProgram,
  computeConversionRate,
  isOverdue,
  splitFullName,
  buildDuplicateKey
} from './registration-tracking-utils.js';

test('normalizeTrPhone formats Turkish numbers', () => {
  assert.equal(normalizeTrPhone('05321234567'), '05321234567');
  assert.equal(normalizeTrPhone('5321234567'), '05321234567');
  assert.equal(normalizeTrPhone('+905321234567'), '05321234567');
  assert.equal(normalizeTrPhone('90 532 123 45 67'), '05321234567');
});

test('normalizeGradeProgram maps labels and aliases', () => {
  assert.equal(normalizeGradeProgram('LGS'), 'lgs');
  assert.equal(normalizeGradeProgram('9. Sınıf'), 'grade_9');
  assert.equal(normalizeGradeProgram('YKS'), 'yks');
  assert.equal(normalizeGradeProgram('Özel Ders'), 'private_lesson');
  assert.equal(normalizeGradeProgram('lgs'), 'lgs');
});

test('computeConversionRate excludes archive imports when requested', () => {
  const leads = [
    { primary_status: 'confirmed', deleted_at: null, source: 'web' },
    { primary_status: 'lost', deleted_at: null, source: 'web' },
    { primary_status: 'tracking', deleted_at: null, source: 'web' },
    { primary_status: 'confirmed', deleted_at: null, source: 'excel_import_archive' }
  ];
  const r = computeConversionRate(leads, { excludeImported: true });
  assert.equal(r.confirmed, 1);
  assert.equal(r.denominator, 3);
  assert.equal(r.rate, 33.3);
});

test('isOverdue detects past dates', () => {
  const past = new Date(Date.now() - 86400000).toISOString();
  const future = new Date(Date.now() + 86400000).toISOString();
  assert.equal(isOverdue(past), true);
  assert.equal(isOverdue(future), false);
  assert.equal(isOverdue(null), false);
});

test('splitFullName splits student names', () => {
  assert.deepEqual(splitFullName('Ayşe Sena Tuncer'), {
    first_name: 'Ayşe Sena',
    last_name: 'Tuncer'
  });
  assert.deepEqual(splitFullName('Ali'), { first_name: 'Ali', last_name: '' });
});

test('buildDuplicateKey combines institution fields', () => {
  const key = buildDuplicateKey({
    institution_id: 'inst1',
    academic_period_key: '2025-2026',
    full_name: 'Ali Veli',
    normalized_phone: '05321234567',
    grade_program: 'lgs'
  });
  assert.ok(key.includes('inst1'));
  assert.ok(key.includes('05321234567'));
});
