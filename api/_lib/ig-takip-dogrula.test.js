import test from 'node:test';
import assert from 'node:assert/strict';
import { desteklenmiyorMu } from './ig-takip-dogrula.js';

test('kullanici onayi hatasi DESTEKLENMIYOR sayilir', () => {
  assert.equal(desteklenmiyorMu('This API call requires user consent', 10), true);
  assert.equal(desteklenmiyorMu('user consent is required'), true);
});

test('izin ve jeton hatalari desteklenmiyor sayilir', () => {
  assert.equal(desteklenmiyorMu('Invalid OAuth access token', 190), true);
  assert.equal(desteklenmiyorMu('(#200) Permissions error', 200), true);
  assert.equal(desteklenmiyorMu('does not have enough permissions'), true);
});

test('bilinmeyen alan hatasi desteklenmiyor sayilir', () => {
  assert.equal(desteklenmiyorMu('nonexisting field (is_user_follow_business)'), true);
  assert.equal(desteklenmiyorMu('Unsupported get request'), true);
});

test('gecici ag/hiz hatasi DESTEKLENMIYOR SAYILMAZ', () => {
  // Bunlar yeniden denenebilir; kalici "desteklenmiyor" demek yanlis olur
  assert.equal(desteklenmiyorMu('Application request limit reached', 4), false);
  assert.equal(desteklenmiyorMu('Please reduce the amount of data', 1), false);
  assert.equal(desteklenmiyorMu('HTTP 500'), false);
});

test('bos hata desteklenmiyor sayilmaz', () => {
  assert.equal(desteklenmiyorMu('', null), false);
  assert.equal(desteklenmiyorMu(null, null), false);
});
