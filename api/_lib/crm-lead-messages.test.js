/** Kişi kartı mesajları: iki kaynağın birleşimi, tekrar ayıklama, sıralama */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { leadPhoneVariants, mergeLeadChannelMessages } from './crm-lead-messages.js';

describe('leadPhoneVariants', () => {
  it('0 ile başlayan ve 10 haneli numaraları 90… biçimine çevirir', () => {
    assert.deepEqual(leadPhoneVariants({ phone: '0532 123 45 67' }), ['905321234567', '+905321234567']);
    assert.deepEqual(leadPhoneVariants({ normalized_phone: '5321234567' }), ['905321234567', '+905321234567']);
  });
  it('telefon yoksa boş döner', () => {
    assert.deepEqual(leadPhoneVariants({}), []);
  });
});

describe('mergeLeadChannelMessages', () => {
  const reg = [
    { id: 'r1', direction: 'inbound', body: 'Merhaba', occurred_at: '2026-09-30T10:00:00Z', external_message_id: 'wamid.A' }
  ];
  it('aynı WhatsApp mesajını (aynı wamid) tek gösterir', () => {
    const crm = [{ id: 'crm:1', direction: 'inbound', body: 'Merhaba', occurred_at: '2026-09-30T10:00:01Z', external_message_id: 'wamid.A' }];
    assert.equal(mergeLeadChannelMessages(reg, crm).length, 1);
  });
  it('gelen kutusundan gönderilen cevabı ekler ve eskiden yeniye sıralar', () => {
    const crm = [
      { id: 'crm:2', direction: 'outbound', body: 'Size dönüyoruz', occurred_at: '2026-09-30T10:05:00Z', external_message_id: 'wamid.B' }
    ];
    const out = mergeLeadChannelMessages(reg, crm);
    assert.deepEqual(out.map((m) => m.id), ['r1', 'crm:2']);
  });
  it('wamid yoksa yön + metin + dakika ile tekrarı ayıklar', () => {
    const a = [{ id: 'a', direction: 'outbound', body: 'Tamam', occurred_at: '2026-09-30T11:00:10Z' }];
    const b = [{ id: 'b', direction: 'outbound', body: 'Tamam', occurred_at: '2026-09-30T11:00:40Z' }];
    assert.equal(mergeLeadChannelMessages(a, b).length, 1);
  });
  it('en yeni 200 mesajı tutar', () => {
    const many = Array.from({ length: 250 }, (_, i) => ({
      id: `m${i}`,
      direction: 'inbound',
      body: `mesaj ${i}`,
      occurred_at: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString()
    }));
    const out = mergeLeadChannelMessages(many, []);
    assert.equal(out.length, 200);
    assert.equal(out[out.length - 1].id, 'm249');
    assert.equal(out[0].id, 'm50');
  });
});
