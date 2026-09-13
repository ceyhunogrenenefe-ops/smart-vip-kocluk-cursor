import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePageIdFromIdentity, DEFAULT_META_CONFIGURATION_ID } from './meta-social-inbound.js';

describe('resolvePageIdFromIdentity', () => {
  it('prefers /me/accounts page over env user id', () => {
    const pageId = resolvePageIdFromIdentity({
      envPageId: '1113510427914650',
      meId: '1113510427914650',
      accountIds: ['109876543210', '']
    });
    assert.equal(pageId, '109876543210');
  });

  it('rejects login config id and matching user id', () => {
    assert.equal(
      resolvePageIdFromIdentity({
        envPageId: DEFAULT_META_CONFIGURATION_ID,
        meId: '111',
        accountIds: []
      }),
      ''
    );
    assert.equal(
      resolvePageIdFromIdentity({
        envPageId: '111',
        meId: '111',
        accountIds: []
      }),
      ''
    );
  });
});
