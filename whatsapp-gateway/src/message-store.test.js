/**
 * message-store smoke test — node whatsapp-gateway/src/message-store.test.js
 */
import assert from 'assert';
import { createMessageStore, createMsgRetryCounterCache } from './message-store.js';

async function main() {
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

  // aliasJids: LID + PN aynı içerik (otomatik gönderim retry)
  assert.equal(
    await store.put(
      {
        key: { id: 'ALIAS1', remoteJid: '999888777666555@lid', fromMe: true },
        message: { conversation: 'alias test' },
      },
      {
        coachId: 'coach1',
        aliasJids: ['905551112233@s.whatsapp.net', '999888777666555@lid'],
      }
    ),
    true
  );
  const byPn = await store.getMessage({ id: 'ALIAS1', remoteJid: '905551112233@s.whatsapp.net' });
  assert.equal(byPn.conversation, 'alias test');
  const byLid = await store.getMessage({ id: 'ALIAS1', remoteJid: '999888777666555@lid' });
  assert.equal(byLid.conversation, 'alias test');

  const cache = createMsgRetryCounterCache(1000);
  cache.set('k1', 1);
  assert.equal(cache.get('k1'), 1);
  cache.del('k1');
  assert.equal(cache.get('k1'), undefined);

  const stats = store.stats();
  assert.ok(stats.puts >= 1);
  assert.ok(stats.hits >= 1);
  assert.ok(stats.misses >= 1);

  console.log('message-store.test.js OK', stats);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
