import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectEntryMessagingEvents,
  getMessagingReferral,
  isAdsReferral,
  normalizeInstagramMessagingEvent,
  resolveSocialChannelFromWebhook
} from './instagram-messaging-normalize.js';

describe('instagram messaging normalize (ads + standby)', () => {
  it('keeps organic DM text', () => {
    const n = normalizeInstagramMessagingEvent({
      sender: { id: 'ig1' },
      timestamp: 1,
      message: { mid: 'm1', text: 'Merhaba' }
    });
    assert.equal(n.hasInboundContent, true);
    assert.equal(n.text, 'Merhaba');
    assert.equal(n.isAd, false);
  });

  it('accepts ads OPEN_THREAD referral without message body', () => {
    const n = normalizeInstagramMessagingEvent({
      sender: { id: 'ig2' },
      timestamp: 2,
      referral: {
        source: 'ADS',
        type: 'OPEN_THREAD',
        ad_id: 'ad123',
        ads_context_data: { ad_title: 'YKS Kampanya' }
      }
    });
    assert.equal(n.hasInboundContent, true);
    assert.equal(n.isAd, true);
    assert.match(String(n.text), /reklam/i);
    assert.match(String(n.text), /YKS Kampanya/);
    assert.ok(String(n.messageId).includes('ad123'));
  });

  it('reads nested message.referral for ads metadata', () => {
    const ref = getMessagingReferral({
      sender: { id: 'ig3' },
      message: {
        mid: 'm3',
        text: 'Bilgi alabilir miyim?',
        referral: { source: 'ADS', ad_id: '99', ads_context_data: { ad_title: 'LGS' } }
      }
    });
    assert.equal(isAdsReferral(ref), true);
    assert.equal(ref.ad_id, '99');
  });

  it('merges standby with messaging', () => {
    const events = collectEntryMessagingEvents({
      messaging: [{ sender: { id: 'a' }, message: { text: '1' } }],
      standby: [{ sender: { id: 'b' }, referral: { source: 'ADS', ad_id: 'x' } }]
    });
    assert.equal(events.length, 2);
  });

  it('routes page recipient by IG business vs Page id (ads stay on correct channel)', () => {
    assert.equal(
      resolveSocialChannelFromWebhook({
        objectType: 'page',
        igBusinessId: '555',
        event: { recipient: { id: '555' }, message: { text: 'hi' } }
      }),
      'instagram'
    );
    // Facebook Click-to-Messenger ad on page — must NOT be forced to instagram
    assert.equal(
      resolveSocialChannelFromWebhook({
        objectType: 'page',
        pageId: 'page1',
        event: {
          sender: { id: 'u' },
          recipient: { id: 'page1' },
          referral: { source: 'ADS', ad_id: '1' }
        }
      }),
      'facebook'
    );
    assert.equal(
      resolveSocialChannelFromWebhook({
        objectType: 'page',
        event: { recipient: { id: 'page1' }, message: { text: 'fb' } }
      }),
      'facebook'
    );
  });
});
