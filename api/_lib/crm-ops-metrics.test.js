import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFirstResponseAvgMs,
  formatFirstResponse,
  isOfferPendingLead,
  isTrialLessonLead,
  resolveOpsDateRange
} from './crm-ops-metrics.js';

test('formatFirstResponse matches Kommo-style minutes+seconds', () => {
  assert.equal(formatFirstResponse(252000), '4 dk 12 sn');
  assert.equal(formatFirstResponse(4000), '4 sn');
  assert.equal(formatFirstResponse(null), '—');
});

test('computeFirstResponseAvgMs pairs inbound then outbound per lead', () => {
  const r = computeFirstResponseAvgMs([
    { lead_id: 'a', direction: 'inbound', occurred_at: '2026-09-14T10:00:00.000Z' },
    { lead_id: 'a', direction: 'outbound', occurred_at: '2026-09-14T10:04:12.000Z' },
    { lead_id: 'b', direction: 'inbound', occurred_at: '2026-09-14T11:00:00.000Z' },
    { lead_id: 'b', direction: 'outbound', occurred_at: '2026-09-14T11:02:00.000Z' }
  ]);
  assert.equal(r.samples, 2);
  assert.equal(r.avg_ms, Math.round((252000 + 120000) / 2));
  assert.equal(formatFirstResponse(r.avg_ms), '3 dk 6 sn');
});

test('resolveOpsDateRange today and custom swap inverted bounds', () => {
  const today = resolveOpsDateRange('today');
  assert.equal(today.from, today.to);
  const custom = resolveOpsDateRange('custom', '2026-09-20', '2026-09-10');
  assert.equal(custom.from, '2026-09-10');
  assert.equal(custom.to, '2026-09-20');
});

test('trial / offer segment helpers', () => {
  assert.equal(isTrialLessonLead({ stage: 'trial_lesson_scheduled' }), true);
  assert.equal(isTrialLessonLead({ stage: 'offer_sent' }), false);
  assert.equal(isOfferPendingLead({ stage: 'offer_sent' }), true);
});
