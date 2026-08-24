/**
 * coach-weekly-goals öğrenci batch erişim kuralı
 * Kanıt: handlers/coach-weekly-goals.js — öğrenci batch=1 yalnızca kendi student_id
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function studentBatchAllowed(actorStudentId, requestedIds) {
  const ownId = String(actorStudentId || '').trim();
  const requested = (requestedIds || []).map((s) => String(s || '').trim()).filter(Boolean);
  if (!ownId || !requested.length) return false;
  return requested.every((id) => id === ownId);
}

describe('coach-weekly-goals student batch gate', () => {
  const safiye = '12b61ed4-63b7-4503-acc0-444aa275aa1c';

  it('allows student batch for own id only (Safiye console case)', () => {
    assert.equal(studentBatchAllowed(safiye, [safiye]), true);
  });

  it('forbids empty or foreign student ids', () => {
    assert.equal(studentBatchAllowed(safiye, []), false);
    assert.equal(studentBatchAllowed(safiye, ['other-id']), false);
    assert.equal(studentBatchAllowed(safiye, [safiye, 'other-id']), false);
    assert.equal(studentBatchAllowed('', [safiye]), false);
  });
});
