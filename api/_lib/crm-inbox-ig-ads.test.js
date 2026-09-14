import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractAdSourceData } from './crm-inbox.js';
import { normalizeInstagramMessagingEvent } from './instagram-messaging-normalize.js';

describe('crm ig ads extract + normalize bridge', () => {
  it('extracts nested message.referral ad metadata for instagram', () => {
    const data = extractAdSourceData({
      channel: 'instagram',
      messagingEvent: {
        sender: { id: 'u1' },
        message: {
          mid: 'm1',
          text: 'Merhaba',
          referral: {
            source: 'ADS',
            ad_id: 'ad77',
            ads_context_data: { ad_title: 'VIP LGS' }
          }
        }
      }
    });
    assert.equal(data?.source_type, 'ad_dm');
    assert.equal(data?.source_platform, 'instagram');
    assert.equal(data?.source, 'instagram_ad');
    assert.equal(data?.ad_id, 'ad77');
    assert.equal(data?.headline, 'VIP LGS');
  });

  it('normalize accepts referral-only ads open so CRM sync would not skip', () => {
    const norm = normalizeInstagramMessagingEvent({
      sender: { id: 'u2' },
      timestamp: 1700000000000,
      referral: { source: 'ADS', type: 'OPEN_THREAD', ad_id: 'ad9' }
    });
    assert.equal(norm.hasInboundContent, true);
    assert.ok(norm.messageId);
    assert.match(norm.text, /reklam/i);
  });
});
