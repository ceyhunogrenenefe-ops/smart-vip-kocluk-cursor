import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXTRA_ITEM_KINDS,
  extraItemsTotal,
  normalizeExtraItems,
  readExtraItems
} from './private-lesson-fee-extras.js';

test('hazır kalemler arasında rehberlik ve deneme var', () => {
  const ids = EXTRA_ITEM_KINDS.map((k) => k.id);
  assert.ok(ids.includes('rehberlik'));
  assert.ok(ids.includes('deneme'));
  assert.ok(ids.includes('other'));
});

test('tutar adet x birim ücretten yeniden hesaplanır', () => {
  // İstemci yanlış tutar gönderse de kaydedilen doğru olmalı
  const items = normalizeExtraItems([
    { kind: 'rehberlik', quantity: 4, unit_price_tl: 200, amount_tl: 999999 }
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].amount_tl, 800);
  assert.equal(items[0].label, 'Rehberlik');
});

test('bilinmeyen kalem türü "other" olur, ad korunur', () => {
  const items = normalizeExtraItems([{ kind: 'uydurma', label: 'Kamp bedeli', quantity: 1, unit_price_tl: 1500 }]);
  assert.equal(items[0].kind, 'other');
  assert.equal(items[0].label, 'Kamp bedeli');
});

test('adı olmayan kaleme türünün adı verilir', () => {
  const items = normalizeExtraItems([{ kind: 'deneme', quantity: 3, unit_price_tl: 50 }]);
  assert.equal(items[0].label, 'Deneme Sınavı');
});

test('adet ve ücreti sıfır olan boş satır kaydedilmez', () => {
  const items = normalizeExtraItems([
    { kind: 'deneme', quantity: 0, unit_price_tl: 0 },
    { kind: 'deneme', quantity: 2, unit_price_tl: 50 }
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].amount_tl, 100);
});

test('ücretsiz ama adedi olan kalem korunur', () => {
  // Hediye deneme: adet var, tutar 0 — kayıt kalmalı
  const items = normalizeExtraItems([{ kind: 'deneme', quantity: 2, unit_price_tl: 0 }]);
  assert.equal(items.length, 1);
  assert.equal(items[0].amount_tl, 0);
});

test('negatif değerler sıfıra çekilir', () => {
  const items = normalizeExtraItems([{ kind: 'kaynak', quantity: -5, unit_price_tl: -10 }]);
  assert.equal(items.length, 0);
  const tek = normalizeExtraItems([{ kind: 'kaynak', quantity: -5, unit_price_tl: 100 }]);
  assert.equal(tek[0].quantity, 0);
  assert.equal(tek[0].amount_tl, 0);
});

test('kalem sayısı sınırlanır', () => {
  const many = Array.from({ length: 50 }, () => ({ kind: 'deneme', quantity: 1, unit_price_tl: 10 }));
  assert.equal(normalizeExtraItems(many).length, 30);
});

test('verilen id korunur, verilmeyene üretilir', () => {
  const items = normalizeExtraItems([
    { id: 'abc', kind: 'deneme', quantity: 1, unit_price_tl: 10 },
    { kind: 'deneme', quantity: 1, unit_price_tl: 10 }
  ]);
  assert.equal(items[0].id, 'abc');
  assert.ok(items[1].id && items[1].id !== 'abc');
});

test('kuruş yuvarlaması tutarlı', () => {
  const items = normalizeExtraItems([{ kind: 'etut', quantity: 1.5, unit_price_tl: 333.333 }]);
  assert.equal(items[0].unit_price_tl, 333.33);
  assert.equal(items[0].amount_tl, 500);
});

test('toplam kalemlerin tutarını verir', () => {
  const items = normalizeExtraItems([
    { kind: 'rehberlik', quantity: 4, unit_price_tl: 200 },
    { kind: 'deneme', quantity: 3, unit_price_tl: 50 }
  ]);
  assert.equal(extraItemsTotal(items), 950);
  assert.equal(extraItemsTotal([]), 0);
  assert.equal(extraItemsTotal(null), 0);
});

test('dizi olmayan girdi boş liste döner', () => {
  assert.deepEqual(normalizeExtraItems(null), []);
  assert.deepEqual(normalizeExtraItems('abc'), []);
  assert.deepEqual(normalizeExtraItems({ kind: 'deneme' }), []);
});

test('veritabanı değeri metin de olsa okunur, kolon yoksa boş döner', () => {
  const asText = readExtraItems('[{"kind":"deneme","quantity":2,"unit_price_tl":50}]');
  assert.equal(asText.length, 1);
  assert.equal(asText[0].amount_tl, 100);
  assert.deepEqual(readExtraItems(undefined), []);
  assert.deepEqual(readExtraItems(null), []);
  assert.deepEqual(readExtraItems('bozuk json {'), []);
});
