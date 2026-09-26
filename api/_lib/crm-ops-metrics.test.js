import test from 'node:test';
import assert from 'node:assert/strict';
import {
  summarizeLeadSourceFunnel,
  computeFirstResponseAvgMs,
  formatFirstResponse,
  isOfferPendingLead,
  isTrialLessonLead,
  resolveOpsDateRange,
  classifyLeadSource,
  summarizeLeadSources
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

test('classifyLeadSource buckets website / instagram / whatsapp', () => {
  assert.equal(classifyLeadSource({ last_inbound_channel: 'website', source: 'website_form_ad' }), 'website');
  assert.equal(classifyLeadSource({ last_inbound_channel: 'instagram', source: 'instagram_inbound' }), 'instagram');
  assert.equal(classifyLeadSource({ last_inbound_channel: 'whatsapp', source: 'whatsapp_inbound' }), 'whatsapp');
  assert.equal(classifyLeadSource({ source: 'website_form' }), 'website');
  const rows = summarizeLeadSources([
    { last_inbound_channel: 'website' },
    { last_inbound_channel: 'website' },
    { last_inbound_channel: 'instagram' }
  ]);
  const web = rows.find((r) => r.id === 'website');
  const ig = rows.find((r) => r.id === 'instagram');
  assert.equal(web.count, 2);
  assert.equal(ig.count, 1);
  assert.equal(web.pct, 66.7);
});

test('filterBulkAudience: sınıf + pipeline sütunu ve sayaçlar', async () => {
  const { filterBulkAudience, bulkColumnIdForLead } = await import('./crm-ops-metrics.js');
  const leads = [
    { id: 'a', stage: 'trial_lesson_scheduled', grade_program: 'grade_11', primary_status: 'tracking' },
    { id: 'b', stage: 'trial_lesson_completed', grade_program: 'yks', primary_status: 'tracking' },
    { id: 'c', stage: 'new_lead', grade_program: 'grade_11', primary_status: 'tracking' },
    { id: 'd', stage: 'confirmed', grade_program: 'grade_11', primary_status: 'confirmed' },
    { id: 'e', stage: 'lost', grade_program: null, primary_status: 'lost' }
  ];
  assert.equal(bulkColumnIdForLead(leads[3]), 'confirmed');

  // Varsayılan: yalnız açık (takipteki) lead'ler
  const def = filterBulkAudience(leads, {});
  assert.deepEqual(def.items.map((l) => l.id), ['a', 'b', 'c']);

  // 11. sınıf + deneme dersi
  const r = filterBulkAudience(leads, { grades: 'grade_11', columns: 'trial' });
  assert.deepEqual(r.items.map((l) => l.id), ['a']);
  assert.equal(r.facets.columns.trial, 1);
  assert.equal(r.facets.columns.incoming, 1);
  assert.equal(r.facets.columns.confirmed, 1);
  assert.equal(r.facets.grades.grade_11, 1);
  assert.equal(r.facets.grades.yks, 1);

  // Birden fazla sınıf, kesin kayıtlılar
  const k = filterBulkAudience(leads, { grades: ['grade_11', 'unspecified'], columns: 'confirmed,lost' });
  assert.deepEqual(k.items.map((l) => l.id), ['d', 'e']);

  // Eski segment parametresi hâlâ çalışır
  const legacy = filterBulkAudience(leads, { segment: 'trial_no_show' });
  assert.deepEqual(legacy.items.map((l) => l.id), ['a']);
});

test('kanal kırılımı geleni ve dönüleni ayrı sayar', () => {
  const leads = [
    { last_inbound_channel: 'instagram', last_contact_at: null, first_contact_at: null },
    { last_inbound_channel: 'instagram', last_contact_at: null, first_contact_at: null },
    { last_inbound_channel: 'instagram', last_contact_at: '2026-09-25T10:00:00Z' },
    { last_inbound_channel: 'whatsapp', first_contact_at: '2026-09-25T11:00:00Z' }
  ];
  const rows = summarizeLeadSourceFunnel(leads);
  const ig = rows.find((r) => r.id === 'instagram');
  const wa = rows.find((r) => r.id === 'whatsapp');
  assert.equal(ig.count, 3, 'Instagram 3 başvuru');
  assert.equal(ig.responded, 1, 'biri dönülmüş');
  assert.equal(ig.pending, 2, 'ikisi bekliyor');
  assert.equal(wa.count, 1);
  assert.equal(wa.responded, 1);
  assert.equal(wa.pending, 0);
});

test('hiç dönülmeyen kanal sıfır dönülen gösterir, gelen kaybolmaz', () => {
  const rows = summarizeLeadSourceFunnel([
    { last_inbound_channel: 'instagram' },
    { last_inbound_channel: 'instagram' }
  ]);
  const ig = rows.find((r) => r.id === 'instagram');
  assert.equal(ig.count, 2);
  assert.equal(ig.responded, 0);
  assert.equal(ig.responded_pct, 0);
});

test('boş liste tüm kanalları sıfırla döndürür', () => {
  const rows = summarizeLeadSourceFunnel([]);
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => r.count === 0 && r.responded === 0));
});
