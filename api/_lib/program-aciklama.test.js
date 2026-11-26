import test from 'node:test';
import assert from 'node:assert/strict';
import { composeProgramAciklama, splitProgramAciklama } from './program-aciklama.js';

test('açıklama eklenir ve geri ayrılır', () => {
  const s = composeProgramAciklama('Şablon metni\nikinci satır', 'Sadece sayısal dersler.\nBaşlangıç 15 Aralık');
  assert.equal(s, 'Şablon metni\nikinci satır\n\nAçıklama: Sadece sayısal dersler.\nBaşlangıç 15 Aralık');
  assert.deepEqual(splitProgramAciklama(s), {
    base: 'Şablon metni\nikinci satır',
    aciklama: 'Sadece sayısal dersler.\nBaşlangıç 15 Aralık'
  });
  assert.deepEqual(splitProgramAciklama('Açıklama: yalnız fizik'), { base: '', aciklama: 'yalnız fizik' });
  assert.deepEqual(splitProgramAciklama('Şablon'), { base: 'Şablon', aciklama: '' });
  assert.equal(composeProgramAciklama('Şablon', ''), 'Şablon');
  // açıklama değişince eski açıklama yerine yenisi yazılır
  const { base } = splitProgramAciklama(s);
  assert.equal(composeProgramAciklama(base, 'Yeni'), 'Şablon metni\nikinci satır\n\nAçıklama: Yeni');
});
