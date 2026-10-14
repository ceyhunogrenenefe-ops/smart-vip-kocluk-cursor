import test from 'node:test';
import assert from 'node:assert/strict';
import {
  durumSayaclari,
  durumuTemizle,
  elleIsaretli,
  etkinDurum,
  sinavlariSuz
} from './exam-calendar-durum.js';

const BUGUN = '2026-10-14';

test('gelecek tarihli isaretlenmemis sinav planlandi sayilir', () => {
  assert.equal(etkinDurum({ exam_date: '2026-11-01' }, BUGUN), 'planlandi');
});

test('bugunku sinav hala planlandi sayilir', () => {
  assert.equal(etkinDurum({ exam_date: BUGUN }, BUGUN), 'planlandi');
});

test('tarihi gecmis isaretlenmemis sinav YAPILMADI sayilir, yapildi DEGIL', () => {
  const d = etkinDurum({ exam_date: '2026-09-20' }, BUGUN);
  assert.equal(d, 'yapilmadi');
  assert.notEqual(d, 'yapildi', 'tarihi gecen sinav kendiliginden yapildi olmamali');
});

test('elle isaretlenen durum tarihe bakilmaksizin kazanir', () => {
  assert.equal(etkinDurum({ exam_date: '2026-09-20', status: 'yapildi' }, BUGUN), 'yapildi');
  assert.equal(etkinDurum({ exam_date: '2026-11-01', status: 'yapilmadi' }, BUGUN), 'yapilmadi');
  assert.equal(etkinDurum({ exam_date: '2026-09-20', status: 'planlandi' }, BUGUN), 'planlandi');
});

test('bilinmeyen status degeri yok sayilir, tarihe donulur', () => {
  assert.equal(etkinDurum({ exam_date: '2026-09-20', status: 'bozuk' }, BUGUN), 'yapilmadi');
});

test('elleIsaretli yalnizca gecerli durumlarda dogru', () => {
  assert.equal(elleIsaretli({ status: 'yapildi' }), true);
  assert.equal(elleIsaretli({ status: null }), false);
  assert.equal(elleIsaretli({ status: 'bozuk' }), false);
});

test('durumuTemizle bos degeri isaret kaldirma sayar', () => {
  assert.deepEqual(durumuTemizle(null), { value: null });
  assert.deepEqual(durumuTemizle(''), { value: null });
  assert.deepEqual(durumuTemizle('otomatik'), { value: null });
  assert.deepEqual(durumuTemizle('YAPILDI'), { value: 'yapildi' });
  assert.ok(durumuTemizle('silindi').error, 'gecersiz deger reddedilmeli');
});

const ORNEK = [
  { id: 'a', level: '9', exam_date: '2026-09-20' },
  { id: 'b', level: '9', exam_date: '2026-09-27', status: 'yapildi' },
  { id: 'c', level: 'lgs', exam_date: '2026-11-01' },
  { id: 'd', level: '9', exam_date: '2026-12-15' },
  { id: 'e', level: 'lgs', exam_date: '2026-10-01', status: 'yapildi' }
];

test('suzme hicbir satiri kaybetmez, yalnizca secer', () => {
  assert.equal(sinavlariSuz(ORNEK, { bugun: BUGUN }).length, ORNEK.length);
});

test('durum suzmesi dogru gruplar', () => {
  const yapildi = sinavlariSuz(ORNEK, { durum: 'yapildi', bugun: BUGUN });
  assert.deepEqual(yapildi.map((x) => x.id), ['b', 'e']);
  const yapilmadi = sinavlariSuz(ORNEK, { durum: 'yapilmadi', bugun: BUGUN });
  assert.deepEqual(yapilmadi.map((x) => x.id), ['a']);
  const planlandi = sinavlariSuz(ORNEK, { durum: 'planlandi', bugun: BUGUN });
  assert.deepEqual(planlandi.map((x) => x.id), ['c', 'd']);
});

test('sinif ve tarih araligi birlikte uygulanir', () => {
  const r = sinavlariSuz(ORNEK, { level: '9', baslangic: '2026-09-25', bugun: BUGUN });
  assert.deepEqual(r.map((x) => x.id), ['b', 'd']);
  const r2 = sinavlariSuz(ORNEK, { baslangic: '2026-09-25', bitis: '2026-11-01', bugun: BUGUN });
  assert.deepEqual(r2.map((x) => x.id), ['b', 'c', 'e']);
});

test('gecmis sinavlar varsayilan listede KALIR', () => {
  const hepsi = sinavlariSuz(ORNEK, { bugun: BUGUN }).map((x) => x.id);
  assert.ok(hepsi.includes('a'), 'tarihi gecmis sinav listeden dusmemeli');
  assert.ok(hepsi.includes('b'), 'tarihi gecmis yapilmis sinav listeden dusmemeli');
});

test('sayaclar toplami kayit sayisina esit', () => {
  const s = durumSayaclari(ORNEK, BUGUN);
  assert.equal(s.toplam, 5);
  assert.equal(s.yapildi + s.yapilmadi + s.planlandi, 5);
  assert.deepEqual({ y: s.yapildi, n: s.yapilmadi, p: s.planlandi }, { y: 2, n: 1, p: 2 });
});
