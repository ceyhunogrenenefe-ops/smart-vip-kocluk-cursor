import test from 'node:test';
import assert from 'node:assert/strict';
import { raporuOlustur } from '../yazili-hazirlik-rapor.js';

const temel = {
  institutions: [
    { id: 'k1', name: 'Online VIP' },
    { id: 'k2', name: 'B Kurumu' }
  ],
  classes: [
    { id: 'c1', name: '9-A', institution_id: 'k1' },
    { id: 'c2', name: '10-B', institution_id: 'k1' },
    { id: 'c3', name: '7-A', institution_id: 'k2' }
  ],
  classTeachers: [
    { class_id: 'c1', teacher_id: 't1' },
    { class_id: 'c2', teacher_id: 't1' },
    { class_id: 'c1', teacher_id: 't2' },
    { class_id: 'c3', teacher_id: 't3' },
    { class_id: 'c3', teacher_id: 'pasif' }
  ],
  users: [
    { id: 't1', name: 'Ayşe' },
    { id: 't2', name: 'Mehmet' },
    { id: 't3', name: 'Zeynep' },
    { id: 'pasif', name: 'Eski', is_active: false }
  ],
  files: [
    { id: 'f1', class_id: 'c1', teacher_user_id: 't1', subject: 'Biyoloji', donem: 1, yazili: 1, calisma: 1, file_name: 'a.pdf', updated_at: '2026-10-21T10:00:00Z' },
    { id: 'f2', class_id: 'c1', teacher_user_id: 't1', subject: 'Biyoloji', donem: 1, yazili: 1, calisma: 2, file_name: 'b.pdf', updated_at: '2026-10-21T12:00:00Z' },
    { id: 'f3', class_id: 'c2', teacher_user_id: 't1', subject: 'Kimya', donem: 2, yazili: 1, calisma: 1, file_name: 'c.pdf', updated_at: '2026-10-20T09:00:00Z' }
  ]
};

test('ogretmen basina toplam, ders ve donem/yazili dagilimi', () => {
  const r = raporuOlustur(temel);
  const ayse = r.teachers.find((t) => t.teacher_id === 't1');
  assert.equal(ayse.total, 3);
  assert.deepEqual(ayse.subjects, ['Biyoloji', 'Kimya']);
  assert.deepEqual(ayse.classes, ['10-B', '9-A']);
  assert.deepEqual(ayse.by_slot, { '1-1': 2, '1-2': 0, '2-1': 1, '2-2': 0 });
  assert.equal(ayse.last_upload, '2026-10-21T12:00:00Z');
});

test('hic yuklemeyen atanmis ogretmen 0 ile listelenir, pasif kullanici listelenmez', () => {
  const r = raporuOlustur(temel);
  const mehmet = r.teachers.find((t) => t.teacher_id === 't2');
  assert.equal(mehmet.total, 0);
  assert.equal(r.teachers.some((t) => t.teacher_id === 'pasif'), false);
});

test('kurumlar ayrilir ve kurum icinde cok yukleyen once gelir', () => {
  const r = raporuOlustur(temel);
  assert.deepEqual(
    r.teachers.map((t) => `${t.institution_name}:${t.teacher_name}`),
    ['B Kurumu:Zeynep', 'Online VIP:Ayşe', 'Online VIP:Mehmet']
  );
  assert.deepEqual(r.institutions.map((k) => k.name), ['B Kurumu', 'Online VIP']);
  assert.equal(r.files[0].id, 'f2');
});
