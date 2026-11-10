import test from 'node:test';
import assert from 'node:assert/strict';
import { foldPersonName, isSeedAgentName, pickSeedUsers } from './crm-widget-agents.js';

test('temsilci adları yazım farkını yok sayar', () => {
  assert.equal(foldPersonName('CEYHUN ÖĞRENENEFE'), 'ceyhun ogrenenefe');
  assert.equal(foldPersonName('Doğan  Aktürk'), 'dogan akturk');
  assert.equal(foldPersonName('Muzaffer Apaydin'), 'muzaffer apaydin');
  assert.equal(foldPersonName('Sultan Kurt'), 'sultan kurt');
  assert.equal(isSeedAgentName('Sultan Kurt'), true);
  assert.equal(isSeedAgentName('Başka Koç'), false);
});

test('ilk kadro aynı addan kurum eşleşen hesabı seçer', () => {
  const rows = [
    { id: 'a', name: 'Sultan Kurt', institution_id: 'baska', is_active: true },
    { id: 'b', name: 'Sultan Kurt', institution_id: 'vip', is_active: true },
    { id: 'c', name: 'Muzaffer Apaydın', institution_id: null, is_active: true },
    { id: 'd', name: 'Doğan Aktürk', institution_id: 'vip', is_active: false },
    { id: 'e', name: 'Ceyhun Öğrenenefe', institution_id: 'vip', is_active: true },
    { id: 'f', name: 'Ayşe Yılmaz', institution_id: 'vip', is_active: true }
  ];
  const picked = pickSeedUsers(rows, 'vip').map((u) => u.id).sort();
  assert.deepEqual(picked, ['b', 'c', 'e']);
});
