import test from 'node:test';
import assert from 'node:assert/strict';
import { classLevelKey, foldTr, matchesSearch } from './turkish-search.js';

test('büyük/küçük harf ve Türkçe karakter farkı yok', () => {
  for (const q of ['ecrin taş', 'ECRİN TAŞ', 'Ecrin', 'ecrin tas', 'TAS ecrin', 'ECRIN']) {
    assert.equal(matchesSearch('Ecrin Taş', q), true, q);
  }
  assert.equal(matchesSearch('Işıl Çağlar', 'isil caglar'), true);
  assert.equal(matchesSearch('İLKER ŞAHİN', 'ilker şahin'), true);
  assert.equal(matchesSearch('Ecrin Taş', 'zeynep'), false);
  assert.equal(matchesSearch(['Meltem Acar', null, '9'], ''), true);
  assert.equal(foldTr('  ÖĞRENCİ   Ödemesi '), 'ogrenci odemesi');
});

test('sınıf değerleri tek biçime iner', () => {
  assert.equal(classLevelKey('5'), classLevelKey('5. Sınıf'));
  assert.equal(classLevelKey('4. Sinif'), '4');
  assert.equal(classLevelKey('YÖS'), classLevelKey('YOS'));
  assert.equal(classLevelKey('LGS (8. Sınıf)'), 'lgs');
  assert.equal(classLevelKey('TYT Maarif Model'), classLevelKey('TYT-Maarif'));
  assert.equal(classLevelKey('YKS-Sayısal'), classLevelKey('YKS Sayisal'));
  assert.notEqual(classLevelKey('10'), classLevelKey('11'));
  assert.equal(classLevelKey(null), '');
});
