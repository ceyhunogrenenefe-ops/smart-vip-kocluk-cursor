import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSlot,
  temizKonu,
  yolBuOgretmeneAit,
  yuklemeYolu
} from '../yazili-hazirlik-slots.js';

test('yalnizca 1-2 donem, 1-2 yazili ve 1-3 calisma gecerlidir', () => {
  assert.deepEqual(parseSlot({ donem: 1, yazili: 2, calisma: 3 }), { donem: 1, yazili: 2, calisma: 3 });
  assert.equal(parseSlot({ donem: 3, yazili: 1, calisma: 1 }), null);
  assert.equal(parseSlot({ donem: 2, yazili: 1, calisma: 4 }), null);
});

test('konu bos veya cok uzun olamaz', () => {
  assert.equal(temizKonu('  Matematik  '), 'Matematik');
  assert.equal(temizKonu(''), '');
  assert.equal(temizKonu('x'.repeat(81)), '');
});

test('yukleme yolu ogretmen, sinif ve rafa kilitlenir', () => {
  const slot = { donem: 2, yazili: 1, calisma: 2 };
  const yol = yuklemeYolu('ogretmen-1', 'sinif-9', slot, 'çalışma.pdf');
  assert.equal(yolBuOgretmeneAit(yol, 'ogretmen-1', 'sinif-9', slot), true);
  assert.equal(yolBuOgretmeneAit(yol, 'baskasi', 'sinif-9', slot), false);
  assert.equal(yolBuOgretmeneAit('yh/ogretmen-1/sinif-9/2-1-2/../../gizli.pdf', 'ogretmen-1', 'sinif-9', slot), false);
});
