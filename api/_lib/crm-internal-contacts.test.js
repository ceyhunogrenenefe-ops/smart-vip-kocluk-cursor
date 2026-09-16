import test from 'node:test';
import assert from 'node:assert/strict';

test('phoneKey: önekten bağımsız son 10 hane', async () => {
  process.env.SUPABASE_URL ||= 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'x';
  const { phoneKey, internalMarkFields } = await import('./crm-internal-contacts.js');
  assert.equal(phoneKey('+90 532 111 22 33'), '5321112233');
  assert.equal(phoneKey('05321112233'), '5321112233');
  assert.equal(phoneKey('905321112233'), '5321112233');
  assert.equal(phoneKey('12345'), '');
  assert.equal(phoneKey(null), '');
  assert.equal(internalMarkFields(false, { actorId: 'u1' }).internal_reason, 'manual_unmarked');
  assert.equal(internalMarkFields(true, { reason: 'student_phone' }).is_internal, true);
});
