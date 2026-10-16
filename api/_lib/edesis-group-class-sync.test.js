import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeOfPlatformClass, letterOfPlatformClass, matchEdesisRoomForClass } from './edesis-group-class-sync.js';

const rooms = [
  { id: 1, name: 'A', gradeName: '9' },
  { id: 2, name: 'A', gradeName: '10' },
  { id: 3, name: 'A', gradeName: '11' },
  { id: 4, name: 'B', gradeName: '11' },
  { id: 5, name: 'YILDIZLAR YKS', gradeName: '12' },
  { id: 6, name: 'A', gradeName: '10Y' },
  { id: 7, name: 'KAYIT SİLEN', gradeName: '11' }
];

test('sınıf seviyesi ve şube harfi', () => {
  assert.equal(gradeOfPlatformClass({ name: '2026-2027 10 A SINIFI', class_level: '10' }), '10');
  assert.equal(letterOfPlatformClass({ name: '2026-2027 10 A SINIFI', class_level: '10' }), 'A');
  assert.equal(letterOfPlatformClass({ name: '2026-2027 DÖNEM 9-A SINIFI', class_level: '9' }), 'A');
  assert.equal(letterOfPlatformClass({ name: '2026-2027 11 B SINIFI', class_level: '11' }), 'B');
  assert.equal(letterOfPlatformClass({ name: '9.SINIF MATEMATİK', class_level: '9' }), '');
  assert.equal(gradeOfPlatformClass({ name: '2026-2027 YILDIZLAR YKS GRUBU', class_level: 'YKS SAYISAL' }), '12');
  assert.equal(gradeOfPlatformClass({ name: '8A', class_level: 'LGS' }), '');
});

test('şube eşleme', () => {
  assert.equal(matchEdesisRoomForClass({ name: '2026-2027 10 A SINIFI', class_level: '10' }, rooms).room.id, 2);
  assert.equal(matchEdesisRoomForClass({ name: '2026-2027 11 B SINIFI', class_level: '11' }, rooms).room.id, 4);
  assert.equal(matchEdesisRoomForClass({ name: '2026-2027 DÖNEM 9-A SINIFI', class_level: '9' }, rooms).room.id, 1);
  assert.equal(matchEdesisRoomForClass({ name: '9.SINIF MATEMATİK', class_level: '9' }, rooms).room.id, 1);
  assert.equal(matchEdesisRoomForClass({ name: '2026-2027 YILDIZLAR YKS GRUBU', class_level: 'YKS SAYISAL', branch: 'A' }, rooms).room.id, 5);
  // yaz şubesine (10Y) asla eşlenmez
  assert.notEqual(matchEdesisRoomForClass({ name: '2026-2027 10 A SINIFI', class_level: '10' }, rooms).room.id, 6);
});
