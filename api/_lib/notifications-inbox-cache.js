const CACHE_MS = Math.max(10_000, Number(process.env.NOTIFICATIONS_INBOX_CACHE_MS || 20_000) || 20_000);
const MAX = 150;

/** @type {Map<string, { at: number, payload: object }>} */
const cache = new Map();

export function getCachedInbox(userId) {
  const key = String(userId || '').trim();
  if (!key) return null;
  const row = cache.get(key);
  if (!row || Date.now() - row.at > CACHE_MS) {
    if (row) cache.delete(key);
    return null;
  }
  return row.payload;
}

export function setCachedInbox(userId, payload) {
  const key = String(userId || '').trim();
  if (!key) return;
  cache.set(key, { at: Date.now(), payload });
  if (cache.size > MAX) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0]?.[0];
    if (oldest) cache.delete(oldest);
  }
}
