import test from 'node:test';
import assert from 'node:assert/strict';
import { examDateInSeason, filterExamsToSeason, currentSeason } from './academic-season.js';

test('2026-2027 sezonu yaz kampıyla başlar', () => {
  assert.equal(currentSeason().start, '2026-07-01');
  assert.equal(currentSeason().label, '2026-2027');
  assert.equal(examDateInSeason('2026-06-14'), false);
  assert.equal(examDateInSeason('2026-07-05'), true);
  assert.equal(examDateInSeason('2026-10-24T10:00:00Z'), true);
  assert.equal(examDateInSeason(''), true, 'tarihsiz sonuç gizlenmez');
});

test('liste süzülür, gizlenen sayılır, all hepsini döner', () => {
  const exams = [{ examDate: '2025-12-01' }, { examDate: '2026-09-12' }, { date: '2026-07-11' }];
  const r = filterExamsToSeason(exams);
  assert.equal(r.items.length, 2);
  assert.equal(r.hiddenCount, 1);
  assert.equal(filterExamsToSeason(exams, { all: true }).items.length, 3);
});
