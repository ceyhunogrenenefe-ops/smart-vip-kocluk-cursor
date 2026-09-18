import test from 'node:test';
import assert from 'node:assert/strict';

test('planFollowUps: gün sonrası 10:00 TR, Düşünecek 3/7/15/30', async () => {
  process.env.SUPABASE_URL ||= 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'x';
  const { planFollowUps, mergeFollowUpRules } = await import('./crm-follow-up.js');
  const now = Date.parse('2026-09-18T12:00:00+03:00');
  const rules = mergeFollowUpRules(null);
  const p = planFollowUps('considering', rules, now);
  assert.deepEqual(p.map((s) => s.due_at), [
    '2026-09-21T07:00:00.000Z',
    '2026-09-25T07:00:00.000Z',
    '2026-10-03T07:00:00.000Z',
    '2026-10-18T07:00:00.000Z'
  ]);
  const spouse = planFollowUps('spouse_discussion', rules, now);
  assert.equal(spouse.length, 1);
  assert.equal(spouse[0].due_at, '2026-09-21T07:00:00.000Z');
  assert.deepEqual(planFollowUps('new_lead', rules, now), []);
  // 0 gün ve saat geçmiş → 1 saat sonra
  const today = planFollowUps('x', { x: [{ days: 0, task_type: 'call_parent', title: 't' }] }, now);
  assert.equal(today[0].due_at, new Date(now + 3600000).toISOString());
});

test('sanitize / merge: bozuk kural atılır, boş liste planı kapatır', async () => {
  const { mergeFollowUpRules, sanitizeFollowUpRules } = await import('./crm-follow-up.js');
  const clean = sanitizeFollowUpRules({
    bilinmeyen_asama: [{ days: 2 }],
    spouse_discussion: [{ days: '5', task_type: 'hack', title: '' }, { days: -1 }, { days: 999 }]
  });
  assert.deepEqual(Object.keys(clean), ['spouse_discussion']);
  assert.deepEqual(clean.spouse_discussion, [{ days: 5, task_type: 'call_parent', title: 'Eşiyle görüşecek takibi' }]);
  const merged = mergeFollowUpRules({ considering: [] });
  assert.deepEqual(merged.considering, []);
  assert.equal(merged.spouse_discussion.length, 1);
});
