import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FB_CONTACT_PREFIX,
  isFacebookFallbackContact,
  stripFacebookFallbackContact
} from './crm-inbox.js';

describe('facebook CRM channel fallback helpers', () => {
  it('detects fb: prefix contacts', () => {
    assert.equal(isFacebookFallbackContact('fb:123456'), true);
    assert.equal(isFacebookFallbackContact('123456'), false);
    assert.equal(isFacebookFallbackContact(null), false);
  });

  it('strips fb: prefix for PSID merge', () => {
    assert.equal(stripFacebookFallbackContact(`${FB_CONTACT_PREFIX}999`), '999');
    assert.equal(stripFacebookFallbackContact('plain'), 'plain');
  });
});
