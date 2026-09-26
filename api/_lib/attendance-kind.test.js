import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAttendanceKind } from './attendance-kind.js';

test('etüt oturumları ayrılır', () => {
  for (const s of ['ETÜT', 'Etüt', 'etut', 'MATEMATİK ETÜT', '9. Sınıf Etüdü']) {
    assert.equal(classifyAttendanceKind(s), 'etut', s);
  }
});

test('deneme oturumları ayrılır', () => {
  assert.equal(classifyAttendanceKind('DENEME SINAVI'), 'deneme');
  assert.equal(classifyAttendanceKind('TYT Deneme'), 'deneme');
});

test('deneme analizi ders sayılır — anlatım dersidir', () => {
  assert.equal(classifyAttendanceKind('Deneme Analizi'), 'lesson');
  assert.equal(classifyAttendanceKind('ETÜT ANALİZ'), 'lesson');
});

test('normal dersler ders kalır', () => {
  for (const s of ['MATEMATİK', 'TÜRKÇE', 'Fen Bilimleri', '', null]) {
    assert.equal(classifyAttendanceKind(s), 'lesson', String(s));
  }
});
