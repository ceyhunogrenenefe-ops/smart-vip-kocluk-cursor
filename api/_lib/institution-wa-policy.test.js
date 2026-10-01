/** Kurum WhatsApp politikası: numara eşleştirme anahtarı */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { phoneKey, gatewayOnlyBlockedError } from './institution-wa-policy.js';

describe('phoneKey', () => {
  it('farklı yazımları aynı son 10 haneye indirger', () => {
    for (const p of ['+90 532 123 45 67', '905321234567', '05321234567', '5321234567', '0090-532-123-4567']) {
      assert.equal(phoneKey(p), '5321234567');
    }
  });
  it('kısa / boş numarada boş döner', () => {
    assert.equal(phoneKey(''), '');
    assert.equal(phoneKey('12345'), '');
    assert.equal(phoneKey(null), '');
  });
});

describe('gatewayOnlyBlockedError', () => {
  it('kod ve kurum adını taşır', () => {
    const e = gatewayOnlyBlockedError({ institutionName: 'TÜRKÇE UZMANI' }, 'template');
    assert.equal(e.code, 'GATEWAY_ONLY_INSTITUTION');
    assert.match(e.message, /TÜRKÇE UZMANI/);
    assert.match(e.message, /template/);
  });
});
