import test from 'node:test';
import assert from 'node:assert/strict';
import { raporuOlustur } from '../yazili-hazirlik-rapor.js';

const temel = {
  institutions: [
    { id: 'k1', name: 'Online VIP' },
    { id: 'k2', name: 'B Kurumu' }
  ],
  classes: [
    { id: 'c5', name: '5-A', institution_id: 'k1' },
    { id: 'c9', name: '9-A', institution_id: 'k1' },
    { id: 'c7', name: '7-A', institution_id: 'k2' }
  ],
  classTeachers: [
    { class_id: 'c5', teacher_id: 'tayyibe' },
    { class_id: 'c9', teacher_id: 'tayyibe' },
    { class_id: 'c5', teacher_id: 'mehmet' },
    { class_id: 'c7', teacher_id: 'zeynep' },
    { class_id: 'c7', teacher_id: 'pasif' }
  ],
  slots: [
    { class_id: 'c5', teacher_id: 'tayyibe', subject: 'FEN BİLİMLERİ' },
    { class_id: 'c5', teacher_id: 'tayyibe', subject: 'FEN BİLİMLERİ' },
    { class_id: 'c5', teacher_id: 'mehmet', subject: 'Matematik' },
    { class_id: 'c7', teacher_id: 'pasif', subject: 'Türkçe' }
  ],
  users: [
    { id: 'tayyibe', name: 'Tayyibe Öğrenenefe' },
    { id: 'mehmet', name: 'Mehmet' },
    { id: 'zeynep', name: 'Zeynep' },
    { id: 'pasif', name: 'Eski', is_active: false }
  ],
  files: [
    { id: 'f1', class_id: 'c5', teacher_user_id: 'tayyibe', subject: 'Fen Bilimleri', donem: 1, yazili: 1, calisma: 1, file_name: 'a.pdf', updated_at: '2026-10-21T10:00:00Z' },
    { id: 'f2', class_id: 'c5', teacher_user_id: 'tayyibe', subject: 'Fen Bilimleri', donem: 1, yazili: 1, calisma: 2, file_name: 'b.pdf', updated_at: '2026-10-21T12:00:00Z' },
    { id: 'f3', class_id: 'c9', teacher_user_id: 'tayyibe', subject: 'Biyoloji', donem: 2, yazili: 1, calisma: 1, file_name: 'c.pdf', updated_at: '2026-10-20T09:00:00Z' }
  ]
};

const bul = (r, sinif, ogretmen) => r.rows.filter((x) => x.class_name === sinif && x.teacher_id === ogretmen);

test('5-A Fen Bilimleri Tayyibe: 2 calisma; programdaki buyuk harfli ders ayni satira duser', () => {
  const r = raporuOlustur(temel);
  const satir = bul(r, '5-A', 'tayyibe');
  assert.equal(satir.length, 1);
  assert.equal(satir[0].subject, 'Fen Bilimleri');
  assert.equal(satir[0].total, 2);
  assert.deepEqual(satir[0].by_slot, { '1-1': 2, '1-2': 0, '2-1': 0, '2-2': 0 });
  assert.equal(satir[0].last_upload, '2026-10-21T12:00:00Z');
});

test('ayni ogretmen baska sinifta ayri satir', () => {
  const r = raporuOlustur(temel);
  const satir = bul(r, '9-A', 'tayyibe');
  assert.equal(satir.length, 1);
  assert.equal(satir[0].subject, 'Biyoloji');
  assert.equal(satir[0].by_slot['2-1'], 1);
});

test('programda olup yuklemeyen 0; programi olmayan atanmis ogretmen ders bos; pasif yok', () => {
  const r = raporuOlustur(temel);
  const mehmet = bul(r, '5-A', 'mehmet');
  assert.equal(mehmet[0].subject, 'Matematik');
  assert.equal(mehmet[0].total, 0);
  const zeynep = bul(r, '7-A', 'zeynep');
  assert.equal(zeynep[0].subject, '');
  assert.equal(r.rows.some((x) => x.teacher_id === 'pasif'), false);
});

test('dosyalar satira baglanir, kurumlar listelenir', () => {
  const r = raporuOlustur(temel);
  const satir = bul(r, '5-A', 'tayyibe')[0];
  assert.deepEqual(
    r.files.filter((f) => f.row_key === satir.key).map((f) => f.id),
    ['f2', 'f1']
  );
  assert.deepEqual(r.institutions.map((k) => k.name), ['B Kurumu', 'Online VIP']);
});
