import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStudentSyncReport, SYNC_STATUS, platformStudentIsActive } from './edesis-student-sync-report.js';

const keysOf = (r) => ({ edesisStudentId: String(r.id), name: r.name, email: r.email || '' });

const students = [
  { id: 'p1', name: 'Ali Kaya', edesis_ogrenci_id: '100', enrollment_status: 'confirmed' },
  { id: 'p2', name: 'Ayşe Demir', edesis_ogrenci_id: '200', enrollment_status: 'confirmed' },
  { id: 'p3', name: 'Can Yıldız', edesis_ogrenci_id: null, enrollment_status: 'confirmed' },
  { id: 'p4', name: 'Deniz Ak', edesis_ogrenci_id: '400', enrollment_status: 'withdrawn' },
  { id: 'p5', name: 'Eda Su', edesis_ogrenci_id: '500', deleted_at: '2026-10-01' },
  { id: 'p6', name: 'Fatih Er', edesis_ogrenci_id: '600', enrollment_status: 'confirmed' }
];
const edesisRows = [
  { id: 100, name: 'Ali Kaya', classroomName: '9-A' },
  { id: 400, name: 'Deniz Ak' },
  { id: 900, name: 'Can Yildiz' }
];

test('her öğrenci tek duruma düşer', () => {
  const lookedUp = new Map([['200', null]]); // 200 tek tek sorgulandı: yok. 600 sorgulanmadı.
  const r = buildStudentSyncReport({
    students,
    edesisRows,
    keysOf,
    lookedUp,
    suggest: (list, { name }) => ({ studentId: /can/i.test(name) ? 'p3' : null, method: 'name' })
  });
  const by = (id) => r.items.find((i) => i.platformStudentId === id);
  assert.equal(by('p1').status, SYNC_STATUS.ok);
  assert.equal(by('p1').edesis.className, '9-A');
  assert.equal(by('p2').status, SYNC_STATUS.deleted);
  assert.equal(by('p2').verified, true);
  assert.equal(by('p6').status, SYNC_STATUS.deleted);
  assert.equal(by('p6').verified, false);
  assert.equal(by('p3').status, SYNC_STATUS.notLinked);
  assert.equal(by('p4').status, SYNC_STATUS.passive);
  assert.equal(by('p5'), undefined, 'pasif ve Edesis’te yok: listelenmez');
  const only = r.items.find((i) => i.status === SYNC_STATUS.edesisOnly);
  assert.equal(only.edesisId, '900');
  assert.equal(only.suggestion.platformStudentId, 'p3');
  assert.equal(r.inSync, false);
});

test('başka dönemde bulunan öğrenci silinmiş sayılmaz', () => {
  const r = buildStudentSyncReport({
    students: [students[1]],
    edesisRows: [],
    keysOf,
    lookedUp: new Map([['200', { className: '10-B' }]]),
    includeEdesisOnly: false
  });
  assert.equal(r.items[0].status, SYNC_STATUS.ok);
  assert.equal(r.items[0].edesis.otherTerm, true);
  assert.equal(r.inSync, true);
});

test('aktiflik', () => {
  assert.equal(platformStudentIsActive({ enrollment_status: 'confirmed' }), true);
  assert.equal(platformStudentIsActive({ enrollment_status: null }), true);
  assert.equal(platformStudentIsActive({ enrollment_status: 'withdrawn' }), false);
  assert.equal(platformStudentIsActive({ deleted_at: 'x' }), false);
});
