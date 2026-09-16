/**
 * Sözleşmede peşinat: ödenen tutar ücretten düşülür, kalan eşit taksitlere
 * bölünür ve sözleşme metninde peşinat ile kalan tutar görünür.
 */
import assert from 'node:assert/strict';
import {
  taksitBazTutar,
  buildTaksitPlan,
  buildParentContractHtml
} from './parent-sign-defaults.js';

// Kalan tutar hesabı
assert.equal(taksitBazTutar(12000, 4000), 8000);
assert.equal(taksitBazTutar(12000, 0), 12000);
// Peşinat ücreti aşarsa kalan sıfırdır, eksiye düşmez
assert.equal(taksitBazTutar(5000, 9000), 0);
assert.equal(taksitBazTutar(0, 1000), 0);

// Taksitler kalan tutara bölünür
const plan = buildTaksitPlan(12000, 4, '2026-09-16', null, null, 4000);
assert.equal(plan.length, 4);
assert.equal(
  plan.reduce((t, c) => t + Number(c.tutar_tl), 0),
  8000
);
assert.deepEqual(plan.map((c) => c.tutar_tl), [2000, 2000, 2000, 2000]);

// Peşinat yoksa eski davranış korunur
const planSade = buildTaksitPlan(12000, 4, '2026-09-16');
assert.equal(
  planSade.reduce((t, c) => t + Number(c.tutar_tl), 0),
  12000
);

// Tamamı peşin ödendiyse taksit üretilmez
assert.deepEqual(buildTaksitPlan(9000, 3, '2026-09-16', null, null, 9000), []);

const base = {
  ogrenci_ad: 'Ali',
  ogrenci_soyad: 'Yılmaz',
  veli_ad: 'Ayşe',
  veli_soyad: 'Yılmaz',
  telefon: '0850',
  adres: 'Batman',
  sinif: '8',
  program_adi: 'LGS',
  baslangic_tarihi: '2026-09-16',
  bitis_tarihi: '2027-06-30',
  haftalik_ders_saati: 6,
  ucret: 12000,
  taksit_sayisi: 4,
  kurum_kodu: 'OVD',
  contract_number: 'OVD-1',
  kurum_adi: 'Online VIP Dershane',
  verify_url: '#',
  document_title: 'Satış sözleşmesi',
  para_birimi: 'TRY'
};

// Peşinatlı sözleşme: peşinat, kalan tutar ve kalanın taksiti görünür
const html = buildParentContractHtml({ ...base, pesinat: 4000, taksit_kartlari: plan });
assert.ok(html.includes('Peşinat (ödendi)'));
assert.ok(html.includes('4000'));
assert.ok(html.includes('Kalan tutar'));
assert.ok(html.includes('8000'));
assert.ok(html.includes('Kalan tutarın taksiti'));
assert.ok(html.includes('Peşinat olarak'));

// Peşinatsız sözleşme eskisi gibi kalır
const htmlSade = buildParentContractHtml({ ...base, pesinat: 0, taksit_kartlari: planSade });
assert.ok(!htmlSade.includes('Peşinat'));
assert.ok(htmlSade.includes('Ortalama taksit tutarı'));

console.log('parent-sign-pesinat tests ok');
