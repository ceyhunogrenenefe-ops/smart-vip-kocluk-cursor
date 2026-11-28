import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeSyncedExamsById } from './edesis-exam-assignments.js';

describe('dedupeSyncedExamsById', () => {
  it('kurum ve kurumsuz kopyadan en son senkronlananı tutar, sırayı korur', () => {
    const rows = [
      { id: 'a', edesis_exam_id: '1745272', institution_id: 'inst', synced_at: '2026-11-21T10:16:51Z' },
      { id: 'x', edesis_exam_id: '1770629', institution_id: null, synced_at: '2026-11-23T16:01:07Z' },
      { id: 'b', edesis_exam_id: '1745272', institution_id: null, synced_at: '2026-11-23T16:01:07Z' }
    ];
    const out = dedupeSyncedExamsById(rows);
    assert.deepEqual(out.map((r) => r.id), ['b', 'x']);
  });

  it('kimliksiz satırları atar', () => {
    assert.deepEqual(dedupeSyncedExamsById([{ id: 'z', edesis_exam_id: '' }]), []);
  });
});
