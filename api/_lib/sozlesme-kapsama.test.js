import test from 'node:test';
import assert from 'node:assert/strict';
import { adAnahtari, kapsamaHesapla } from './sozlesme-kapsama.js';

test('ad anahtari Turkce buyuk/kucuk ve noktalamayi normalize eder', () => {
  assert.equal(adAnahtari('İSMAİL ŞAHİN'), 'ismail sahin');
  assert.equal(adAnahtari('ismail  şahin '), 'ismail sahin');
  assert.equal(adAnahtari('Ismail Sahin'), 'ismail sahin');
  assert.equal(adAnahtari('ÇAĞRI GÜNDÜZ'), 'cagri gunduz');
  assert.equal(adAnahtari(null), '');
});

const OGRENCILER = [
  { id: 's1', name: 'Ali Veli', class_level: '9', enrollment_status: 'confirmed' },
  { id: 's2', name: 'İsmail Şahin', class_level: '10', enrollment_status: 'confirmed' },
  { id: 's3', name: 'Ayrılan Öğrenci', class_level: '11', enrollment_status: 'withdrawn' },
  { id: 's4', name: 'Zeynep Kaya', class_level: '12', enrollment_status: 'confirmed' }
];

test('student_id bagi olan sozlesme eksik sayilmaz', () => {
  const r = kapsamaHesapla({
    students: OGRENCILER,
    classStudents: [{ class_id: 'c1', student_id: 's1' }],
    contracts: [{ student_id: 's1', ogrenci_ad: 'Ali', ogrenci_soyad: 'Veli' }]
  });
  assert.equal(r.eksik_toplam, 0);
  assert.equal(r.sozlesmeli, 1);
});

test('student_id bos olsa bile ad eslesirse eksik sayilmaz', () => {
  // Olculen durum: 83 sozlesmenin 17'sinde student_id bos.
  const r = kapsamaHesapla({
    students: OGRENCILER,
    classStudents: [{ class_id: 'c1', student_id: 's2' }],
    contracts: [{ student_id: '', ogrenci_ad: 'ismail', ogrenci_soyad: 'sahin' }]
  });
  assert.equal(r.eksik_toplam, 0, 'ad eslesmesi calismadi — mukerrer sozlesme riski');
});

test('ayrilmis ogrenci kapsam disi, eksik listesine girmez', () => {
  const r = kapsamaHesapla({
    students: OGRENCILER,
    classStudents: [{ class_id: 'c1', student_id: 's3' }],
    contracts: []
  });
  assert.equal(r.eksik_toplam, 0);
  assert.equal(r.kapsam_disi, 1);
});

test('ayni ogrenci iki sinifta olsa tek satir uretir', () => {
  const r = kapsamaHesapla({
    students: OGRENCILER,
    classStudents: [
      { class_id: 'c1', student_id: 's4' },
      { class_id: 'c2', student_id: 's4' }
    ],
    contracts: []
  });
  assert.equal(r.eksik_toplam, 1);
  assert.equal(r.eksik[0].class_count, 2);
});

test('taksiti olan sozlesmesiz ogrenci isaretlenir ve basa alinir', () => {
  const r = kapsamaHesapla({
    students: OGRENCILER,
    classStudents: [
      { class_id: 'c1', student_id: 's1' },
      { class_id: 'c1', student_id: 's4' }
    ],
    contracts: [],
    paymentRecords: [{ student_id: 's4', installment_group_id: 'g1' }]
  });
  assert.equal(r.eksik_toplam, 2);
  assert.equal(r.taksiti_var_sozlesmesiz, 1);
  assert.equal(r.eksik[0].student_id, 's4', 'taksiti olan basta olmali');
  assert.equal(r.eksik[0].taksiti_var, true);
  assert.equal(r.eksik[1].taksiti_var, false);
});

test('student_id yoksa odeme kaydi ad uzerinden eslesir', () => {
  const r = kapsamaHesapla({
    students: OGRENCILER,
    classStudents: [{ class_id: 'c1', student_id: 's2' }],
    contracts: [],
    paymentRecords: [
      { student_id: null, external_student_name: 'İSMAİL ŞAHİN', installment_no: 2 }
    ]
  });
  assert.equal(r.eksik[0].taksiti_var, true, 'external_student_name eslesmesi calismiyor');
});

test('sinifta olmayan ogrenci denetime girmez', () => {
  const r = kapsamaHesapla({ students: OGRENCILER, classStudents: [], contracts: [] });
  assert.equal(r.sinifta_tanimli, 0);
  assert.equal(r.eksik_toplam, 0);
});
