import test from 'node:test';
import assert from 'node:assert/strict';
import { dersAdi, hatirlatmaListesi, ogretmenAdiBicimle, VARSAYILAN_METIN } from '../yazili-hazirlik-hatirlatma.js';
import { renderMessageTemplate } from '../template-engine.js';

const classes = [
  { id: 'c9', name: '9-A' },
  { id: 'c11a', name: '11 A' },
  { id: 'c11b', name: '11 B' }
];
const users = [
  { id: 't1', name: 'CEYHUN ÖĞRENENEFE', phone: '05551112233' },
  { id: 't2', name: 'EMRE KARABOYUN', phone: '05551112244' },
  { id: 't3', name: 'Reha Apaydın', phone: '' },
  { id: 't4', name: 'Pasif Hoca', phone: '05551112255', is_active: false }
];
const ders = (class_id, teacher_id, subject, lesson_date) => ({ class_id, teacher_id, subject, lesson_date });

test('yalnız o sınıfa hiç PDF yüklemeyen öğretmen listelenir', () => {
  const liste = hatirlatmaListesi({
    sessions: [
      ders('c11a', 't1', 'Fizik (Yazılıya Hazırlık)', '2026-11-01'),
      ders('c11a', 't1', 'Fizik (Yazılıya Hazırlık)', '2026-11-03'),
      ders('c11b', 't1', 'Fizik (Yazılıya Hazırlık)', '2026-11-02'),
      ders('c11a', 't2', 'Edebiyat (Yazılıya Hazırlık)', '2026-11-10'),
      ders('c11b', 't2', 'Edebiyat (Yazılıya Hazırlık)', '2026-11-10'),
      ders('c9', 't3', 'Edebiyat (Yazılıya Hazırlık)', '2026-11-10'),
      ders('c9', 't4', 'Kimya (Yazılıya Hazırlık)', '2026-11-01')
    ],
    files: [
      { class_id: 'c11a', teacher_user_id: 't2' },
      // farklı ders adıyla yüklemiş olsa da sınıfa yüklediği için hatırlatılmaz
      { class_id: 'c9', teacher_user_id: 't3' }
    ],
    classes,
    users,
    sonGonderim: new Map([['t2', '2026-10-22T10:00:00Z']])
  });

  assert.deepEqual(
    liste.map((t) => t.teacher_id),
    ['t1', 't2']
  );
  const ceyhun = liste[0];
  assert.equal(ceyhun.phone_ok, true);
  assert.deepEqual(
    ceyhun.eksikler.map((e) => [e.class_name, e.ders, e.ilk_ders]),
    [
      ['11 A', 'Fizik', '2026-11-01'],
      ['11 B', 'Fizik', '2026-11-02']
    ]
  );
  const emre = liste[1];
  assert.deepEqual(emre.eksikler.map((e) => e.class_name), ['11 B']);
  assert.equal(emre.last_sent, '2026-10-22T10:00:00Z');
});

test('ad biçimi ve mesaj', () => {
  assert.equal(ogretmenAdiBicimle('HURİ  BALCI'), 'Huri Balcı');
  assert.equal(ogretmenAdiBicimle('CEYHUN ÖĞRENENEFE'), 'Ceyhun Öğrenenefe');
  assert.equal(ogretmenAdiBicimle('SİNAN ERCAN'), 'Sinan Ercan');
  assert.equal(dersAdi('Matematik  (Yazılıya Hazırlık)'), 'Matematik');
  const m = renderMessageTemplate(VARSAYILAN_METIN, { ogretmen_adi: 'Huri Balcı' });
  assert.ok(m.startsWith('Değerli Öğretmenimiz Huri Balcı,\n'));
  assert.ok(m.endsWith('Online VIP Dershane Yönetimi'));
});
