import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ogretmenUcreti,
  sureyiTemizle,
  toplamTutar,
  ucretEtiketi,
  ucretiTemizle
} from './ozel-ders-ucret.js';

const AYAR = { default_fee_tl: 1000, default_duration_min: 40 };

test('ogretmenin kendi ucreti varsayilani ezer', () => {
  const r = ogretmenUcreti({ private_lesson_fee_tl: 1500, lesson_duration_min: 40 }, AYAR);
  assert.equal(r.fee, 1500);
  assert.equal(r.source, 'teacher');
  assert.equal(r.duration, 40);
});

test('ucreti girilmemis ogretmen kurum varsayilanini kullanir', () => {
  const r = ogretmenUcreti({ private_lesson_fee_tl: null }, AYAR);
  assert.equal(r.fee, 1000);
  assert.equal(r.source, 'default');
});

test('varsayilan da yoksa fiyat gosterilmez', () => {
  const r = ogretmenUcreti({ private_lesson_fee_tl: null }, null);
  assert.equal(r.fee, null);
  assert.equal(r.source, 'none');
  assert.equal(r.duration, 40, 'sure yine de varsayilana dusmeli');
});

test('sifir ucret gecerlidir ve varsayilana DUSMEZ', () => {
  // 0 "ucretsiz" demektir; null ile karistirilmamali
  const r = ogretmenUcreti({ private_lesson_fee_tl: 0 }, AYAR);
  assert.equal(r.fee, 0);
  assert.equal(r.source, 'teacher');
});

test('bir ogretmenin ucreti digerini etkilemez', () => {
  const a = { private_lesson_fee_tl: 1500 };
  const b = { private_lesson_fee_tl: 900 };
  const c = { private_lesson_fee_tl: null };
  assert.equal(ogretmenUcreti(a, AYAR).fee, 1500);
  assert.equal(ogretmenUcreti(b, AYAR).fee, 900);
  assert.equal(ogretmenUcreti(c, AYAR).fee, 1000);
});

test('ogretmenin kendi ders suresi kurum varsayilanini ezer', () => {
  assert.equal(ogretmenUcreti({ lesson_duration_min: 60 }, AYAR).duration, 60);
  assert.equal(ogretmenUcreti({ lesson_duration_min: null }, AYAR).duration, 40);
  assert.equal(ogretmenUcreti({}, { default_fee_tl: 1000 }).duration, 40);
});

test('ozel ders kapaliysa bildirilir', () => {
  assert.equal(ogretmenUcreti({ private_lesson_enabled: false }, AYAR).enabled, false);
  assert.equal(ogretmenUcreti({ private_lesson_enabled: true }, AYAR).enabled, true);
  assert.equal(ogretmenUcreti({}, AYAR).enabled, true, 'alan yoksa acik sayilmali');
});

test('ucret girisi Turkce ve duz bicimleri kabul eder', () => {
  assert.deepEqual(ucretiTemizle('1.500'), { value: 1500 });
  assert.deepEqual(ucretiTemizle('1500'), { value: 1500 });
  assert.deepEqual(ucretiTemizle('1500,50'), { value: 1500.5 });
  assert.deepEqual(ucretiTemizle('1.500,50'), { value: 1500.5 });
  assert.deepEqual(ucretiTemizle(' 1500 '), { value: 1500 });
});

test('bos ucret girisi isareti kaldirir, sifir yapmaz', () => {
  assert.deepEqual(ucretiTemizle(''), { value: null });
  assert.deepEqual(ucretiTemizle(null), { value: null });
});

test('gecersiz ucret reddedilir', () => {
  assert.ok(ucretiTemizle('abc').error);
  assert.ok(ucretiTemizle('-5').error);
  assert.ok(ucretiTemizle('99999999').error);
});

test('sure dogrulamasi sinirlari uygular', () => {
  assert.deepEqual(sureyiTemizle('40'), { value: 40 });
  assert.deepEqual(sureyiTemizle(''), { value: null });
  assert.ok(sureyiTemizle('2').error);
  assert.ok(sureyiTemizle('400').error);
});

test('toplam tutar sunucuda carpilir', () => {
  assert.equal(toplamTutar(1500, 4), 6000);
  assert.equal(toplamTutar(1500.5, 2), 3001);
  assert.equal(toplamTutar(1500, 0), null, 'sifir ders reddedilmeli');
  assert.equal(toplamTutar(1500, 999), null, 'asiri adet reddedilmeli');
  assert.equal(toplamTutar(-1, 2), null);
});

test('etiket Turkce bicimde yazilir', () => {
  assert.equal(ucretEtiketi(1500, 40), '40 dakikalık birebir özel ders · 1.500 TL / Ders');
  assert.equal(ucretEtiketi(null, 40), 'Ücret için iletişime geçin');
});
