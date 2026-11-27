import test from 'node:test';
import assert from 'node:assert/strict';
import { nextDeliveryStatus, summarizeCampaignMessages } from './crm-delivery-status.js';
import { computeCrmDailyReport, formatCrmDailyReportText } from './crm-daily-report.js';

test('nextDeliveryStatus yalnız ileri taşır, failed son sözdür', () => {
  assert.equal(nextDeliveryStatus('accepted', 'sent'), 'sent');
  assert.equal(nextDeliveryStatus('sent', 'delivered'), 'delivered');
  assert.equal(nextDeliveryStatus('read', 'delivered'), null);
  assert.equal(nextDeliveryStatus('delivered', 'sent'), null);
  assert.equal(nextDeliveryStatus('delivered', 'failed'), 'failed');
  assert.equal(nextDeliveryStatus('failed', 'sent'), null);
  assert.equal(nextDeliveryStatus('failed', 'read'), 'read');
  assert.equal(nextDeliveryStatus(null, 'bogus'), null);
});

test('summarizeCampaignMessages: ulaştı / beklemede / hatalı', () => {
  const s = summarizeCampaignMessages(
    [
      { delivery_status: 'read', payload: { send: { ok: true } } },
      { delivery_status: 'delivered', payload: { send: { ok: true } } },
      { delivery_status: 'sent', payload: { send: { ok: true } } },
      { delivery_status: 'accepted', payload: { send: { ok: true } } },
      { delivery_status: 'failed', payload: { send: { ok: true } } },
      { delivery_status: 'send_failed', payload: { send: { ok: false } } }
    ],
    8
  );
  assert.deepEqual(s, { planned: 8, attempted: 6, accepted: 5, delivered: 2, read: 1, failed: 2, pending: 2 });
});

test('computeCrmDailyReport + metin', async () => {
  process.env.SUPABASE_URL ||= 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'x';
  const { computeCrmDailyReport, formatCrmDailyReportText, reportHasActivity } = await import('./crm-daily-report.js');
  const D = '2026-09-16';
  const at = (h) => `${D}T${String(h).padStart(2, '0')}:00:00+03:00`;
  const p = computeCrmDailyReport({
    date: D,
    institutionName: 'Online VIP',
    users: [{ id: 'u1', name: 'Ayşe' }, { id: 'u2', name: 'Mehmet' }],
    leads: [
      { id: 'l1', source: 'whatsapp_inbound', last_inbound_channel: 'whatsapp', created_at: at(10), primary_status: 'tracking', stage: 'new_lead' },
      { id: 'l2', source: 'instagram_inbound', last_inbound_channel: 'instagram', created_at: at(11), primary_status: 'tracking', stage: 'trial_lesson_scheduled' },
      { id: 'l3', source: 'website_form', created_at: at(12), primary_status: 'confirmed', stage: 'confirmed' },
      { id: 'l4', source: 'whatsapp_inbound', created_at: '2026-09-15T10:00:00+03:00', primary_status: 'tracking', stage: 'new_lead' }
    ],
    inboundMessages: [
      { channel: 'whatsapp', occurred_at: at(10) },
      { channel: 'instagram', occurred_at: at(11) },
      { channel: 'whatsapp', occurred_at: '2026-09-17T01:00:00+03:00' }
    ],
    outboundLeadMessages: [
      { id: 'm1', lead_id: 'l1', occurred_at: at(13), payload: { actor_user_id: 'u1' } },
      { id: 'm2', lead_id: 'l1', occurred_at: at(14), payload: { actor_user_id: 'u1' } },
      { id: 'm3', lead_id: 'l2', occurred_at: at(14), payload: { actor_user_id: 'u1' }, campaign_id: 'c1' }
    ],
    inboxAgentMessages: [{ id: 'i1', conversation_id: 'cv1', lead_id: 'l2', sender_id: 'u2', created_at: at(15) }],
    interactions: [
      { lead_id: 'l1', title: 'Giden WhatsApp', created_by: 'u1', interaction_at: at(13) },
      { lead_id: 'l3', title: 'Veli arandı', created_by: 'u2', interaction_at: at(16) }
    ],
    stageHistory: [
      { lead_id: 'l2', new_stage: 'trial_lesson_scheduled', new_primary_status: 'tracking', changed_by: 'u1', changed_at: at(12) },
      { lead_id: 'l3', new_stage: 'confirmed', new_primary_status: 'confirmed', changed_by: 'u2', changed_at: at(16) }
    ],
    campaigns: [{ id: 'c1', template_name: 'deneme_daveti', planned_count: 3, created_at: at(14), filters: { grades: ['grade_11'], columns: ['trial'] } }],
    campaignMessages: [
      { campaign_id: 'c1', delivery_status: 'delivered', payload: { send: { ok: true } } },
      { campaign_id: 'c1', delivery_status: 'accepted', payload: { send: { ok: true } } },
      { campaign_id: 'c1', delivery_status: 'send_failed', payload: { send: { ok: false } } }
    ],
    waitingConversations: 4,
    tasks: [{ status: 'completed', due_at: at(9) }, { status: 'pending', due_at: at(18) }]
  });

  assert.deepEqual(p.sources, { whatsapp: 1, instagram: 1, website: 1, facebook: 0, other: 0, total: 3 });
  assert.equal(p.inbound_messages.total, 2);
  assert.deepEqual(p.conversations, { contacted: 3, outbound_messages: 3, notes: 1 });
  const ayse = p.representatives.find((r) => r.name === 'Ayşe');
  // Aşama kaydı da görüşme sayılır: l1 (mesaj) + l2 (aşama)
  assert.deepEqual([ayse.contacts, ayse.messages, ayse.stage_changes], [2, 2, 1]);
  const mehmet = p.representatives.find((r) => r.name === 'Mehmet');
  assert.deepEqual([mehmet.contacts, mehmet.messages, mehmet.notes, mehmet.confirmed], [2, 1, 1, 1]);
  assert.equal(p.status.confirmed, 1);
  assert.equal(p.pipeline.find((c) => c.id === 'incoming').count, 2);
  assert.equal(p.pipeline.find((c) => c.id === 'trial').count, 1);
  assert.deepEqual(
    [p.bulk.totals.attempted, p.bulk.totals.delivered, p.bulk.totals.pending, p.bulk.totals.failed],
    [3, 1, 1, 1]
  );
  assert.equal(p.bulk.campaigns[0].audience, '11. Sınıf · Deneme Dersi Planlanan / Yapılan');
  assert.deepEqual(p.tasks, { due: 2, completed: 1, open: 1 });
  assert.ok(reportHasActivity(p));

  const text = formatCrmDailyReportText(p);
  assert.match(text, /Bugün yazan kişi: 1/);
  assert.match(text, /Web sitesi 1/);
  assert.match(text, /Ayşe: \*2 kişi\* · 2 mesaj/);
  assert.match(text, /3 kişiye gönderildi · Ulaştı 1 \(okundu 0\) · Beklemede 1 · Hatalı 1/);
  assert.match(text, /gunluk-rapor\?tarih=2026-09-16/);
});

test('Instagram / Facebook yorumları gelen mesaj sayısına girmez', () => {
  const day = '2026-09-24';
  const at = `${day}T10:00:00+03:00`;
  const p = computeCrmDailyReport({
    date: day,
    leads: [],
    users: [],
    inboundMessages: [
      { channel: 'instagram', message_type: 'text', occurred_at: at },
      { channel: 'instagram', message_type: 'comment', occurred_at: at },
      { channel: 'instagram', message_type: 'comment', occurred_at: at },
      { channel: 'facebook', message_type: 'comment', occurred_at: at },
      { channel: 'whatsapp', message_type: 'text', occurred_at: at }
    ]
  });
  assert.equal(p.inbound_messages.total, 2, 'yalnız gerçek mesajlar sayılır');
  assert.equal(p.inbound_messages.instagram, 1);
  assert.equal(p.inbound_messages.whatsapp, 1);
  assert.equal(p.comments.total, 3);
  assert.equal(p.comments.instagram, 2);
  assert.equal(p.comments.facebook, 1);
});

test('yorum varsa rapor metninde ayrı satır çıkar', () => {
  const day = '2026-09-24';
  const p = computeCrmDailyReport({
    date: day,
    leads: [],
    users: [],
    inboundMessages: [{ channel: 'instagram', message_type: 'comment', occurred_at: `${day}T10:00:00+03:00` }]
  });
  const text = formatCrmDailyReportText(p);
  assert.match(text, /Yorum: 1/);
  assert.match(text, /mesaj sayısına dahil değil/);
});

test('yorum yoksa metinde yorum satırı olmaz', () => {
  const day = '2026-09-24';
  const p = computeCrmDailyReport({ date: day, leads: [], users: [], inboundMessages: [] });
  assert.doesNotMatch(formatCrmDailyReportText(p), /Yorum:/);
});

test('bugün yazan kişiler, görüşülenler, alarm ve AI randevusu', () => {
  const D = '2026-11-27';
  const at = (h) => `${D}T${String(h).padStart(2, '0')}:00:00+03:00`;
  const p = computeCrmDailyReport({
    date: D,
    users: [{ id: 'u1', name: 'Muzaffer' }, { id: 'u2', name: 'Sultan' }],
    leads: [
      { id: 'a', created_at: at(9), source: 'whatsapp_inbound', stage: 'new_lead', primary_status: 'tracking' },
      { id: 'b', created_at: '2026-10-01T10:00:00+03:00', source: 'whatsapp_inbound', stage: 'new_lead', primary_status: 'tracking' },
      { id: 'c', created_at: at(10), source: 'instagram_inbound', stage: 'new_lead', primary_status: 'tracking' },
      { id: 'w', created_at: at(11), source: 'website_form', stage: 'new_lead', primary_status: 'tracking' }
    ],
    leadMessages: [
      { lead_id: 'a', conversation_id: 'ca', channel: 'whatsapp', created_at: at(9) },
      { lead_id: 'a', conversation_id: 'ca', channel: 'whatsapp', created_at: at(9) },
      { lead_id: 'b', conversation_id: 'cb', channel: 'whatsapp', created_at: at(12) },
      { lead_id: 'c', conversation_id: 'cc', channel: 'instagram', created_at: at(10) }
    ],
    inboxAgentMessages: [{ conversation_id: 'ca', lead_id: 'a', sender_id: 'u1', created_at: at(9) }],
    stageHistory: [
      { lead_id: 'b', new_stage: 'no_response', new_primary_status: 'tracking', changed_by: 'u2', changed_at: at(13) },
      { lead_id: 'c', new_stage: 'first_contact_pending', new_primary_status: 'tracking', changed_by: null, changed_at: at(13) }
    ],
    createdTasks: [
      { created_by: 'u2', auto_generated: false, task_type: 'call_parent', created_at: at(14) },
      { created_by: 'u2', auto_generated: true, task_type: 'whatsapp', created_at: at(14) },
      { created_by: null, auto_generated: true, task_type: 'call_parent', assigned_to: 'u1', deduplication_key: 'ai-callback:c:x', created_at: at(15) }
    ],
    calls: [{ direction: 'inbound', answered: true, started_at: at(10) }, { direction: 'inbound', answered: null, started_at: at(11) }]
  });
  assert.deepEqual(p.incoming.people, { whatsapp: 2, instagram: 1, website: 1, facebook: 0, other: 0, total: 4 });
  assert.equal(p.incoming.first_time, 3);
  assert.equal(p.incoming.messages.total, 4);
  // a: temsilci mesajı, b: aşama kaydı → görüşüldü; c: yalnız AI aşaması (görüşme sayılmaz), w: dokunulmadı
  assert.equal(p.incoming.contacted.total, 2);
  assert.equal(p.incoming.not_contacted, 2);
  assert.deepEqual([p.alarms.total, p.alarms.setters], [1, 1]);
  assert.equal(p.ai_appointments.total, 1);
  assert.equal(p.ai_appointments.by_consultant[0].name, 'Muzaffer');
  assert.deepEqual(p.calls, { inbound: 2, answered: 1, missed: 1, outbound: 0 });
  const sultan = p.representatives.find((r) => r.name === 'Sultan');
  assert.deepEqual([sultan.contacts, sultan.alarms], [1, 1]);
  const text = formatCrmDailyReportText(p);
  assert.match(text, /Bugün yazan kişi: 4/);
  assert.match(text, /görüşülen: \*2 \/ 4\*/);
  assert.match(text, /Takvim alarmı: 1/);
  assert.match(text, /AI asistan randevusu: 1/);
  assert.doesNotMatch(text, /Kurum içi/);
});
