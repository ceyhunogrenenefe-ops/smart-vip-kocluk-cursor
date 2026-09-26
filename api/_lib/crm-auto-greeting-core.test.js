import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectGrade,
  detectCallSlot,
  isWithinRunWindow,
  isChannelEnabled,
  nextFlowAction,
  numberedOptions,
  DEFAULT_CALL_SLOTS,
  PREFER_MESSAGE_OPTION
} from './crm-auto-greeting-core.js';

test('sınıf ilk mesajda belirtilmişse tespit edilir', () => {
  assert.equal(detectGrade('9. sınıf hakkında bilgi alabilir miyim?')?.key, '9');
  assert.equal(detectGrade('8.sinif')?.key, '8');
  assert.equal(detectGrade('oğlum 11 sınıfa geçti')?.key, '11');
  assert.equal(detectGrade('12. Sınıf')?.key, '12');
});

test('program adlarından sınıf çıkarılır', () => {
  assert.equal(detectGrade('LGS fiyatı nedir?')?.key, '8');
  assert.equal(detectGrade('mezun öğrenciyim')?.key, 'mezun');
  assert.equal(detectGrade('YKS matematik')?.key, '12');
  assert.equal(detectGrade('yks hakkında')?.confidence, 'medium');
});

test('seçenek listesine sayıyla cevap anlaşılır', () => {
  assert.equal(detectGrade('8')?.key, '8');
  assert.equal(detectGrade('12')?.key, '12');
});

test('sınıf belli değilse tahmin yapılmaz', () => {
  assert.equal(detectGrade('Merhaba'), null);
  assert.equal(detectGrade('bilgi alabilir miyim'), null);
  assert.equal(detectGrade('fiyat nedir'), null);
  assert.equal(detectGrade(''), null);
  // 2026 bir yıl, sınıf değil
  assert.equal(detectGrade('2026 kayıtları başladı mı'), null);
});

test('mesai dışı kipi: 22:00 sonrası çalışır, gündüz çalışmaz', () => {
  const s = { run_mode: 'after_hours', business_start: '09:00', business_end: '22:00' };
  assert.equal(isWithinRunWindow(s, '22:30'), true);
  assert.equal(isWithinRunWindow(s, '07:00'), true);
  assert.equal(isWithinRunWindow(s, '14:00'), false);
  assert.equal(isWithinRunWindow(s, '09:00'), false);
});

test('her zaman kipi saatten bağımsız çalışır', () => {
  assert.equal(isWithinRunWindow({ run_mode: 'always' }, '03:00'), true);
  assert.equal(isWithinRunWindow({ run_mode: 'always' }, '14:00'), true);
});

test('özel aralık kipi, gece yarısını aşan aralığı da doğru çözer', () => {
  const s = { run_mode: 'custom_window', custom_start: '20:00', custom_end: '02:00' };
  assert.equal(isWithinRunWindow(s, '21:00'), true);
  assert.equal(isWithinRunWindow(s, '01:00'), true);
  assert.equal(isWithinRunWindow(s, '12:00'), false);
});

test('kanal kapalıysa akış çalışmaz', () => {
  const s = { channel_whatsapp: true, channel_instagram: false };
  assert.equal(isChannelEnabled(s, 'whatsapp'), true);
  assert.equal(isChannelEnabled(s, 'instagram'), false);
  assert.equal(isChannelEnabled(s, 'tiktok'), false);
});

test('saat aralığı seçimi sayı, aralık ve saatle çözülür', () => {
  assert.equal(detectCallSlot('1')?.slot, DEFAULT_CALL_SLOTS[0]);
  assert.equal(detectCallSlot('10:00 - 12:00')?.slot, DEFAULT_CALL_SLOTS[0]);
  assert.equal(detectCallSlot('14-16')?.slot, DEFAULT_CALL_SLOTS[2]);
  assert.equal(detectCallSlot('18:00')?.slot, DEFAULT_CALL_SLOTS[4]);
});

test('telefon istemeyen müşteri ayrılır', () => {
  assert.equal(detectCallSlot('telefon istemiyorum')?.prefersMessage, true);
  assert.equal(detectCallSlot('buradan bilgi almak istiyorum')?.prefersMessage, true);
  assert.equal(detectCallSlot('6')?.slot, PREFER_MESSAGE_OPTION);
});

test('akış: oturum yokken sınıf belliyse doğrudan saat sorulur', () => {
  const r = nextFlowAction({ session: null, body: 'LGS fiyatı nedir' });
  assert.equal(r.action, 'ask_slot');
  assert.equal(r.grade.key, '8');
});

test('akış: oturum yokken sınıf belli değilse karşılama yapılır', () => {
  assert.equal(nextFlowAction({ session: null, body: 'Merhaba' }).action, 'greet');
});

test('akış: karşılama yapıldıktan sonra tekrar karşılama yapılmaz', () => {
  const session = { step: 'greeted' };
  assert.equal(nextFlowAction({ session, body: 'Bilgi alabilir miyim?' }).action, 'ignore');
  assert.equal(nextFlowAction({ session, body: 'fiyat nedir' }).action, 'ignore');
});

test('akış: temsilci devraldıysa bot susar', () => {
  const session = { step: 'greeted', human_takeover_at: '2026-09-26T10:00:00Z' };
  const r = nextFlowAction({ session, body: '9. sınıf' });
  assert.equal(r.action, 'ignore');
  assert.equal(r.reason, 'human_takeover');
});

test('akış: tamamlanmış sohbette bot yeniden başlamaz', () => {
  assert.equal(nextFlowAction({ session: { step: 'completed' }, body: 'peki fiyat?' }).action, 'ignore');
});

test('akış: saat seçilince tamamlanır', () => {
  const r = nextFlowAction({ session: { step: 'slot_asked' }, body: '2' });
  assert.equal(r.action, 'complete');
  assert.equal(r.slot.slot, DEFAULT_CALL_SLOTS[1]);
});

test('numaralı seçenek listesi üretilir', () => {
  const text = numberedOptions(['A', 'B']);
  assert.equal(text, '1) A\n2) B');
});
