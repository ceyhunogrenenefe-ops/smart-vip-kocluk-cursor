import test from 'node:test';
import assert from 'node:assert/strict';
import { imzaSonrasiTaksitPlani, planToplami } from '../parent-sign-taksit-plan-edit.js';

const eski = [
  { no: 1, tutar_tl: 5000, vade_tarihi: '2026-09-15', odendi: true, odendi_tarihi: '2026-09-14', odeme_hesap_id: 'h1' },
  { no: 2, tutar_tl: 5000, vade_tarihi: '2026-10-15', odendi: false, odendi_tarihi: '' },
  { no: 3, tutar_tl: 5000, vade_tarihi: '2026-11-15', odendi: false, odendi_tarihi: '' }
];

test('ödenmiş taksit korunur, ödenmemişler değişir, yeni taksit eklenir', () => {
  const r = imzaSonrasiTaksitPlani(eski, [
    { tutar_tl: 1, vade_tarihi: '2000-01-01' }, // ödenmiş: yok sayılır
    { tutar_tl: '2500', vade_tarihi: '2026-10-20' },
    { tutar_tl: 2500, vade_tarihi: '2026-11-20' },
    { tutar_tl: 5000, vade_tarihi: '2026-12-20' }
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.kartlar.length, 4);
  assert.deepEqual(
    [r.kartlar[0].tutar_tl, r.kartlar[0].vade_tarihi, r.kartlar[0].odendi, r.kartlar[0].odeme_hesap_id],
    [5000, '2026-09-15', true, 'h1']
  );
  assert.deepEqual(r.kartlar.map((k) => k.no), [1, 2, 3, 4]);
  assert.equal(r.kartlar[1].tutar_tl, 2500);
  assert.equal(r.kartlar[3].odendi, false);
  assert.equal(planToplami(r.kartlar), 15000);
});

test('ödenmiş taksit silinemez, hatalı tutar/vade reddedilir', () => {
  assert.equal(imzaSonrasiTaksitPlani(eski, []).ok, false);
  const ters = [...eski].reverse();
  assert.equal(imzaSonrasiTaksitPlani(ters, [{ tutar_tl: 5000, vade_tarihi: '2026-11-15' }]).error, 'odenmis_taksit_silinemez');
  assert.equal(imzaSonrasiTaksitPlani(eski, [{}, { tutar_tl: 0, vade_tarihi: '2026-10-15' }]).error, 'taksit_tutari_gecersiz');
  assert.equal(imzaSonrasiTaksitPlani(eski, [{}, { tutar_tl: 100, vade_tarihi: '15.10.2026' }]).error, 'vade_tarihi_invalid');
  // son ödenmemiş taksit silinebilir
  const iki = imzaSonrasiTaksitPlani(eski, [{}, { tutar_tl: 10000, vade_tarihi: '2026-10-15' }]);
  assert.equal(iki.ok, true);
  assert.equal(iki.kartlar.length, 2);
});
