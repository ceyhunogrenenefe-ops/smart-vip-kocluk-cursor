import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanGuestDisplayName,
  detectGuestNames,
  guestNormalizedName,
  guestSourceLabel,
  guestStatusLabel,
  guestVisitStats,
  isGuestSource,
  isGuestStatus,
  minutesPresent,
  sessionDurationMinutes
} from './class-session-guest-core.js';

const roster = [
  { id: 's1', name: 'Ahmet Yılmaz' },
  { id: 's2', name: 'Ayşe Demir' },
  { id: 's3', name: 'Mehmet Çelik' }
];

test('kayıtlı öğrenciler misafir sayılmaz', () => {
  const guests = detectGuestNames(['Ahmet Yılmaz', 'Ayşe Demir'], roster);
  assert.deepEqual(guests, []);
});

test('listede olmayan ad muhtemel misafir olur', () => {
  const guests = detectGuestNames(['Ahmet Yılmaz', 'Zeynep Kaya'], roster);
  assert.equal(guests.length, 1);
  assert.equal(guests[0].display_name, 'Zeynep Kaya');
});

test('Türkçe karakter ve büyük/küçük harf farkı misafir üretmez', () => {
  // Öğrenci adını farklı yazmış olabilir; yanlışlıkla misafir sayılmamalı
  const guests = detectGuestNames(['AYSE DEMIR', 'mehmet celik'], roster);
  assert.deepEqual(guests, []);
});

test('öğretmen/moderatör adı misafir sayılmaz', () => {
  const guests = detectGuestNames(['Ahmet Yılmaz', 'Doğan Aktürk'], roster, ['Doğan Aktürk']);
  assert.deepEqual(guests, []);
});

test('aynı misafir listede iki kez görünse tek satır olur', () => {
  const guests = detectGuestNames(['Zeynep Kaya', 'zeynep kaya', 'ZEYNEP KAYA'], roster);
  assert.equal(guests.length, 1);
});

test('boş ve anlamsız adlar atlanır', () => {
  const guests = detectGuestNames(['', '   ', '!!!', 'Zeynep'], roster);
  assert.equal(guests.length, 1);
  assert.equal(guests[0].display_name, 'Zeynep');
});

test('katılımcı yoksa boş liste, roster boşsa herkes misafir adayı', () => {
  assert.deepEqual(detectGuestNames([], roster), []);
  assert.deepEqual(detectGuestNames(null, roster), []);
  const guests = detectGuestNames(['Zeynep Kaya', 'Ali Veli'], []);
  assert.equal(guests.length, 2);
});

test('ekran adındaki ek açıklama temizlenir', () => {
  assert.equal(cleanGuestDisplayName('  Zeynep Kaya  '), 'Zeynep Kaya');
  assert.ok(guestNormalizedName('Zeynep KAYA').length > 0);
  assert.equal(guestNormalizedName('Zeynep KAYA'), guestNormalizedName('zeynep kaya'));
});

test('durum ve kaynak doğrulaması', () => {
  assert.ok(isGuestStatus('suspected'));
  assert.ok(isGuestStatus('confirmed'));
  assert.ok(isGuestStatus('dismissed'));
  assert.ok(!isGuestStatus('uydurma'));
  assert.ok(isGuestSource('teacher'));
  assert.ok(isGuestSource('trial'));
  assert.ok(!isGuestSource('bilinmeyen'));
  assert.equal(guestStatusLabel('confirmed'), 'Misafir Öğrenci');
  assert.equal(guestSourceLabel('admin'), 'Yönetici ekledi');
});

test('kaç misafir derse katıldığı sayılır, aynı ders iki kez sayılmaz', () => {
  const stats = guestVisitStats([
    { normalized_name: 'zeynep kaya', session_id: 'a', status: 'confirmed' },
    { normalized_name: 'zeynep kaya', session_id: 'a', status: 'confirmed' },
    { normalized_name: 'zeynep kaya', session_id: 'b', status: 'suspected' },
    { normalized_name: 'ali veli', session_id: 'a', status: 'confirmed' }
  ]);
  assert.equal(stats.get('zeynep kaya').visits, 2);
  assert.equal(stats.get('ali veli').visits, 1);
});

test('misafir değil denilen kayıt geçmişe sayılmaz', () => {
  const stats = guestVisitStats([
    { normalized_name: 'zeynep kaya', session_id: 'a', status: 'dismissed' },
    { normalized_name: 'zeynep kaya', session_id: 'b', status: 'confirmed' }
  ]);
  assert.equal(stats.get('zeynep kaya').visits, 1);
});

test('ders süresi başlangıç-bitişten çıkar', () => {
  assert.equal(sessionDurationMinutes({ start_time: '18:00:00', end_time: '19:20:00' }), 80);
  assert.equal(sessionDurationMinutes({ start_time: '18:00', end_time: '18:40' }), 40);
  assert.equal(sessionDurationMinutes({ start_time: '19:00', end_time: '18:00' }), null);
  assert.equal(sessionDurationMinutes({}), null);
});

test('derste kalma süresi ders süresini aşamaz', () => {
  const session = { start_time: '18:00:00', end_time: '19:20:00' };
  assert.equal(
    minutesPresent('2026-10-07T15:00:00Z', '2026-10-07T15:30:00Z', session),
    30
  );
  // Yoklama uzun süre açık kalmışsa ders süresiyle sınırlanır
  assert.equal(
    minutesPresent('2026-10-07T15:00:00Z', '2026-10-07T20:00:00Z', session),
    80
  );
  assert.equal(minutesPresent('bozuk', '2026-10-07T15:30:00Z', session), null);
  assert.equal(minutesPresent('2026-10-07T15:30:00Z', '2026-10-07T15:00:00Z', session), null);
});
