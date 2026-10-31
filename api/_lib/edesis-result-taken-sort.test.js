import test from 'node:test';
import assert from 'node:assert/strict';
import {
  edesisResultTakenAtMs,
  sortEdesisResultRowsByTakenDesc
} from './edesis-client.js';

test('sortEdesisResultRowsByTakenDesc — giris zamani examDate ustun', () => {
  const rows = [
    { examId: '1', examName: 'Eski tarihli', examDate: '2026-10-24', tamamlanmaZamani: '2026-10-20T10:00:00Z' },
    { examId: '2', examName: 'Yeni girilen', examDate: '2026-10-10', tamamlanmaZamani: '2026-10-28T18:30:00Z' },
    { examId: '3', examName: 'Orta', examDate: '2026-10-16', creationTime: '2026-10-22T09:00:00Z' }
  ];
  const sorted = sortEdesisResultRowsByTakenDesc(rows);
  assert.equal(sorted[0].examId, '2');
  assert.equal(sorted[1].examId, '3');
  assert.equal(sorted[2].examId, '1');
  assert.ok(edesisResultTakenAtMs(rows[1]) > edesisResultTakenAtMs(rows[0]));
});
