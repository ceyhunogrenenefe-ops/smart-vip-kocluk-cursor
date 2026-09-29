import { createHash } from 'node:crypto';

/**
 * Stable SHA-256 hex digest of a payload for webhook deduplication.
 * Objects are JSON-stringified with sorted keys for determinism.
 */
export function hashPayload(payload: unknown): string {
  const serialized =
    typeof payload === 'string'
      ? payload
      : JSON.stringify(payload, (_key, value) => {
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            return Object.keys(value as Record<string, unknown>)
              .sort()
              .reduce<Record<string, unknown>>((acc, k) => {
                acc[k] = (value as Record<string, unknown>)[k];
                return acc;
              }, {});
          }
          return value;
        });

  return createHash('sha256').update(serialized ?? '').digest('hex');
}
