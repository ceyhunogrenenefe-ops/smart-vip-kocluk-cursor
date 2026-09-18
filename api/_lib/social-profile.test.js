import test from 'node:test';
import assert from 'node:assert/strict';

test('socialDisplayName: ad → @kullanıcı → kanal + son 4 hane', async () => {
  process.env.SUPABASE_URL ||= 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'x';
  const { socialDisplayName, isPlaceholderName } = await import('./social-profile.js');
  assert.equal(socialDisplayName({ name: 'Ahmet Yılmaz', username: 'ahmet', channel: 'instagram', id: '1784' }), 'Ahmet Yılmaz');
  assert.equal(socialDisplayName({ name: null, username: 'ahmet', channel: 'instagram', id: '1' }), '@ahmet');
  assert.equal(socialDisplayName({ name: 'Instagram Lead', username: '@ayse', channel: 'instagram' }), '@ayse');
  assert.equal(socialDisplayName({ name: '', username: '', channel: 'instagram', id: '17841400001234' }), 'Instagram kullanıcısı ·…1234');
  assert.equal(socialDisplayName({ channel: 'facebook', id: 'fb:998877' }), 'Facebook kullanıcısı ·…8877');
  assert.ok(isPlaceholderName('Instagram Lead'));
  assert.ok(isPlaceholderName('17841412345678'));
  assert.ok(isPlaceholderName(''));
  assert.ok(!isPlaceholderName('Ayşe Kaya'));
  assert.ok(!isPlaceholderName('@ayse'));
});
