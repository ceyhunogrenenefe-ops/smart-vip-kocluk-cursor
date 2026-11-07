import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEdesisCatalogExamIdSet } from './edesis-client.js';
import { filterExamItemsToLiveEdesisCatalog } from './edesis-exam-assignments.js';

describe('buildEdesisCatalogExamIdSet', () => {
  it('collects exam ids from catalog rows', () => {
    const set = buildEdesisCatalogExamIdSet([{ id: '101' }, { examId: '202' }]);
    assert.deepEqual([...set].sort(), ['101', '202']);
  });
});

describe('filterExamItemsToLiveEdesisCatalog', () => {
  it('drops items whose examId is not in live set', () => {
    const live = new Set(['1', '3']);
    const out = filterExamItemsToLiveEdesisCatalog(
      [
        { examId: '1', name: 'A' },
        { examId: '2', name: 'deleted' },
        { examId: '3', name: 'C' }
      ],
      live
    );
    assert.deepEqual(out.map((x) => x.examId), ['1', '3']);
  });
});
