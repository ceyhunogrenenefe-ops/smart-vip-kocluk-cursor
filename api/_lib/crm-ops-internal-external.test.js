import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyLeadContactStatus,
  isReferredOutLead,
  leadWasContacted,
  referredOutRows,
  resolveOpsDateRange,
  summarizeInternalFunnel,
  summarizeReferredOut
} from './crm-ops-metrics.js';

describe('kurum dışı tespiti', () => {
  it('referred_out_at veya stage ile anlaşılır', () => {
    assert.equal(isReferredOutLead({ referred_out_at: '2026-09-28T10:00:00Z' }), true);
    assert.equal(isReferredOutLead({ stage: 'referred_out' }), true);
    assert.equal(isReferredOutLead({ stage: 'new_lead' }), false);
    assert.equal(isReferredOutLead(null), false);
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

  it('kurum dışı her şeyi yener', () => {
    assert.equal(
      classifyLeadContactStatus({ primary_status: 'confirmed', referred_out_at: '2026-09-28T10:00:00Z' }),
      'referred_out'
    );
  });

  it('aşamalar doğru kovalara düşer', () => {
    assert.equal(classifyLeadContactStatus({ stage: 'offer_sent' }), 'in_progress');
    assert.equal(classifyLeadContactStatus({ stage: 'follow_up' }), 'call_again');
    assert.equal(classifyLeadContactStatus({ stage: 'trial_lesson_scheduled' }), 'trial');
    assert.equal(classifyLeadContactStatus({ stage: 'not_interested' }), 'negative');
  });
});

describe('kurum içi huni', () => {
  const leads = [
    { id: '1', stage: 'new_lead' },
    { id: '2', stage: 'new_lead' },
    { id: '3', stage: 'offer_sent', last_contact_at: 'x' },
    { id: '4', primary_status: 'confirmed', stage: 'confirmed' },
    { id: '5', stage: 'trial_lesson_scheduled', last_contact_at: 'x' },
    { id: '6', referred_out_at: '2026-09-28T10:00:00Z' }
  ];

  it('kurum dışı lead huniye hiç girmez', () => {
    const f = summarizeInternalFunnel(leads);
    assert.equal(f.total, 5);
    assert.equal(f.by_status.some((s) => s.id === 'referred_out'), false);
  });

  it('dönüş yapılmayan sayısına kurum dışı dahil edilmez', () => {
    const f = summarizeInternalFunnel(leads);
    assert.equal(f.not_contacted, 2);
    assert.equal(f.contacted, 3);
  });

  it('oranlar kurum içi toplam üzerinden', () => {
    const f = summarizeInternalFunnel(leads);
    assert.equal(f.contact_rate, 60);
    assert.equal(f.conversion_rate, 20);
  });

  it('boş liste sıfır döner, bölme hatası olmaz', () => {
    const f = summarizeInternalFunnel([]);
    assert.equal(f.total, 0);
    assert.equal(f.contact_rate, 0);
    assert.equal(f.conversion_rate, 0);
  });
});

describe('kurum dışı özeti', () => {
  const leads = [
    { id: 'a', referred_out_at: '2026-09-28T10:00:00Z' },
    { id: 'b', referred_out_at: '2026-09-27T10:00:00Z' },
    { id: 'c', referred_out_at: '2026-09-02T10:00:00Z' },
    { id: 'd', stage: 'new_lead' }
  ];
  const opts = { todayYmd: '2026-09-28', weekStartYmd: '2026-09-28', monthStartYmd: '2026-09-01' };

  it('gün / hafta / ay / toplam', () => {
    const r = summarizeReferredOut(leads, opts);
    assert.equal(r.today, 1);
    assert.equal(r.this_week, 1);
    assert.equal(r.this_month, 3);
    assert.equal(r.total, 3);
  });

  it('yönlendirme anına göre sayılır, oluşturulma tarihine göre değil', () => {
    const r = summarizeReferredOut([{ created_at: '2026-01-01', referred_out_at: '2026-09-28T08:00:00Z' }], opts);
    assert.equal(r.today, 1);
  });
});

describe('kurum dışı satırları', () => {
  it('rapor için gerekli alanları çıkarır', () => {
    const rows = referredOutRows(
      [
        {
          id: 'x',
          first_name: 'Ayşe',
          last_name: 'Yılmaz',
          phone: '05550001122',
          last_inbound_channel: 'instagram',
          grade_program: '8. Sınıf / LGS',
          referred_out_at: '2026-09-28T10:00:00Z',
          referred_out_by: 'u1',
          referred_out_reason: 'Bölgemizde şube yok'
        }
      ],
      { nameById: { u1: 'Sultan KURT' } }
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, 'Ayşe Yılmaz');
    assert.equal(rows[0].channel_label, 'Instagram');
    assert.equal(rows[0].by_user_name, 'Sultan KURT');
    assert.equal(rows[0].reason, 'Bölgemizde şube yok');
  });

  it('kurum içi lead listeye girmez', () => {
    assert.deepEqual(referredOutRows([{ id: 'y', stage: 'new_lead' }]), []);
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
