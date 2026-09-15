import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CRM_PRESENCE_ONLINE_MS,
  CRM_REPLY_SLA_MS,
  formatReplySlaText,
  isPresenceOnline
} from './crm-live-ops.js';

describe('crm-live-ops helpers', () => {
  it('marks presence online within window', () => {
    const now = Date.now();
    assert.equal(isPresenceOnline(new Date(now - 30_000).toISOString(), now), true);
    assert.equal(isPresenceOnline(new Date(now - CRM_PRESENCE_ONLINE_MS - 1).toISOString(), now), false);
  });

  it('formats SLA WhatsApp text in Turkish', () => {
    const text = formatReplySlaText({
      contactName: 'Ayşe Veli',
      channel: 'instagram',
      waitingMinutes: 6,
      preview: 'Merhaba paket bilgisi',
      panelUrl: 'https://example.com/crm/inbox?c=1'
    });
    assert.match(text, /CRM SLA/);
    assert.match(text, /Ayşe Veli/);
    assert.match(text, /instagram/);
    assert.match(text, /6 dk/);
    assert.equal(CRM_REPLY_SLA_MS, 5 * 60 * 1000);
  });
});
