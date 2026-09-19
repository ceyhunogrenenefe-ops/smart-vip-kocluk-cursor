/** FAZ 6 — SLA seviyesi ve cevap bekleme dönemleri */
import assert from 'node:assert/strict';
import { slaLevel, responseEpisodes, istanbulDayStart, isAdConversation } from './crm-sales-board.js';

assert.equal(slaLevel(0), 'green');
assert.equal(slaLevel(4.9), 'green');
assert.equal(slaLevel(5), 'yellow');
assert.equal(slaLevel(14), 'yellow');
assert.equal(slaLevel(15), 'orange');
assert.equal(slaLevel(29), 'orange');
assert.equal(slaLevel(30), 'red');
assert.equal(slaLevel(600), 'red');

const t = (min) => new Date(Date.UTC(2026, 8, 19, 9, min)).toISOString();

// Müşteri 2 mesaj atar, temsilci 7 dk sonra cevaplar, müşteri tekrar yazar → yeniden bekliyor
{
  const { episodes, waitingSince } = responseEpisodes([
    { sender_type: 'lead', created_at: t(0) },
    { sender_type: 'lead', created_at: t(3) },
    { sender_type: 'agent', created_at: t(7) },
    { sender_type: 'agent', created_at: t(8) },
    { sender_type: 'lead', created_at: t(20) }
  ]);
  assert.equal(episodes.length, 2);
  assert.equal((episodes[0].end - episodes[0].start) / 60000, 7, 'ilk mesajdan cevaba kadar ölçülür');
  assert.equal(episodes[1].end, null);
  assert.equal(waitingSince, new Date(t(20)).getTime());
}

// Son mesaj temsilcideyse bekleyen yok; yalnız temsilci mesajı dönem açmaz
{
  const { episodes, waitingSince } = responseEpisodes([
    { sender_type: 'agent', created_at: t(0) },
    { sender_type: 'lead', created_at: t(1) },
    { sender_type: 'agent', created_at: t(2) }
  ]);
  assert.equal(waitingSince, null);
  assert.equal(episodes.length, 1);
}
assert.deepEqual(responseEpisodes([]), { episodes: [], waitingSince: null });

// İstanbul günü: UTC 22:30 (18 Eyl) → İstanbul 19 Eyl 01:30; gün başı 18 Eyl 21:00 UTC
assert.equal(
  new Date(istanbulDayStart(Date.UTC(2026, 8, 18, 22, 30))).toISOString(),
  '2026-09-18T21:00:00.000Z'
);

assert.equal(isAdConversation({ ad_source_data: { ad_id: '1' } }), true);
assert.equal(isAdConversation({ ad_source_data: { ctwa_clid: 'x' } }), true);
assert.equal(isAdConversation({ ad_source_data: { username: 'x' } }), false);
assert.equal(isAdConversation({ ad_source_data: null }), false);

console.log('crm-sales-board: ok');
