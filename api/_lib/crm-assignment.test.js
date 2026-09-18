import test from 'node:test';
import assert from 'node:assert/strict';

test('nextInRotation: sırayla döner, bilinmeyen/boş sondan sonra ilk', async () => {
  process.env.SUPABASE_URL ||= 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'x';
  const { nextInRotation } = await import('./crm-assignment.js');
  const ids = ['a', 'b', 'c', 'd'];
  assert.equal(nextInRotation(ids, null), 'a');
  assert.equal(nextInRotation(ids, 'a'), 'b');
  assert.equal(nextInRotation(ids, 'd'), 'a');
  assert.equal(nextInRotation(ids, 'silinmis'), 'a');
  assert.equal(nextInRotation([], 'a'), null);
  let last = null;
  const seq = [];
  for (let i = 0; i < 6; i += 1) seq.push((last = nextInRotation(ids, last)));
  assert.deepEqual(seq, ['a', 'b', 'c', 'd', 'a', 'b']);
});
