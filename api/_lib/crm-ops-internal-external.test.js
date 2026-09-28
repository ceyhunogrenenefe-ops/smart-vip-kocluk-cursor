import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyLeadContactStatus,
  isInternalContact,
  leadWasContacted,
  resolveOpsDateRange,
  summarizeInternalContacts,
  summarizeLeadFunnel
} from './crm-ops-metrics.js';

describe('kurum içi / kurum dışı ayrımı', () => {
  it('kendi öğrencimiz kurum içidir', () => {
    assert.equal(isInternalContact({ is_internal: true }), true);
    assert.equal(isInternalContact({ is_internal: false }), false);
    assert.equal(isInternalContact({}), false);
    assert.equal(isInternalContact(null), false);
  });
});

describe('iletişim durumu', () => {
  it('yeni ve temas edilmemiş → dönüş yapılmadı', () => {
    assert.equal(classifyLeadContactStatus({ stage: 'new_lead' }), 'not_contacted');
    assert.equal(classifyLeadContactStatus({ stage: 'first_contact_pending' }), 'not_contacted');
  });

  it('aşama yeni görünse de temas varsa dönüş yapıldı sayılır', () => {
    assert.equal(
      classifyLeadContactStatus({ stage: 'new_lead', last_contact_at: '2026-09-28T09:00:00Z' }),
      'contacted'
    );
    assert.equal(leadWasContacted({ first_contact_at: '2026-09-28T09:00:00Z' }), true);
    assert.equal(leadWasContacted({}), false);
  });

  it('kesin kayıt ve kayıp primary_status ile belirlenir', () => {
    assert.equal(classifyLeadContactStatus({ primary_status: 'confirmed', stage: 'new_lead' }), 'registered');
    assert.equal(classifyLeadContactStatus({ primary_status: 'lost', stage: 'offer_sent' }), 'negative');
  });

  it('aşamalar doğru kovalara düşer', () => {
    assert.equal(classifyLeadContactStatus({ stage: 'offer_sent' }), 'in_progress');
    assert.equal(classifyLeadContactStatus({ stage: 'follow_up' }), 'call_again');
    assert.equal(classifyLeadContactStatus({ stage: 'trial_lesson_scheduled' }), 'trial');
    assert.equal(classifyLeadContactStatus({ stage: 'not_interested' }), 'negative');
  });
});

describe('kurum dışı satış hunisi', () => {
  const leads = [
    { id: '1', stage: 'new_lead' },
    { id: '2', stage: 'new_lead' },
    { id: '3', stage: 'offer_sent', last_contact_at: 'x' },
    { id: '4', primary_status: 'confirmed', stage: 'confirmed' },
    { id: '5', stage: 'trial_lesson_scheduled', last_contact_at: 'x' }
  ];

  it('dönüş yapılan / yapılmayan doğru sayılır', () => {
    const f = summarizeLeadFunnel(leads);
    assert.equal(f.total, 5);
    assert.equal(f.not_contacted, 2);
    assert.equal(f.contacted, 3);
  });

  it('oranlar toplam üzerinden', () => {
    const f = summarizeLeadFunnel(leads);
    assert.equal(f.contact_rate, 60);
    assert.equal(f.conversion_rate, 20);
  });

  it('boş liste sıfır döner, bölme hatası olmaz', () => {
    const f = summarizeLeadFunnel([]);
    assert.equal(f.total, 0);
    assert.equal(f.contact_rate, 0);
    assert.equal(f.conversion_rate, 0);
  });
});

describe('kurum içi özet', () => {
  it('hacim, yanıtlanan ve bekleyen', () => {
    const r = summarizeInternalContacts([
      { is_internal: true, last_inbound_channel: 'whatsapp' },
      { is_internal: true, last_inbound_channel: 'instagram', last_contact_at: 'x' },
      { is_internal: false, last_inbound_channel: 'whatsapp' }
    ]);
    assert.equal(r.total, 2);
    assert.equal(r.answered, 1);
    assert.equal(r.pending, 1);
    assert.equal(r.by_channel.length, 2);
  });

  it('kurum dışı kayıt kurum içi özete girmez', () => {
    const r = summarizeInternalContacts([{ is_internal: false }, { is_internal: false }]);
    assert.equal(r.total, 0);
  });

  it('boş liste güvenli', () => {
    const r = summarizeInternalContacts([]);
    assert.equal(r.total, 0);
    assert.equal(r.pending, 0);
  });
});

describe('tarih ön ayarları', () => {
  it('son 7 gün eklendi', () => {
    const r = resolveOpsDateRange('last_7_days');
    assert.equal(r.preset, 'last_7_days');
    assert.ok(r.from < r.to);
  });
  it('mevcut ön ayarlar bozulmadı', () => {
    assert.equal(resolveOpsDateRange('today').preset, 'today');
    assert.equal(resolveOpsDateRange('yesterday').preset, 'yesterday');
    assert.equal(resolveOpsDateRange('this_month').preset, 'this_month');
    assert.equal(resolveOpsDateRange().preset, 'this_week');
  });
});
