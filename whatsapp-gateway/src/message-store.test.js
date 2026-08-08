/**
 * message-store smoke test — node whatsapp-gateway/src/message-store.test.js
 */
import assert from 'assert';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  createMessageStore,
  createMsgRetryCounterCache,
  MESSAGE_STORE_VERSION,
  normalizeStoredMessage,
} from './message-store.js';

async function main() {
  assert.ok(MESSAGE_STORE_VERSION && MESSAGE_STORE_VERSION.includes('root-pending'));

  const store = createMessageStore({ dataRoot: null, diskEnabled: false, maxEntries: 10, ttlMs: 60_000 });

  const wa = {
    key: { id: 'ABCD1234', remoteJid: '905551112233@s.whatsapp.net', fromMe: true },
    message: { conversation: 'Merhaba test ğüşiöç 🎉' },
  };
  assert.equal(await store.put(wa, { coachId: 'coach1' }), true);

  const got = await store.getMessage({ id: 'ABCD1234', remoteJid: '905551112233@s.whatsapp.net' });
  assert.ok(got);
  assert.equal(got.conversation, 'Merhaba test ğüşiöç 🎉');

  // LID jid ile sorgu — id anahtarı ile bulunmalı (Mesaj bekleniyor retry)
  const gotByIdOnly = await store.getMessage({ id: 'ABCD1234', remoteJid: '123456789012345@lid' });
  assert.ok(gotByIdOnly);
  assert.equal(gotByIdOnly.conversation, 'Merhaba test ğüşiöç 🎉');

  // fallbackText ile boş message
  assert.equal(
    await store.put(
      { key: { id: 'FALLBACK1', remoteJid: '905559998877@s.whatsapp.net', fromMe: true }, message: null },
      { coachId: 'coach1', fallbackText: 'yedek metin' }
    ),
    true
  );
  const fb = await store.getMessage({ id: 'FALLBACK1' });
  assert.equal(fb.conversation, 'yedek metin');

  const miss = await store.getMessage({ id: 'NOPE', remoteJid: '905551112233@s.whatsapp.net' });
  assert.equal(miss, undefined);

  const cache = createMsgRetryCounterCache(1000);
  cache.set('k1', 1);
  assert.equal(cache.get('k1'), 1);
  cache.del('k1');
  assert.equal(cache.get('k1'), undefined);

  assert.equal(normalizeStoredMessage(null, 'x').conversation, 'x');

  // Disk: auth'dan ayrı _msg-cache + preload (QR reset store'u silmesin)
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-msg-store-'));
  try {
    const diskStore = createMessageStore({ dataRoot: tmp, diskEnabled: true, maxEntries: 100, ttlMs: 3600_000 });
    await diskStore.put(
      {
        key: { id: 'DISKMSG1', remoteJid: '905551112233@s.whatsapp.net', fromMe: true },
        message: { conversation: 'disk kalici' },
      },
      { coachId: 'coach-disk' }
    );
    const onDisk = path.join(tmp, '_msg-cache', 'coach-disk', 'DISKMSG1.json');
    await fs.access(onDisk);

    // Yeni store instance = process restart simülasyonu
    const store2 = createMessageStore({ dataRoot: tmp, diskEnabled: true, maxEntries: 100, ttlMs: 3600_000 });
    const loaded = await store2.preload(50);
    assert.ok(loaded >= 1, 'preload should load disk entries');
    const fromPreload = await store2.getMessage({ id: 'DISKMSG1' });
    assert.equal(fromPreload.conversation, 'disk kalici');

    // Auth wipe simülasyonu: coach auth silinse bile _msg-cache kalsın
    await fs.mkdir(path.join(tmp, 'coach-disk'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'coach-disk', 'creds.json'), '{}');
    await fs.rm(path.join(tmp, 'coach-disk'), { recursive: true, force: true });
    const still = await fs.readFile(onDisk, 'utf8');
    assert.ok(JSON.parse(still).message.conversation === 'disk kalici');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }

  const stats = store.stats();
  assert.ok(stats.puts >= 1);
  assert.ok(stats.hits >= 1);
  assert.ok(stats.misses >= 1);
  assert.equal(stats.version, MESSAGE_STORE_VERSION);
  assert.equal(stats.disk_root, '_msg-cache');

  console.log('message-store.test.js OK', stats);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
