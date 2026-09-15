import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { graphMessageToMessagingEvent } from './instagram-conversations-sync.js';
import { normalizeInstagramMessagingEvent } from './instagram-messaging-normalize.js';

describe('instagram conversations graph sync', () => {
  it('converts inbound Graph message to messaging event', () => {
    const ev = graphMessageToMessagingEvent(
      {
        id: 'mid.abc',
        message: 'Reklamdan yazıyorum',
        from: { id: 'igsid_lead' },
        created_time: '2026-09-14T21:29:00+0000'
      },
      { igBusinessId: '17841458991434419', pageId: '110916441961573' }
    );
    assert.equal(ev.sender.id, 'igsid_lead');
    assert.equal(ev.message.text, 'Reklamdan yazıyorum');
    const n = normalizeInstagramMessagingEvent(ev);
    assert.equal(n.hasInboundContent, true);
    assert.equal(n.senderId, 'igsid_lead');
  });

  it('skips messages from our IG business id', () => {
    const ev = graphMessageToMessagingEvent(
      {
        id: 'mid.out',
        message: 'Merhaba',
        from: { id: '17841458991434419' },
        created_time: '2026-09-14T21:29:00+0000'
      },
      { igBusinessId: '17841458991434419' }
    );
    assert.equal(ev, null);
  });
});
