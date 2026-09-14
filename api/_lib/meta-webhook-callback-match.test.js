import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

function isOurMetaWebhookCallback(url) {
  const u = String(url || '').toLowerCase();
  if (!u.includes('dersonlinevipkocluk.com')) return false;
  return (
    u.includes('/api/meta/webhook') ||
    u.includes('/api/webhooks/meta') ||
    u.includes('meta/webhook') ||
    u.includes('/api/meta-whatsapp-webhook')
  );
}

describe('Meta app webhook callback matching', () => {
  it('accepts production Instagram callback URL', () => {
    assert.equal(
      isOurMetaWebhookCallback('https://www.dersonlinevipkocluk.com/api/meta/webhook'),
      true
    );
  });

  it('accepts trailing slash on our domain', () => {
    assert.equal(
      isOurMetaWebhookCallback('https://www.dersonlinevipkocluk.com/api/meta/webhook/'),
      true
    );
  });

  it('rejects other domains', () => {
    assert.equal(isOurMetaWebhookCallback('https://example.com/api/meta/webhook'), false);
  });
});
