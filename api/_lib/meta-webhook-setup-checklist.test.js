import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMetaWebhookSetupChecklist } from './meta-webhook-setup-checklist.js';

describe('buildMetaWebhookSetupChecklist', () => {
  it('flags Advanced Access as step 4 blocker when conversations capability missing', () => {
    const c = buildMetaWebhookSetupChecklist({
      verifyTokenPresent: true,
      endpointReachable: true,
      appInstagramSubscribed: true,
      appPageSubscribed: true,
      pageSubscribedAppsMessages: true,
      igAccountSubscribedApps: false,
      igDmLikelyCause: 'missing_advanced_access_or_permission',
      igDmCapabilityOk: false,
      hasInstagramManageMessagesScope: true,
      appInstagramFields: ['messages', 'comments']
    });
    assert.equal(c.ok, false);
    assert.equal(c.blocker?.step, 4);
    assert.match(String(c.blocker?.action || ''), /Advanced Access/i);
    assert.ok(c.steps[0].ok && c.steps[1].ok && c.steps[2].ok);
    assert.equal(c.steps[3].ok, false);
  });

  it('passes when capability ok and subscriptions present', () => {
    const c = buildMetaWebhookSetupChecklist({
      verifyTokenPresent: true,
      endpointReachable: true,
      appInstagramSubscribed: true,
      appPageSubscribed: true,
      pageSubscribedAppsMessages: true,
      igDmLikelyCause: 'api_ok_webhook_routing',
      igDmCapabilityOk: true,
      hasInstagramManageMessagesScope: true,
      appInstagramFields: ['messages']
    });
    assert.equal(c.ok, true);
    assert.equal(c.blocker, null);
  });

  it('fails step 2 when app instagram subscription missing', () => {
    const c = buildMetaWebhookSetupChecklist({
      appInstagramSubscribed: false,
      appPageSubscribed: true,
      pageSubscribedAppsMessages: true,
      igDmCapabilityOk: true,
      hasInstagramManageMessagesScope: true
    });
    assert.equal(c.ok, false);
    assert.equal(c.blocker?.step, 2);
  });
});
