import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuickReplies } from './crm-inbox.js';

test('content_type eksikse eklenir — uretimdeki hatanin kaynagi', () => {
  const r = normalizeQuickReplies([{ title: '🔄 Tekrar Kontrol Et', payload: 'x:retry' }]);
  assert.equal(r[0].content_type, 'text', 'content_type olmadan Meta mesaji hic gondermiyor');
  assert.equal(r[0].title, '🔄 Tekrar Kontrol Et');
  assert.equal(r[0].payload, 'x:retry');
});

test('acikca verilen content_type korunur', () => {
  const r = normalizeQuickReplies([{ content_type: 'user_phone_number', title: 'Telefon', payload: 'p' }]);
  assert.equal(r[0].content_type, 'user_phone_number');
});

test('baslik 20 karaktere kirpilir', () => {
  const r = normalizeQuickReplies([{ title: 'A'.repeat(40), payload: 'p' }]);
  assert.equal(r[0].title.length, 20);
});

test('payload yoksa baslik kullanilir', () => {
  assert.equal(normalizeQuickReplies([{ title: 'Evet' }])[0].payload, 'Evet');
});

test('bassiz ogeler atilir, Meta 13 sinirina uyulur', () => {
  const girdi = [{ title: '' }, { payload: 'x' }, null, ...Array.from({ length: 20 }, (_, i) => ({ title: `b${i}` }))];
  const r = normalizeQuickReplies(girdi);
  assert.equal(r.length, 13);
  assert.ok(r.every((q) => q.title && q.content_type));
});

test('dizi olmayan girdi cokmez', () => {
  assert.deepEqual(normalizeQuickReplies(null), []);
  assert.deepEqual(normalizeQuickReplies(undefined), []);
});
