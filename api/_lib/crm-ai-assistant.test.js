import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-key';
const { sanitizeSettingsPatch, splitForChannel, instKey } = await import('./crm-ai-assistant.js');

test('ayar doğrulama: model, düşünme seviyesi, KVKK bağlantısı, sınırlar', () => {
  const row = sanitizeSettingsPatch({
    is_active: 'evet',
    model: 'claude-opus-5-5',
    effort: 'low',
    kvkk_url: 'https://www.onlinevipdershane.com/gizlilik.html',
    site_urls: 'https://www.onlinevipdershane.com/a https://kotu.example.com/b',
    slot_minutes: 5,
    max_bot_replies: 999,
    schedule: { 1: [{ start: '19:00', end: '09:00' }, { start: 'x', end: '10:00' }] }
  });
  assert.equal(row.is_active, false); // yalnız gerçek true açar
  assert.equal(row.slot_minutes, 15);
  assert.equal(row.max_bot_replies, 50);
  assert.deepEqual(row.site_urls, ['https://www.onlinevipdershane.com/a']);
  assert.deepEqual(row.schedule[1], [{ start: '19:00', end: '09:00' }]);
  assert.deepEqual(row.schedule[7], []);
  assert.throws(() => sanitizeSettingsPatch({ model: 'gpt-4o' }), /Geçersiz model/);
  assert.throws(() => sanitizeSettingsPatch({ effort: 'max' }), /düşünme/);
  assert.throws(() => sanitizeSettingsPatch({ kvkk_url: 'http://x.com' }), /https/);
});

test('Instagram için uzun yanıt bölünür, WhatsApp tek parça', () => {
  const long = Array.from({ length: 30 }, (_, i) => `Satır ${i} ${'x'.repeat(40)}`).join('\n');
  const ig = splitForChannel(long, 'instagram');
  assert.ok(ig.length >= 2);
  assert.ok(ig.every((p) => p.length <= 950));
  assert.equal(ig.join('\n').replace(/\s+/g, ''), long.replace(/\s+/g, ''));
  assert.equal(splitForChannel(long, 'whatsapp').length, 1);
});

test('kurum anahtarı: boşsa platform kurumu', () => {
  assert.equal(instKey(''), '73323d75-eea1-4552-8bba-d50555423589');
  assert.equal(instKey('abc'), 'abc');
});
