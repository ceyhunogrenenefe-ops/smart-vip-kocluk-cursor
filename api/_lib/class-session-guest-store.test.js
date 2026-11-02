import assert from 'node:assert/strict';
import test from 'node:test';
import { detectGuestsForSession } from './class-session-guest-store.js';

test('detectGuestsForSession does not auto-create guests (manual only)', async () => {
  const result = await detectGuestsForSession({
    id: 'sess-1',
    class_id: 'cls-1',
    bbb_seen_names: ['Link Misafir', 'Kayıtlı Öğrenci']
  });
  assert.equal(result.ok, true);
  assert.equal(result.detected, 0);
  assert.equal(result.reason, 'manual_only');
});
