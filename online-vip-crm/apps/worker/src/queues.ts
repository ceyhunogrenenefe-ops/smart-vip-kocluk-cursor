/** Canonical BullMQ queue names for Online VIP CRM. */
export const QUEUE_NAMES = {
  WEBHOOK_EVENTS: 'webhook-events',
  OUTBOUND_MESSAGES: 'outbound-messages',
  EMAIL_SYNC: 'email-sync',
  NOTIFICATIONS: 'notifications',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const ALL_QUEUE_NAMES: QueueName[] = Object.values(QUEUE_NAMES);

/** Shared default job options: exponential backoff + bounded retries. */
export function defaultJobOptions(maxAttempts: number) {
  return {
    attempts: maxAttempts,
    backoff: {
      type: 'exponential' as const,
      delay: 2_000,
    },
    removeOnComplete: {
      count: 1_000,
      age: 24 * 60 * 60,
    },
    removeOnFail: {
      count: 5_000,
      age: 7 * 24 * 60 * 60,
    },
  };
}
