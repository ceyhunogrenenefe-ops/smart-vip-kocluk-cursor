const CACHE_MS = Math.max(30_000, Number(process.env.INSTITUTIONS_LIST_CACHE_MS || 45_000) || 45_000);

/** @type {Map<string, { at: number, data: unknown }>} */
const cache = new Map();

export function getInstitutionsCache(key) {
  const row = cache.get(key);
  if (!row || Date.now() - row.at > CACHE_MS) {
    if (row) cache.delete(key);
    return null;
  }
  return row.data;
}

export function setInstitutionsCache(key, data) {
  cache.set(key, { at: Date.now(), data });
  if (cache.size > 80) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0]?.[0];
    if (oldest) cache.delete(oldest);
  }
}
