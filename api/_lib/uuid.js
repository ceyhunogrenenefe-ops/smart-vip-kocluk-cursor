import { randomUUID } from 'crypto';

/** Postgres UUID tipi bekleniyorsa: geçerli değilse yeni UUID üretir (örn. `coach-123` frontend id'leri için). */
export function normalizeUuidOrGenerate(desired) {
  const s = desired == null ? '' : String(desired).trim();
  const ok =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
  if (ok) return s;
  return randomUUID();
}

export function isUuid(value) {
  const s = value == null ? '' : String(value).trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}
