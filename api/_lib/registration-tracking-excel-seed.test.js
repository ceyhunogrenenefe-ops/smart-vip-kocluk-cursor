import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXCEL_CONFIRMED,
  EXCEL_TRACKING,
  uniqueExcelRows,
  excelLeadKey
} from './registration-tracking-excel-seed.js';

test('excel board has expected column counts', () => {
  assert.equal(EXCEL_CONFIRMED.filter((r) => r.grade === 'grade_9').length, 2);
  assert.equal(EXCEL_CONFIRMED.filter((r) => r.grade === 'grade_10').length, 10);
  assert.equal(EXCEL_CONFIRMED.filter((r) => r.grade === 'grade_11').length, 15);
  assert.equal(EXCEL_CONFIRMED.filter((r) => r.grade === 'yks').length, 14);
  assert.equal(EXCEL_CONFIRMED.filter((r) => r.grade === 'yos').length, 11);
  assert.equal(EXCEL_CONFIRMED.filter((r) => r.grade === 'private_lesson').length, 1);

  assert.equal(EXCEL_TRACKING.filter((r) => r.grade === 'grade_9').length, 3);
  assert.equal(EXCEL_TRACKING.filter((r) => r.grade === 'grade_10').length, 4);
  assert.equal(EXCEL_TRACKING.filter((r) => r.grade === 'grade_11').length, 7);
  assert.equal(EXCEL_TRACKING.filter((r) => r.grade === 'yks').length, 2);
  assert.equal(EXCEL_TRACKING.filter((r) => r.grade === 'private_lesson').length, 3);
});

test('same student is not in both KESİN KAYIT and TAKİP for the same program', () => {
  const { confirmed, tracking } = uniqueExcelRows();
  const keys = new Set(confirmed.map((r) => excelLeadKey(r.name, r.grade)));
  for (const r of tracking) {
    assert.equal(keys.has(excelLeadKey(r.name, r.grade)), false);
  }
  assert.equal(
    tracking.some((r) => excelLeadKey(r.name, r.grade) === excelLeadKey('BURÇİN BAYRAK', 'yks')),
    false
  );
  assert.equal(
    tracking.some((r) => excelLeadKey(r.name, r.grade) === excelLeadKey('AYÇA ÇETİNER', 'private_lesson')),
    false
  );
  assert.equal(tracking.length, EXCEL_TRACKING.length - 2);
});
