import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isSelfRecipient, normalizeGatewaySelfPhoneDigits } from './gateway-self-recipient.js';

describe('gateway self recipient', () => {
  it('matches TR recipient to linked session phone', () => {
    assert.equal(isSelfRecipient('+905013715302', '905013715302'), true);
    assert.equal(isSelfRecipient('05013715302', '905013715302'), true);
    assert.equal(isSelfRecipient('+905013715302', '90501371530212'), true);
    assert.equal(isSelfRecipient('+905013715302', '905013715302:12@s.whatsapp.net'), true);
  });

  it('rejects unrelated numbers', () => {
    assert.equal(isSelfRecipient('+905307104317', '905013715302'), false);
    assert.equal(isSelfRecipient('+905013715302', null), false);
    assert.equal(isSelfRecipient('', '905013715302'), false);
    assert.equal(isSelfRecipient('+905013715302', '9050137153021234'), false);
  });

  it('normalizes 05xx input', () => {
    assert.equal(normalizeGatewaySelfPhoneDigits('05013715302'), '905013715302');
  });
});
