import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { INSTAGRAM_APP_WEBHOOK_FIELDS } from './meta-social-inbound.js';

describe('instagram app webhook fields', () => {
  it('uses singular messaging_referral (not page plural messaging_referrals)', () => {
    assert.ok(INSTAGRAM_APP_WEBHOOK_FIELDS.includes('messaging_referral'));
    assert.ok(!INSTAGRAM_APP_WEBHOOK_FIELDS.includes('messaging_referrals'));
    assert.ok(INSTAGRAM_APP_WEBHOOK_FIELDS.includes('messages'));
  });
});
