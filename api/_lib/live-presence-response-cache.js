/** Kısa TTL — aynı kullanıcının ardışık poll isteklerinde BBB/DB yükünü azaltır. */
const CACHE_MS = Math.max(10_000, Number(process.env.LIVE_PRESENCE_CACHE_MS || 15_000) || 15_000);
const MAX_ENTRIES = 200;

/** @type {Map<string, { at: number, data: object }>} */
const cache = new Map();

function prune() {
  if (cache.size <= MAX_ENTRIES) return;
  const cutoff = Date.now() - CACHE_MS * 3;
  for (const [k, v] of cache.entries()) {
    if (v.at < cutoff) cache.delete(k);
  }
}

export function livePresenceCacheKey(actorId, classIds, idleSeconds) {
  const ids = [...classIds].map(String).sort().join(',');
  return `${String(actorId || '')}:${idleSeconds}:${ids}`;
}

export function getCachedLivePresenceResponse(key) {
  const row = cache.get(key);
  if (!row) return null;
  if (Date.now() - row.at > CACHE_MS) {
    cache.delete(key);
    return null;
  }
  return row.data;
}

export function setCachedLivePresenceResponse(key, data) {
  cache.set(key, { at: Date.now(), data });
  prune();
}
