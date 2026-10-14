import test from 'node:test';
import assert from 'node:assert/strict';
import {
  epostaAnahtari,
  iletisimKumeleri,
  misafirSiparisAtfi,
  misafirSiparisleriSuz,
  sahipsizSiparisler,
  siparisleriBirlestir,
  telefonAnahtari
} from './magaza-misafir-siparis.js';

const KURUM = '73323d75-eea1-4552-8bba-d50555423589';

test('telefon anahtari bicim farklarini esitler', () => {
  assert.equal(telefonAnahtari('+90 (532) 111 22 33'), '5321112233');
  assert.equal(telefonAnahtari('0532 111 22 33'), '5321112233');
  assert.equal(telefonAnahtari('05321112233'), '5321112233');
  assert.equal(telefonAnahtari('123'), '', 'kisa numara anahtar uretmemeli');
  assert.equal(telefonAnahtari(null), '');
});

test('eposta anahtari buyuk/kucuk ve bosluk farkini yok sayar', () => {
  assert.equal(epostaAnahtari('  Veli@Ornek.COM '), 'veli@ornek.com');
  assert.equal(epostaAnahtari(null), '');
});

test('iletisim kumeleri ogrenci ve veli alanlarini birlikte toplar', () => {
  const k = iletisimKumeleri([
    { email: 'A@x.com', phone: '0532 111 22 33', parent_email: 'VELI@x.com', parent_phone: '+905339998877' }
  ]);
  assert.ok(k.epostalar.has('a@x.com'));
  assert.ok(k.epostalar.has('veli@x.com'));
  assert.ok(k.telefonlar.has('5321112233'));
  assert.ok(k.telefonlar.has('5339998877'));
});

const KAPSAM = {
  institutionId: KURUM,
  ...iletisimKumeleri([{ email: 'veli@x.com', phone: '05321112233' }]),
  kocKapsami: false
};

test('kurum kimligi eslesen misafir siparis listeye girer', () => {
  const r = misafirSiparisAtfi({ institution_id: KURUM }, KAPSAM);
  assert.deepEqual(r, { ait: true, neden: 'kurum' });
});

test('kurumsuz siparis epostadan eslesir', () => {
  const r = misafirSiparisAtfi({ institution_id: null, customer_email: 'VELI@x.com' }, KAPSAM);
  assert.deepEqual(r, { ait: true, neden: 'eposta' });
});

test('kurumsuz siparis telefondan eslesir', () => {
  const r = misafirSiparisAtfi({ institution_id: null, customer_phone: '+90 532 111 22 33' }, KAPSAM);
  assert.deepEqual(r, { ait: true, neden: 'telefon' });
});

test('hicbir sey eslesmezse siparis listeye GIRMEZ', () => {
  const r = misafirSiparisAtfi(
    { institution_id: null, customer_email: 'yabanci@x.com', customer_phone: '05000000000' },
    KAPSAM
  );
  assert.equal(r.ait, false, 'tahmin ederek gostermemeli');
});

test('BASKA kuruma yazilmis siparis iletisim esleseydi bile alinmaz', () => {
  const r = misafirSiparisAtfi(
    { institution_id: 'baska-kurum', customer_email: 'veli@x.com' },
    KAPSAM
  );
  assert.equal(r.ait, false, 'yanlis kuruma ciro yazilmamali');
});

test('koc kapsaminda kurum kurali uygulanmaz', () => {
  const kocKapsam = { ...KAPSAM, kocKapsami: true };
  // Kurum eslesiyor ama iletisim eslesmiyor -> koc gormemeli
  assert.equal(misafirSiparisAtfi({ institution_id: KURUM }, kocKapsam).ait, false);
  // Kendi ogrencisinin iletisimi eslesiyorsa gorur
  assert.equal(
    misafirSiparisAtfi({ institution_id: KURUM, customer_email: 'veli@x.com' }, kocKapsam).ait,
    true
  );
});

test('suzme ogrenciye bagli siparisleri atlar ve atif nedenini yazar', () => {
  const r = misafirSiparisleriSuz(
    [
      { id: '1', student_id: 's1' },
      { id: '2', student_id: null, institution_id: KURUM },
      { id: '3', student_id: null, customer_email: 'yabanci@x.com' }
    ],
    KAPSAM
  );
  assert.deepEqual(r.map((x) => x.id), ['2']);
  assert.equal(r[0].misafir_siparis, true);
  assert.equal(r[0].misafir_atif, 'kurum');
});

test('birlestirme tekillestirir ve yeniden eskiye siralar', () => {
  const a = [
    { id: 'a', created_at: '2026-10-01T00:00:00Z' },
    { id: 'b', created_at: '2026-10-05T00:00:00Z' }
  ];
  const b = [
    { id: 'b', created_at: '2026-10-05T00:00:00Z' },
    { id: 'c', created_at: '2026-10-09T00:00:00Z' }
  ];
  const r = siparisleriBirlestir(a, b);
  assert.deepEqual(r.map((x) => x.id), ['c', 'b', 'a']);
  assert.equal(r.length, 3, 'ayni siparis iki kez gorunmemeli');
});

test('birlestirme limiti uygular', () => {
  const liste = Array.from({ length: 10 }, (_, i) => ({
    id: String(i),
    created_at: `2026-10-${String(i + 1).padStart(2, '0')}T00:00:00Z`
  }));
  assert.equal(siparisleriBirlestir(liste, [], 4).length, 4);
  assert.equal(siparisleriBirlestir(liste, [], 4)[0].id, '9', 'en yeni basta olmali');
});

const TUM = iletisimKumeleri([{ email: 'bilinen@x.com', phone: '05321112233' }]);

test('sahipsiz: ogrenciye bagli siparis sahipsiz degildir', () => {
  const r = sahipsizSiparisler([{ id: '1', student_id: 's1' }], TUM);
  assert.equal(r.length, 0);
});

test('sahipsiz: kurumu yazilmis siparis sahipsiz degildir', () => {
  const r = sahipsizSiparisler([{ id: '1', student_id: null, institution_id: 'k1' }], TUM);
  assert.equal(r.length, 0);
});

test('sahipsiz: iletisimi sistemde bulunan siparis sahipsiz degildir', () => {
  const r = sahipsizSiparisler(
    [
      { id: 'a', student_id: null, institution_id: null, customer_email: 'BILINEN@x.com' },
      { id: 'b', student_id: null, institution_id: null, customer_phone: '+90 532 111 22 33' }
    ],
    TUM
  );
  assert.equal(r.length, 0, 'eslesenler Magaza ekraninda zaten gorunuyor');
});

test('sahipsiz: hicbir yere baglanamayan siparis listelenir', () => {
  const r = sahipsizSiparisler(
    [{ id: 'x', student_id: null, institution_id: null, customer_email: 'yabanci@x.com', customer_phone: '05000000000' }],
    TUM
  );
  assert.deepEqual(r.map((o) => o.id), ['x']);
  assert.equal(r[0].sahipsiz, true);
  assert.equal(r[0].iletisim_yok, false);
});

test('sahipsiz: iletisim bilgisi hic olmayan siparis ayrica isaretlenir', () => {
  const r = sahipsizSiparisler([{ id: 'y', student_id: null, institution_id: null }], TUM);
  assert.equal(r[0].iletisim_yok, true, 'elle baglamak icin bilgi yok uyarisi');
});
