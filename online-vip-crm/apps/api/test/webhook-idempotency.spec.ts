import { describe, expect, it } from 'vitest';
import {
  buildWebhookIdempotencyKey,
  isDuplicateWebhookEvent,
} from '../src/common/helpers/webhook-idempotency';

describe('webhook idempotency helper', () => {
  it('normalizes provider and externalId', () => {
    expect(buildWebhookIdempotencyKey(' Meta:WhatsApp ', ' evt-1 ')).toEqual({
      provider: 'meta:whatsapp',
      externalId: 'evt-1',
    });
  });

  it('rejects empty provider or externalId', () => {
    expect(() => buildWebhookIdempotencyKey('', 'x')).toThrow(/provider/i);
    expect(() => buildWebhookIdempotencyKey('meta', '  ')).toThrow(/externalId/i);
  });

  it('detects duplicate events', () => {
    expect(isDuplicateWebhookEvent(null)).toBe(false);
    expect(isDuplicateWebhookEvent(undefined)).toBe(false);
    expect(isDuplicateWebhookEvent({ id: 'w1' })).toBe(true);
  });
});
