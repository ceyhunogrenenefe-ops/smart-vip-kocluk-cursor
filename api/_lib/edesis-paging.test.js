import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Edesis list paging: totalCount > first batch length even when batch < MaxResultCount.
 * Regression: 995/1971 — second page must still be fetched.
 */
function shouldFetchNextPage({ itemsLen, batchLen, pageSize, totalCount }) {
  if (!batchLen) return false;
  if (Number.isFinite(totalCount) && itemsLen >= totalCount) return false;
  if (!Number.isFinite(totalCount) && batchLen < pageSize) return false;
  return true;
}

describe('edesis list paging', () => {
  it('continues when first page is short but totalCount says more remain', () => {
    assert.equal(
      shouldFetchNextPage({ itemsLen: 995, batchLen: 995, pageSize: 1000, totalCount: 1971 }),
      true
    );
  });

  it('stops when all rows collected', () => {
    assert.equal(
      shouldFetchNextPage({ itemsLen: 1971, batchLen: 976, pageSize: 1000, totalCount: 1971 }),
      false
    );
  });

  it('stops on empty batch', () => {
    assert.equal(
      shouldFetchNextPage({ itemsLen: 995, batchLen: 0, pageSize: 1000, totalCount: 1971 }),
      false
    );
  });
});
