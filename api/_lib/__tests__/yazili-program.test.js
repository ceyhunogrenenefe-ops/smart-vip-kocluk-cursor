import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ayariTemizle,
  baglariTemizle,
  dersAnahtari,
  gunler,
  haftaGunu,
  otomatikYerlestir,
  sinifSeviyesi,
  takvimSinavlari,
  yaziliDersiMi
} from '../yazili-program.js';

test('ders adlari takvimle eslesir', () => {
  assert.equal(dersAnahtari('FEN BİLGİSİ'), 'fen');
  assert.equal(dersAnahtari('Fen Bilimleri'), 'fen');
  assert.equal(dersAnahtari('Edebiyat'), 'edebiyat');
  assert.equal(dersAnahtari('Türk Dili ve Edebiyatı'), 'edebiyat');
  assert.equal(dersAnahtari('DİN KÜLTÜRÜ'), 'din');
  assert.equal(dersAnahtari('İNGİLİZCE'), 'ingilizce');
  assert.equal(yaziliDersiMi('DENEME SINAVI'), false);
  assert.equal(yaziliDersiMi('ETÜT & KİTAP OKUMA'), false);
  assert.equal(yaziliDersiMi('MATEMATİK'), true);
});

test('seviye ve takvim: 6. sinif matematik 11 Kasim, 7. sinif ingilizce yok', () => {
  assert.equal(sinifSeviyesi('6'), 6);
  assert.equal(sinifSeviyesi('LGS'), 8);
  assert.equal(sinifSeviyesi('YKS SAYISAL'), null);
  const alti = takvimSinavlari(6);
  assert.deepEqual(alti.filter((s) => s.key === 'matematik').map((s) => s.tarih), ['2026-11-11']);
  assert.equal(takvimSinavlari(7).some((s) => s.key === 'ingilizce'), false);
  assert.deepEqual(takvimSinavlari(10).filter((s) => s.key === 'edebiyat').map((s) => s.tarih), ['2026-11-12']);
  assert.equal(takvimSinavlari(11).some((s) => s.key === 'ingilizce'), false);
});

test('tarih yardimcilari: 31 Ekim 2026 cumartesi, aralik 9 gun', () => {
  assert.equal(haftaGunu('2026-10-31'), 6);
  assert.equal(haftaGunu('2026-11-01'), 7);
  assert.equal(haftaGunu('2026-11-03'), 2);
  assert.equal(gunler('2026-10-31', '2026-11-08').length, 9);
});

const ayar = ayariTemizle({});
const satir = (o) => ({ class_name: 'X', target: 1, ...o });

test('yakin onceliginde ders sinavdan onceki en yakin gune, bos saate konur', () => {
  const { yeni, yerlesmeyen } = otomatikYerlestir({
    ayar: { ...ayar, oncelik: 'yakin' },
    satirlar: [satir({ class_id: 'c6', subject: 'Fen', subject_key: 'fen', teacher_id: 't1', exam_date: '2026-11-03' })],
    // 2 Kasım pazartesi 17:00-17:40 sınıfın normal dersi var
    slots: [{ class_id: 'c6', teacher_id: 'baska', day_of_week: 1, start_time: '17:00:00', end_time: '17:40:00' }]
  });
  assert.equal(yerlesmeyen.length, 0);
  assert.deepEqual(yeni[0], {
    class_id: 'c6',
    subject: 'Fen',
    subject_key: 'fen',
    teacher_id: 't1',
    lesson_date: '2026-11-02',
    start_time: '17:50',
    end_time: '18:30'
  });
});

test('ayni ogretmen ayni saatte iki sinifa konmaz; sinav gunu ve sonrasi kullanilmaz', () => {
  const { yeni } = otomatikYerlestir({
    ayar,
    satirlar: [
      satir({ class_id: 'a', subject: 'Mat', subject_key: 'matematik', teacher_id: 't', exam_date: '2026-11-05' }),
      satir({ class_id: 'b', subject: 'Mat', subject_key: 'matematik', teacher_id: 't', exam_date: '2026-11-05' })
    ]
  });
  assert.equal(yeni.length, 2);
  assert.ok(yeni.every((i) => i.lesson_date < '2026-11-05'));
  const [x, y] = yeni;
  assert.ok(!(x.lesson_date === y.lesson_date && x.start_time === y.start_time));
});

test('ogretmensiz satir ve araliktan once biten sinav yerlesmez; mevcut taslak tekrar eklenmez', () => {
  const { yeni, yerlesmeyen } = otomatikYerlestir({
    ayar,
    satirlar: [
      satir({ class_id: 'a', subject: 'Tarih', subject_key: 'tarih', teacher_id: '', exam_date: '2026-11-04' }),
      satir({ class_id: 'b', subject: 'Fen', subject_key: 'fen', teacher_id: 't', exam_date: '2026-10-30' }),
      satir({ class_id: 'c', subject: 'Fen', subject_key: 'fen', teacher_id: 't', exam_date: '2026-11-03' })
    ],
    items: [{ class_id: 'c', subject_key: 'fen', teacher_id: 't', lesson_date: '2026-11-01', start_time: '10:00', end_time: '11:00' }]
  });
  assert.equal(yeni.length, 0);
  assert.deepEqual(yerlesmeyen.map((y) => y.sebep), ['Yazılı, program aralığından önce', 'Öğretmen seçilmemiş']);
});

test('sinifa gunde en fazla N hazirlik dersi', () => {
  const satirlar = ['a1', 'a2', 'a3', 'a4'].map((k, i) =>
    satir({ class_id: 's', subject: k, subject_key: k, teacher_id: `t${i}`, exam_date: '2026-11-01' })
  );
  const { yeni } = otomatikYerlestir({ ayar: { ...ayar, gunlukEnFazla: 2 }, satirlar });
  const ekim31 = yeni.filter((i) => i.lesson_date === '2026-10-31').length;
  assert.equal(ekim31, 2);
});

test('varsayilan oncelik: sinavdan onceki hafta sonu (en yakin hafta sonu once)', () => {
  const { yeni } = otomatikYerlestir({
    ayar,
    satirlar: [
      satir({ class_id: 'a', subject: 'Fen', subject_key: 'fen', teacher_id: 't1', exam_date: '2026-11-03' }),
      satir({ class_id: 'b', subject: 'Tur', subject_key: 'turkce', teacher_id: 't2', exam_date: '2026-11-10' })
    ]
  });
  assert.equal(yeni.find((i) => i.class_id === 'a').lesson_date, '2026-11-01');
  assert.equal(yeni.find((i) => i.class_id === 'b').lesson_date, '2026-11-08');
  assert.equal(yeni.find((i) => i.class_id === 'a').start_time, '10:00');
});

test('ortak program baglari: gecersizler atilir, tarih sirasi duzeltilir', () => {
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';
  assert.deepEqual(
    baglariTemizle([
      { siniflar: [A, B, A], baslangic: '2026-11-13', bitis: '2026-10-31' },
      { siniflar: [A], baslangic: '2026-10-31', bitis: '2026-11-13' },
      { siniflar: [A, 'x'], baslangic: '2026-10-31', bitis: '2026-11-13' }
    ]),
    [{ siniflar: [A, B], baslangic: '2026-10-31', bitis: '2026-11-13' }]
  );
  assert.deepEqual(ayariTemizle({}).baglar, []);
});
