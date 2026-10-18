/**
 * Idempotent webhook event key helper.
 * Unique constraint in schema: @@unique([provider, externalEventId])
 */
export function buildWebhookIdempotencyKey(
  provider: string,
  externalId: string,
): { provider: string; externalId: string } {
  if (!provider?.trim()) {
    throw new Error('Webhook provider is required');
  }
  if (!externalId?.trim()) {
    throw new Error('Webhook externalId is required');
  }
  return {
    provider: provider.trim().toUpperCase(),
    externalId: externalId.trim(),
  };
}

/**
 * Decide whether an existing row means duplicate (idempotent skip).
 */
export function isDuplicateWebhookEvent(
  existing: { id: string } | null | undefined,
): existing is { id: string } {
  return Boolean(existing?.id);
}

/** Prefer external id; fall back to payload hash for events without an id. */
export function resolveWebhookExternalId(
  externalEventId: string | null | undefined,
  payloadHash: string,
): string {
  if (externalEventId?.trim()) {
    return externalEventId.trim();
  }
  return `hash:${payloadHash}`;
}
