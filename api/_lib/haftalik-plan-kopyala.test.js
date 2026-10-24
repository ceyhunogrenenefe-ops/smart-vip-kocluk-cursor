import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cakismalariAyikla,
  gorevleriHedeflereBagla,
  gunFarki,
  hedefKopyasiUret,
  haftaBasi,
  planKopyasiUret,
  tarihKaydir,
  yazimIcinSadele,
  zamanCakisiyorMu
} from './haftalik-plan-kopyala.js';

test('hafta basi pazartesiyi bulur', () => {
  assert.equal(haftaBasi('2026-10-14'), '2026-10-12'); // carsamba -> pazartesi
  assert.equal(haftaBasi('2026-10-12'), '2026-10-12'); // pazartesi
  assert.equal(haftaBasi('2026-10-18'), '2026-10-12'); // pazar ayni haftaya ait
  assert.equal(haftaBasi('2026-10-19'), '2026-10-19'); // sonraki pazartesi
});

test('tarih kaydirma ay ve yil sinirini gecer', () => {
  assert.equal(tarihKaydir('2026-10-29', 7), '2026-11-05');
  assert.equal(tarihKaydir('2026-12-28', 7), '2027-01-04');
  assert.equal(tarihKaydir('2026-03-01', -1), '2026-02-28');
});

test('yaz saati gecisinde gun kaymaz', () => {
  // Turkiye'de saat degisimi olmasa da UTC disi hesap bir gun kaydirabilirdi
  assert.equal(tarihKaydir('2026-03-28', 1), '2026-03-29');
  assert.equal(tarihKaydir('2026-10-24', 7), '2026-10-31');
});

test('gun farki dogru', () => {
  assert.equal(gunFarki('2026-10-12', '2026-10-19'), 7);
  assert.equal(gunFarki('2026-10-19', '2026-10-12'), -7);
});

const KAYNAK = [
  {
    id: 'wpe-a', student_id: 's1', institution_id: 'k1',
    subject: 'Matematik', title: 'Türev tekrarı',
    planned_quantity: 40, completed_quantity: 31, status: 'completed',
    planner_date: '2026-10-12', start_time: '17:00', end_time: '18:30',
    coach_goal_id: 'goal-eski', weekly_entry_id: 'we-1', homework_id: 'hw-1'
  },
  {
    id: 'wpe-b', student_id: 's1', institution_id: 'k1',
    subject: 'Fizik', title: 'Basınç soruları',
    planned_quantity: 25, completed_quantity: 0, status: 'missed',
    planner_date: '2026-10-15', start_time: '19:00', end_time: '20:00',
    coach_goal_id: null, weekly_entry_id: null, homework_id: null
  }
];

const SEC = { hedefHaftaBasi: '2026-10-19', kaynakHaftaBasi: '2026-10-12', idUret: (() => { let n = 0; return () => `yeni-${++n}`; })() };

test('gun ayni kalacak sekilde kaydirilir (pazartesi -> pazartesi)', () => {
  const r = planKopyasiUret(KAYNAK, { ...SEC, idUret: () => 'x' });
  assert.equal(r.kopyalar[0].planner_date, '2026-10-19', 'pazartesi pazartesiye');
  assert.equal(r.kopyalar[1].planner_date, '2026-10-22', 'persembe persembeye');
});

test('saatler ve soru hedefi aynen tasinir', () => {
  const r = planKopyasiUret(KAYNAK, { ...SEC, idUret: () => 'x' });
  assert.equal(r.kopyalar[0].start_time, '17:00');
  assert.equal(r.kopyalar[0].end_time, '18:30');
  assert.equal(r.kopyalar[0].planned_quantity, 40);
  assert.equal(r.kopyalar[0].subject, 'Matematik');
  assert.equal(r.kopyalar[0].title, 'Türev tekrarı');
});

test('GERCEKLESME bilgileri TASINMAZ', () => {
  const r = planKopyasiUret(KAYNAK, { ...SEC, idUret: () => 'x' });
  for (const k of r.kopyalar) {
    assert.equal(k.completed_quantity, 0, 'tamamlanan miktar sifirlanmali');
    assert.equal(k.status, 'planned', 'durum baslangic olmali');
    assert.equal(k.weekly_entry_id, null, 'gerceklesen calisma kaydi tasinmamali');
    assert.equal(k.homework_id, null, 'odev bagi tasinmamali');
    assert.equal(k.coach_goal_id, null, 'haftaya bagli hedef tasinmamali');
  }
});

test('her kopya YENI kimlik alir', () => {
  const uret = (() => { let n = 0; return () => `yeni-${++n}`; })();
  const r = planKopyasiUret(KAYNAK, { ...SEC, idUret: uret });
  const idler = r.kopyalar.map((k) => k.id);
  assert.deepEqual(idler, ['yeni-1', 'yeni-2']);
  assert.ok(!idler.includes('wpe-a'), 'kaynak kimlik yeniden kullanilmamali');
});

test('kaynak kayitlar degistirilmez', () => {
  const kopyaGirdi = JSON.parse(JSON.stringify(KAYNAK));
  planKopyasiUret(kopyaGirdi, { ...SEC, idUret: () => 'x' });
  assert.deepEqual(kopyaGirdi, KAYNAK, 'girdi mutasyona ugramamali');
});

test('saati eksik gorev atlanir, sessizce bozuk kayit uretilmez', () => {
  const r = planKopyasiUret(
    [{ id: 'x', planner_date: '2026-10-12', start_time: '', end_time: '' }],
    { ...SEC, idUret: () => 'x' }
  );
  assert.equal(r.kopyalar.length, 0);
  assert.equal(r.atlanan, 1);
});

test('kaynak hafta verilmezse satirlardan bulunur', () => {
  const r = planKopyasiUret(KAYNAK, { hedefHaftaBasi: '2026-10-19', idUret: () => 'x' });
  assert.equal(r.kaynakHaftaBasi, '2026-10-12');
  assert.equal(r.kopyalar[0].planner_date, '2026-10-19');
});

test('zaman cakismasi dogru olculur', () => {
  const a = { start_time: '17:00', end_time: '18:30' };
  assert.equal(zamanCakisiyorMu(a, { start_time: '18:00', end_time: '19:00' }), true);
  assert.equal(zamanCakisiyorMu(a, { start_time: '18:30', end_time: '19:00' }), false, 'bitisik olan cakismaz');
  assert.equal(zamanCakisiyorMu(a, { start_time: '16:00', end_time: '17:00' }), false);
});

test('birlestirmede yalniz cakismayanlar eklenir', () => {
  const r = planKopyasiUret(KAYNAK, { ...SEC, idUret: (() => { let n = 0; return () => `y${++n}`; })() });
  const mevcut = [{ id: 'var-1', planner_date: '2026-10-19', start_time: '17:30', end_time: '18:00' }];
  const { eklenecek, cakisan } = cakismalariAyikla(r.kopyalar, mevcut);
  assert.equal(cakisan.length, 1, 'pazartesi 17:00-18:30 ile cakismali');
  assert.equal(eklenecek.length, 1, 'persembe gorevi eklenebilmeli');
  assert.equal(eklenecek[0].planner_date, '2026-10-22');
});

test('mevcut plan bossa hepsi eklenir', () => {
  const r = planKopyasiUret(KAYNAK, { ...SEC, idUret: (() => { let n = 0; return () => `z${++n}`; })() });
  const { eklenecek, cakisan } = cakismalariAyikla(r.kopyalar, []);
  assert.equal(eklenecek.length, 2);
  assert.equal(cakisan.length, 0);
});

test('yazim icin sadelestirme onizleme alanlarini atar', () => {
  const r = planKopyasiUret(KAYNAK, { ...SEC, idUret: () => 'x' });
  const temiz = yazimIcinSadele(r.kopyalar[0]);
  assert.ok(!('_kaynak_id' in temiz));
  assert.ok(!('_kaynak_tarih' in temiz));
  assert.equal(temiz.subject, 'Matematik');
});

test('gecersiz hedef hafta reddedilir', () => {
  const r = planKopyasiUret(KAYNAK, { hedefHaftaBasi: 'bozuk' });
  assert.equal(r.hata, 'hedef_hafta_gecersiz');
  assert.equal(r.kopyalar.length, 0);
});

/* ---------- Koç haftalık hedefleri ---------- */

const HEDEFLER = [
  {
    id: 'cwg-1', student_id: 's1', coach_id: 'c1', institution_id: 'k1',
    subject: 'MATEMATİK', title: 'Üslü İfadeler', target_quantity: 210, quantity_unit: 'soru',
    week_start_date: '2026-10-12', goal_start_date: '2026-10-19', goal_end_date: '2026-10-26',
    homework_id: 'hw-1'
  },
  {
    id: 'cwg-2', student_id: 's1', coach_id: 'c1', institution_id: 'k1',
    subject: 'FİZİK', title: 'Basınç', target_quantity: 50, quantity_unit: 'soru',
    week_start_date: '2026-10-12', goal_start_date: '2026-10-12', goal_end_date: '2026-10-18',
    homework_id: null
  }
];
const HSEC = { kaynakHaftaBasi: '2026-10-12', hedefHaftaBasi: '2026-10-19' };

test('hedefler hedef haftaya kopyalanir', () => {
  const r = hedefKopyasiUret(HEDEFLER, { ...HSEC, idUret: (() => { let n = 0; return () => `yeni-${++n}`; })() });
  assert.equal(r.kopyalar.length, 2);
  assert.equal(r.kopyalar[0].week_start_date, '2026-10-19');
  assert.equal(r.kopyalar[0].subject, 'MATEMATİK');
  assert.equal(r.kopyalar[0].target_quantity, 210);
  assert.equal(r.kopyalar[0].quantity_unit, 'soru');
});

test('hedef tarih araligi AYNI gun farkiyla kaydirilir', () => {
  const r = hedefKopyasiUret(HEDEFLER, { ...HSEC, idUret: () => 'x' });
  // week 12->19 (+7); goal 19->26, 26->2 Kasim
  assert.equal(r.kopyalar[0].goal_start_date, '2026-10-26');
  assert.equal(r.kopyalar[0].goal_end_date, '2026-11-02');
  // Haftayla ayni olan hedef de ayni farkla kayar
  assert.equal(r.kopyalar[1].goal_start_date, '2026-10-19');
  assert.equal(r.kopyalar[1].goal_end_date, '2026-10-25');
});

test('hedef kopyasi odev bagini TASIMAZ ve YENI kimlik alir', () => {
  const r = hedefKopyasiUret(HEDEFLER, { ...HSEC, idUret: () => 'yeni-1' });
  assert.equal(r.kopyalar[0].homework_id, null);
  assert.equal(r.kopyalar[0].id, 'yeni-1');
  assert.notEqual(r.kopyalar[0].id, 'cwg-1');
});

test('hedef haftada AYNI hedef varsa yenisi acilmaz, ona baglanilir', () => {
  const r = hedefKopyasiUret(HEDEFLER, {
    ...HSEC,
    idUret: () => 'yeni-1',
    mevcutHedefler: [{ id: 'var-1', subject: 'matematik', title: 'üslü i̇fadeler', quantity_unit: 'soru' }]
  });
  // Buyuk/kucuk farki yok sayilmali
  assert.equal(r.kopyalar.length, 1, 'yalniz FIZIK kopyalanmali');
  assert.equal(r.kimlikEslesmesi.get('cwg-1'), 'var-1', 'mevcut hedefe baglanmali');
});

test('gorevler KOPYALANAN hedefe baglanir, eskisine degil', () => {
  const kaynakGorevler = [
    { id: 'wpe-a', coach_goal_id: 'cwg-1' },
    { id: 'wpe-b', coach_goal_id: null }
  ];
  const h = hedefKopyasiUret(HEDEFLER, { ...HSEC, idUret: () => 'yeni-1' });
  const kopyalar = [
    { id: 'k1', _kaynak_id: 'wpe-a', coach_goal_id: null },
    { id: 'k2', _kaynak_id: 'wpe-b', coach_goal_id: null }
  ];
  const bagli = gorevleriHedeflereBagla(kopyalar, h.kimlikEslesmesi, kaynakGorevler);
  assert.equal(bagli[0].coach_goal_id, 'yeni-1', 'yeni hedefe baglanmali');
  assert.notEqual(bagli[0].coach_goal_id, 'cwg-1', 'eski hedefe baglanmamali');
  assert.equal(bagli[1].coach_goal_id, null, 'hedefsiz gorev hedefsiz kalmali');
});

test('hedefsiz gorev bosta kalmaz, kaynak hedefler degismez', () => {
  const girdi = JSON.parse(JSON.stringify(HEDEFLER));
  hedefKopyasiUret(girdi, { ...HSEC, idUret: () => 'x' });
  assert.deepEqual(girdi, HEDEFLER, 'girdi mutasyona ugramamali');
});

test('gecersiz hafta hedef kopyalamaz', () => {
  const r = hedefKopyasiUret(HEDEFLER, { kaynakHaftaBasi: 'bozuk', hedefHaftaBasi: '2026-10-19' });
  assert.equal(r.kopyalar.length, 0);
  assert.equal(r.atlanan, 2);
});
