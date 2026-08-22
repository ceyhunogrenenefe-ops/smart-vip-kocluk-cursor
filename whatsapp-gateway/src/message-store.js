/**
 * Baileys msg-retry için mesaj deposu.
 * getMessage undefined → alıcıda "Mesaj bekleniyor / Waiting for this message".
 *
 * Disk: {dataRoot}/_msg-cache/{coachId}/  — auth klasöründen AYRI (QR reset store'u silmesin)
 * Bellek: id + id|jid indeksi + son 256 LRU (Baileys TODO karşılığı)
 */
import fs from 'fs/promises';
import path from 'path';

export const MESSAGE_STORE_VERSION = '2026-08-04-root-pending';

const DEFAULT_MAX = Math.min(20_000, Math.max(500, Number(process.env.WA_MSG_STORE_MAX) || 8_000));
/** Disk/bellek TTL — WhatsApp retry günlerce sürebilir; varsayılan 14 gün */
const DEFAULT_TTL_MS = Math.min(
  21 * 24 * 3600_000,
  Math.max(60_000, Number(process.env.WA_MSG_STORE_TTL_MS) || 14 * 24 * 3600_000)
);
const DISK_ENABLED = String(process.env.WA_MSG_STORE_DISK ?? '1') !== '0';
const RECENT_LRU = Math.min(512, Math.max(64, Number(process.env.WA_MSG_STORE_RECENT) || 256));

function bareJid(jid) {
  return String(jid || '').split(':')[0].trim();
}

function cacheKey(id, remoteJid) {
  const mid = String(id || '').trim();
  if (!mid) return '';
  const jid = bareJid(remoteJid);
  return jid ? `${mid}|${jid}` : mid;
}

function safeId(id) {
  return String(id || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 120);
}

/** Baileys IMessage — conversation / extendedText zorunlu alanları koru */
export function normalizeStoredMessage(message, fallbackText = '') {
  if (message && typeof message === 'object') {
    if (typeof message.conversation === 'string' && message.conversation.length) return message;
    if (message.extendedTextMessage?.text) return message;
    if (
      message.imageMessage ||
      message.videoMessage ||
      message.documentMessage ||
      message.audioMessage
    ) {
      return message;
    }
  }
  const text = String(fallbackText || '').trim();
  if (text) return { conversation: text };
  return message && typeof message === 'object' ? message : undefined;
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
  /** Unique message entries for eviction (not index keys) */
  /** @type {Map<string, { message: object, key: object, savedAt: number, coachId?: string }>} */
  const byId = new Map();
  /** @type {string[]} */
  const recentOrder = [];
  let hits = 0;
  let misses = 0;
  let puts = 0;
  let diskHits = 0;
  let lastMissAt = null;
  let lastMissId = null;

  function cacheRoot() {
    return path.join(String(dataRoot || '.'), '_msg-cache');
  }

  function diskDir(coachId) {
    return path.join(cacheRoot(), String(coachId || '_shared'));
  }

  function diskFile(coachId, id) {
    return path.join(diskDir(coachId), `${safeId(id)}.json`);
  }

  function touchRecent(id) {
    const mid = String(id || '').trim();
    if (!mid) return;
    const ix = recentOrder.indexOf(mid);
    if (ix >= 0) recentOrder.splice(ix, 1);
    recentOrder.push(mid);
    while (recentOrder.length > RECENT_LRU) recentOrder.shift();
  }

  function pruneExpired() {
    const now = Date.now();
    for (const [id, v] of byId.entries()) {
      if (now - Number(v.savedAt || 0) > ttlMs) {
        byId.delete(id);
        mem.delete(id);
        const jid = bareJid(v.key?.remoteJid);
        if (jid) mem.delete(cacheKey(id, jid));
      }
    }
    while (byId.size > maxEntries) {
      // Prefer evicting oldest non-recent
      let victim = null;
      for (const id of byId.keys()) {
        if (!recentOrder.includes(id)) {
          victim = id;
          break;
        }
      }
      if (!victim) victim = byId.keys().next().value;
      if (victim == null) break;
      const v = byId.get(victim);
      byId.delete(victim);
      mem.delete(victim);
      const jid = bareJid(v?.key?.remoteJid);
      if (jid) mem.delete(cacheKey(victim, jid));
    }
  }

  function indexEntry(entry) {
    const id = String(entry?.key?.id || '').trim();
    if (!id || !entry?.message) return;
    byId.set(id, entry);
    mem.set(id, entry);
    const jid = bareJid(entry.key?.remoteJid);
    if (jid) mem.set(cacheKey(id, jid), entry);
    touchRecent(id);
  }

  /**
   * @param {object} waMessage - Baileys WAMessage ({ key, message })
   * @param {{ coachId?: string, fallbackText?: string }} [opts]
   */
  async function put(waMessage, opts = {}) {
    const key = waMessage?.key;
    const id = String(key?.id || '').trim();
    if (!id) return false;

    const message = normalizeStoredMessage(waMessage?.message, opts.fallbackText);
    if (!message || typeof message !== 'object') return false;

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
    indexEntry(entry);
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

  async function getFromDisk(id) {
    if (!diskEnabled || !dataRoot) return undefined;
    const safe = safeId(id);
    try {
      // Prefer known coach dirs under _msg-cache
      const root = cacheRoot();
      let dirs = [];
      try {
        dirs = await fs.readdir(root, { withFileTypes: true });
      } catch {
        dirs = [];
      }
      for (const ent of dirs) {
        if (!ent.isDirectory()) continue;
        try {
          const raw = await fs.readFile(path.join(root, ent.name, `${safe}.json`), 'utf8');
          const parsed = JSON.parse(raw);
          if (parsed?.message) {
            indexEntry(parsed);
            diskHits += 1;
            return parsed.message;
          }
        } catch {
          /* next */
        }
      }
      // Legacy path: {dataRoot}/{coachId}/msg-cache/ (auth yanında eski konum)
      try {
        const legacyDirs = await fs.readdir(dataRoot, { withFileTypes: true });
        for (const ent of legacyDirs) {
          if (!ent.isDirectory() || ent.name.startsWith('_')) continue;
          try {
            const raw = await fs.readFile(
              path.join(dataRoot, ent.name, 'msg-cache', `${safe}.json`),
              'utf8'
            );
            const parsed = JSON.parse(raw);
            if (parsed?.message) {
              indexEntry(parsed);
              diskHits += 1;
              // migrate to new location
              if (parsed.coachId || ent.name) {
                const cid = parsed.coachId || ent.name;
                try {
                  await fs.mkdir(diskDir(cid), { recursive: true });
                  await fs.writeFile(diskFile(cid, id), JSON.stringify(parsed));
                } catch {
                  /* ignore migrate */
                }
              }
              return parsed.message;
            }
          } catch {
            /* next */
          }
        }
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }
    return undefined;
  }

  async function get(key) {
    const id = String(key?.id || '').trim();
    if (!id) {
      misses += 1;
      lastMissAt = new Date().toISOString();
      return undefined;
    }
    pruneExpired();
    const ck = cacheKey(id, key.remoteJid);
    let entry = (ck && mem.get(ck)) || mem.get(id) || byId.get(id);
    if (entry?.message) {
      hits += 1;
      touchRecent(id);
      return entry.message;
    }

    const fromDisk = await getFromDisk(id);
    if (fromDisk) {
      hits += 1;
      return fromDisk;
    }

    misses += 1;
    lastMissAt = new Date().toISOString();
    lastMissId = id.slice(0, 16);
    logger?.warn?.(
      {
        id: lastMissId,
        remoteJid: key?.remoteJid ? String(key.remoteJid).slice(0, 40) : null,
        isLid: String(key?.remoteJid || '').includes('@lid'),
      },
      'msg-store getMessage MISS — alıcıda Mesaj bekleniyor riski'
    );
    return undefined;
  }

  /** Baileys getMessage imzası */
  async function getMessage(key) {
    return get(key);
  }

  /** Startup: son dosyaları belleğe al */
  async function preload(limit = 400) {
    if (!diskEnabled || !dataRoot) return 0;
    let loaded = 0;
    try {
      await fs.mkdir(cacheRoot(), { recursive: true });
      const dirs = await fs.readdir(cacheRoot(), { withFileTypes: true });
      const files = [];
      for (const ent of dirs) {
        if (!ent.isDirectory()) continue;
        try {
          const names = await fs.readdir(path.join(cacheRoot(), ent.name));
          for (const n of names) {
            if (!n.endsWith('.json')) continue;
            files.push(path.join(cacheRoot(), ent.name, n));
          }
        } catch {
          /* next */
        }
      }
      // Newest first by mtime
      const withStat = [];
      for (const f of files) {
        try {
          const st = await fs.stat(f);
          withStat.push({ f, mtime: st.mtimeMs });
        } catch {
          /* skip */
        }
      }
      withStat.sort((a, b) => b.mtime - a.mtime);
      for (const { f } of withStat.slice(0, limit)) {
        try {
          const parsed = JSON.parse(await fs.readFile(f, 'utf8'));
          if (parsed?.message && parsed?.key?.id) {
            indexEntry(parsed);
            loaded += 1;
          }
        } catch {
          /* skip */
        }
      }
    } catch (err) {
      logger?.warn?.({ err: err?.message || err }, 'msg-store preload failed');
    }
    return loaded;
  }

  function stats() {
    return {
      version: MESSAGE_STORE_VERSION,
      size: byId.size,
      index_keys: mem.size,
      puts,
      hits,
      misses,
      disk_hits: diskHits,
      hit_rate: hits + misses ? Number((hits / Math.max(1, hits + misses)).toFixed(3)) : null,
      ttl_ms: ttlMs,
      max_entries: maxEntries,
      recent_lru: RECENT_LRU,
      disk_enabled: diskEnabled,
      disk_root: '_msg-cache',
      last_miss_at: lastMissAt,
      last_miss_id: lastMissId,
    };
  }

  return { put, get, getMessage, stats, pruneExpired, preload, MESSAGE_STORE_VERSION };
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
