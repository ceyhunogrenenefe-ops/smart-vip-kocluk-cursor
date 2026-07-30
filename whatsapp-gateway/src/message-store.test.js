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

  const miss = await store.getMessage({ id: 'NOPE', remoteJid: '905551112233@s.whatsapp.net' });
  assert.equal(miss, undefined);

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
