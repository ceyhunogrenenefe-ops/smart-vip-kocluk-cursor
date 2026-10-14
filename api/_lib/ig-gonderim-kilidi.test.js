import test from 'node:test';
import assert from 'node:assert/strict';
import { ADIMLAR, islemAnahtari } from './ig-gonderim-kilidi.js';

test('PDF anahtari otomasyon + kullanici basina OMURLUK tektir', () => {
  const a = islemAnahtari({ step: ADIMLAR.PDF, automationId: 'a1', igUserId: 'u1', eventId: 'mid-1' });
  const b = islemAnahtari({ step: ADIMLAR.PDF, automationId: 'a1', igUserId: 'u1', eventId: 'mid-2' });
  assert.equal(a, b, 'farkli buton basislarinda bile PDF anahtari ayni olmali');
});

test('farkli kullanici veya otomasyon PDF anahtarini ayirir', () => {
  const a = islemAnahtari({ step: ADIMLAR.PDF, automationId: 'a1', igUserId: 'u1' });
  assert.notEqual(a, islemAnahtari({ step: ADIMLAR.PDF, automationId: 'a1', igUserId: 'u2' }));
  assert.notEqual(a, islemAnahtari({ step: ADIMLAR.PDF, automationId: 'a2', igUserId: 'u1' }));
});

test('ayni buton basisinin tekrari TEK yanit uretir', () => {
  const a = islemAnahtari({ step: ADIMLAR.VERIFY_RESULT, automationId: 'a1', igUserId: 'u1', eventId: 'mid-1' });
  const b = islemAnahtari({ step: ADIMLAR.VERIFY_RESULT, automationId: 'a1', igUserId: 'u1', eventId: 'mid-1' });
  assert.equal(a, b, 'ayni webhook olayi ayni anahtari vermeli');
});

test('kullanicinin bilincli ikinci kontrolu YENI islemdir', () => {
  const a = islemAnahtari({ step: ADIMLAR.VERIFY_RESULT, automationId: 'a1', igUserId: 'u1', eventId: 'mid-1' });
  const b = islemAnahtari({ step: ADIMLAR.VERIFY_RESULT, automationId: 'a1', igUserId: 'u1', eventId: 'mid-2' });
  assert.notEqual(a, b, 'yeni basis yeni kontrol sayilmali');
});

test('olay kimligi yoksa kullanici bazina duser, tekrar etmez', () => {
  const a = islemAnahtari({ step: ADIMLAR.VERIFY_RESULT, automationId: 'a1', igUserId: 'u1' });
  const b = islemAnahtari({ step: ADIMLAR.VERIFY_RESULT, automationId: 'a1', igUserId: 'u1', eventId: '' });
  assert.equal(a, b);
  assert.ok(!a.includes('undefined'));
});

test('davet anahtari yorum basinadir', () => {
  const a = islemAnahtari({ step: ADIMLAR.INVITE, automationId: 'a1', commentId: 'c1' });
  const b = islemAnahtari({ step: ADIMLAR.INVITE, automationId: 'a1', commentId: 'c1' });
  assert.equal(a, b, 'ayni yorum tek davet');
  assert.notEqual(a, islemAnahtari({ step: ADIMLAR.INVITE, automationId: 'a1', commentId: 'c2' }));
});

test('adimlar birbirine karismaz', () => {
  const ortak = { automationId: 'a1', igUserId: 'u1', commentId: 'c1', eventId: 'm1' };
  const anahtarlar = new Set([
    islemAnahtari({ ...ortak, step: ADIMLAR.INVITE }),
    islemAnahtari({ ...ortak, step: ADIMLAR.VERIFY_RESULT }),
    islemAnahtari({ ...ortak, step: ADIMLAR.PDF })
  ]);
  assert.equal(anahtarlar.size, 3, 'her adim ayri anahtar almali');
});

test('farkli kullanicilar birbirini engellemez', () => {
  const u1 = islemAnahtari({ step: ADIMLAR.VERIFY_RESULT, automationId: 'a1', igUserId: 'u1', eventId: 'm1' });
  const u2 = islemAnahtari({ step: ADIMLAR.VERIFY_RESULT, automationId: 'a1', igUserId: 'u2', eventId: 'm1' });
  assert.notEqual(u1, u2);
});
