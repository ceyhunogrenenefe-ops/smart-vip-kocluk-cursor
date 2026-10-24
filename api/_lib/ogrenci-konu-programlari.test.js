import test from 'node:test';
import assert from 'node:assert/strict';
import {
  konuHaritalariniBirlestir,
  konuListeleriniBirlestir,
  ogrencininKonuSeviyeleri,
  programlariTemizle
} from './ogrenci-konu-programlari.js';

test('konu listeleri tekrarsiz birlesir, sira korunur', () => {
  const r = konuListeleriniBirlestir(['Türev', 'İntegral'], ['İntegral', 'Limit']);
  assert.deepEqual(r, ['Türev', 'İntegral', 'Limit']);
});

test('bos ve gecersiz girdiler atlanir', () => {
  assert.deepEqual(konuListeleriniBirlestir(null, ['A', '', '  ', 'B'], undefined), ['A', 'B']);
  assert.deepEqual(konuListeleriniBirlestir(), []);
});

test('ders haritalari birlesir; ayni ders tek listede toplanir', () => {
  const onbirinci = { MATEMATİK: ['Türev'], FİZİK: ['Elektrik'] };
  const tyt = { MATEMATİK: ['Temel Kavramlar', 'Türev'], 'TYT TÜRKÇE': ['Paragraf'] };
  const r = konuHaritalariniBirlestir(onbirinci, tyt);
  assert.deepEqual(r.MATEMATİK, ['Türev', 'Temel Kavramlar'], 'ayni konu iki kez olmamali');
  assert.deepEqual(r.FİZİK, ['Elektrik']);
  assert.deepEqual(r['TYT TÜRKÇE'], ['Paragraf']);
});

test('birlestirme girdiyi bozmaz', () => {
  const a = { MAT: ['x'] };
  const b = { MAT: ['y'] };
  konuHaritalariniBirlestir(a, b);
  assert.deepEqual(a, { MAT: ['x'] });
  assert.deepEqual(b, { MAT: ['y'] });
});

test('gecersiz program degerleri suzulur', () => {
  const gecerli = ['TYT-Maarif', 'YKS-Sayısal'];
  assert.deepEqual(programlariTemizle(['TYT-Maarif', 'UYDURMA'], gecerli), ['TYT-Maarif']);
  assert.deepEqual(programlariTemizle(['TYT-Maarif', 'TYT-Maarif'], gecerli), ['TYT-Maarif']);
  assert.deepEqual(programlariTemizle(null, gecerli), []);
});

test('ogrencinin seviyeleri: once kendi sinifi, sonra ek programlar', () => {
  assert.deepEqual(ogrencininKonuSeviyeleri(11, ['TYT-Maarif']), ['11', 'TYT-Maarif']);
});

test('ek program sinifin kendisiyle ayniysa tekrarlanmaz', () => {
  assert.deepEqual(ogrencininKonuSeviyeleri('TYT-Maarif', ['TYT-Maarif']), ['TYT-Maarif']);
});

test('ek program yoksa yalniz kendi sinifi doner — mevcut davranis', () => {
  assert.deepEqual(ogrencininKonuSeviyeleri(11, []), ['11']);
  assert.deepEqual(ogrencininKonuSeviyeleri(11, null), ['11']);
});

test('sinifi olmayan ogrenci yalniz ek programlari alir', () => {
  assert.deepEqual(ogrencininKonuSeviyeleri('', ['TYT-Maarif']), ['TYT-Maarif']);
  assert.deepEqual(ogrencininKonuSeviyeleri(null, []), []);
});

test('sinif 0 degeri kaybolmaz', () => {
  assert.deepEqual(ogrencininKonuSeviyeleri(0, []), ['0']);
});
