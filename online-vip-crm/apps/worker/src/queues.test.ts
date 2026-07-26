import { describe, expect, it } from 'vitest';
import { ALL_QUEUE_NAMES, QUEUE_NAMES, defaultJobOptions } from './queues';

describe('queues', () => {
  it('exposes the four canonical queue names', () => {
    expect(ALL_QUEUE_NAMES).toEqual([
      QUEUE_NAMES.WEBHOOK_EVENTS,
      QUEUE_NAMES.OUTBOUND_MESSAGES,
      QUEUE_NAMES.EMAIL_SYNC,
      QUEUE_NAMES.NOTIFICATIONS,
    ]);
  });

  it('uses exponential backoff defaults', () => {
    const opts = defaultJobOptions(5);
    expect(opts.attempts).toBe(5);
    expect(opts.backoff).toEqual({ type: 'exponential', delay: 2_000 });
  });
});
