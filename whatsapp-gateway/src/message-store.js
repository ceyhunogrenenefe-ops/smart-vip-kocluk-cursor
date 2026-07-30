/**
 * Baileys msg-retry için mesaj deposu.
 * getMessage undefined → alıcıda "Mesaj bekleniyor / Waiting for this message".
 * Bellek + isteğe bağlı disk (oturum restart sonrası kısa süre).
 */
import fs from 'fs/promises';
import path from 'path';

const DEFAULT_MAX = Math.min(20_000, Math.max(500, Number(process.env.WA_MSG_STORE_MAX) || 5_000));
const DEFAULT_TTL_MS = Math.min(
  7 * 24 * 3600_000,
  Math.max(60_000, Number(process.env.WA_MSG_STORE_TTL_MS) || 48 * 3600_000)
);
const DISK_ENABLED = String(process.env.WA_MSG_STORE_DISK ?? '1') !== '0';

function bareJid(jid) {
  return String(jid || '').split(':')[0].trim();
}

function cacheKey(id, remoteJid) {
  const mid = String(id || '').trim();
  if (!mid) return '';
  const jid = bareJid(remoteJid);
  return jid ? `${mid}|${jid}` : mid;
}

export function createMessageStore({
  dataRoot,
  maxEntries = DEFAULT_MAX,
  ttlMs = DEFAULT_TTL_MS,
  diskEnabled = DISK_ENABLED,
  logger = null,
} = {}) {
  /** @type {Map<string, { message: object, key: object, savedAt: number, coachId?: string }>} */
  const mem = new Map();
  let hits = 0;
  let misses = 0;
  let puts = 0;

  function diskDir(coachId) {
    return path.join(String(dataRoot || '.'), String(coachId || '_shared'), 'msg-cache');
  }

  function diskFile(coachId, id) {
    const safe = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
    return path.join(diskDir(coachId), `${safe}.json`);
  }

  function pruneExpired() {
    const now = Date.now();
    for (const [k, v] of mem.entries()) {
      if (now - Number(v.savedAt || 0) > ttlMs) mem.delete(k);
    }
    while (mem.size > maxEntries) {
      const first = mem.keys().next().value;
      if (first == null) break;
      mem.delete(first);
    }
  }

  /**
   * @param {object} waMessage - Baileys WAMessage ({ key, message })
   * @param {{ coachId?: string }} [opts]
   */
  async function put(waMessage, opts = {}) {
    const key = waMessage?.key;
    const message = waMessage?.message;
    const id = String(key?.id || '').trim();
    if (!id || !message || typeof message !== 'object') return false;

    const ck = cacheKey(id, key.remoteJid);
    const entry = {
      message,
      key: {
        id,
        remoteJid: key.remoteJid || null,
        fromMe: key.fromMe !== false,
        participant: key.participant || null,
      },
      savedAt: Date.now(),
      coachId: opts.coachId ? String(opts.coachId) : undefined,
    };
    mem.set(ck, entry);
    mem.set(id, entry);
    puts += 1;
    pruneExpired();

    if (diskEnabled && dataRoot && opts.coachId) {
      try {
        await fs.mkdir(diskDir(opts.coachId), { recursive: true });
        await fs.writeFile(diskFile(opts.coachId, id), JSON.stringify(entry));
      } catch (err) {
        logger?.warn?.({ err: err?.message || err }, 'msg-store disk write failed');
      }
    }
    return true;
  }

  async function get(key) {
    const id = String(key?.id || '').trim();
    if (!id) {
      misses += 1;
      return undefined;
    }
    pruneExpired();
    const ck = cacheKey(id, key.remoteJid);
    let entry = mem.get(ck) || mem.get(id);
    if (entry?.message) {
      hits += 1;
      return entry.message;
    }

    if (diskEnabled && dataRoot) {
      try {
        const safe = id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
        const dirs = await fs.readdir(dataRoot, { withFileTypes: true });
        for (const ent of dirs) {
          if (!ent.isDirectory()) continue;
          try {
            const raw = await fs.readFile(path.join(dataRoot, ent.name, 'msg-cache', `${safe}.json`), 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed?.message) {
              mem.set(ck, parsed);
              mem.set(id, parsed);
              hits += 1;
              return parsed.message;
            }
          } catch {
            /* next coach dir */
          }
        }
      } catch {
        /* dataRoot yok */
      }
    }

    misses += 1;
    return undefined;
  }

  /** Baileys getMessage imzası */
  async function getMessage(key) {
    return get(key);
  }

  function stats() {
    return {
      size: mem.size,
      puts,
      hits,
      misses,
      hit_rate: puts || hits || misses ? Number((hits / Math.max(1, hits + misses)).toFixed(3)) : null,
      ttl_ms: ttlMs,
      max_entries: maxEntries,
      disk_enabled: diskEnabled,
    };
  }

  return { put, get, getMessage, stats, pruneExpired };
}

/**
 * Baileys msgRetryCounterCache uyumlu basit TTL map.
 */
export function createMsgRetryCounterCache(ttlMs = 3600_000) {
  /** @type {Map<string, { value: number, exp: number }>} */
  const map = new Map();
  return {
    get(k) {
      const e = map.get(String(k));
      if (!e) return undefined;
      if (Date.now() > e.exp) {
        map.delete(String(k));
        return undefined;
      }
      return e.value;
    },
    set(k, v) {
      map.set(String(k), { value: v, exp: Date.now() + ttlMs });
    },
    del(k) {
      map.delete(String(k));
    },
  };
}
