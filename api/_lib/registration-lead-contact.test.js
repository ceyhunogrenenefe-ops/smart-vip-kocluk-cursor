import test from 'node:test';
import assert from 'node:assert/strict';

test('isContactUpdate: yalnız atama/planlama iletişim sayılmaz', async () => {
  process.env.SUPABASE_URL ||= 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'x';
  const { isContactUpdate } = await import('./registration-lead-contact.js');
  assert.equal(isContactUpdate({ assigned_user_id: true }), false);
  assert.equal(isContactUpdate({ next_action_at: true, next_action_type: true }), false);
  assert.equal(isContactUpdate({}), false);
  assert.equal(isContactUpdate({ notes: true }), true);
  assert.equal(isContactUpdate({ stage: true, assigned_user_id: true }), true);
  assert.equal(isContactUpdate({ grade_program: true }), true);
});
