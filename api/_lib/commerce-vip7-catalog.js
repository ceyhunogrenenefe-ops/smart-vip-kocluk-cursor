/**
 * 7. sınıf VIP Yayınları eğitim seti — Yankı Kitapevi vitrin ürünü.
 * Branşlar: Matematik, Fen, Türkçe, Sosyal Bilgiler, İngilizce, Din Kültürü.
 */

import { slugifyTr } from './commerce-lgs8-catalog.js';

export const VIP7_SERIES = 'vip-7-egitim';
export const VIP7_CLASS_LEVELS = ['7'];

export const VIP7_SET_SLUG = '7sinif-vip-yayinlari-egitim-seti-6-li';
export const VIP7_SET_ISBN = '978-625-12347-0-6';
/** Kapak yoksa VIP 8 set görseli fallback — admin sonradan değiştirebilir */
export const VIP7_COVER_PATH = '/commerce/vip-lgs-8-kitap-seti.jpg';

export const VIP7_SET_CONTENTS = [
  'VIP Yayınları 7. Sınıf Matematik Eğitim Seti',
  'VIP Yayınları 7. Sınıf Fen Bilimleri Eğitim Seti',
  'VIP Yayınları 7. Sınıf Türkçe Eğitim Seti',
  'VIP Yayınları 7. Sınıf Sosyal Bilgiler Eğitim Seti',
  'VIP Yayınları 7. Sınıf İngilizce Eğitim Seti',
  'VIP Yayınları 7. Sınıf Din Kültürü ve Ahlak Bilgisi Eğitim Seti',
];

const VIP7_FEATURES = [
  'MEB 7. sınıf müfredatına uyumlu fasikül / föy yapısı.',
  'VAV (VIP Anlatım Videoları) ve mobil kütüphane desteği.',
  'Yeni nesil / beceri temelli sorular ve konu özetleri.',
  'Akıllı tahta uyumlu dijital içerik.',
  '6 ders tek sette: Matematik, Fen, Türkçe, Sosyal, İngilizce, Din.',
];

function featureBlock(features) {
  if (!Array.isArray(features) || !features.length) return '';
  return `\n\nÖne Çıkan Özellikler:\n${features.map((f) => `• ${f}`).join('\n')}`;
}

/** Branş kitapları (paket içeriği / gizli bileşenler). */
export const VIP7_BOOKS = VIP7_SET_CONTENTS.map((title, idx) => {
  const subjects = [
    'Matematik',
    'Fen Bilimleri',
    'Türkçe',
    'Sosyal Bilgiler',
    'İngilizce',
    'Din Kültürü ve Ahlak Bilgisi',
  ];
  const subject = subjects[idx] || 'Diğer';
  const isbn = `978-625-12347-${idx + 1}-${(idx + 3) % 10}`;
  return {
    isbn,
    slug: slugifyTr(title),
    title,
    subtitle: `7. Sınıf · ${subject}`,
    author: 'VIP Yayınları',
    publisher: 'VIP Yayınları',
    subject,
    class_levels: [...VIP7_CLASS_LEVELS],
    exam_types: [],
    description: `${title}, 7. sınıf MEB müfredatına uygun VIP Eğitim Seti serisindendir.${featureBlock(VIP7_FEATURES)}`,
    cover_image_url: VIP7_COVER_PATH,
    is_catalog_active: false,
    metadata: {
      series: VIP7_SERIES,
      series_label: 'VIP Eğitim Seti',
      collection: 'egitim-seti',
      store_kind: 'egitim-setleri',
      grade: '7',
      publisher_group: 'VIP Yayınları',
      features: VIP7_FEATURES,
      sort_order: idx + 1,
    },
  };
});

/** Tek vitrin ürünü: 6’lı VIP 7. sınıf eğitim seti. */
export const VIP7_SET = {
  isbn: VIP7_SET_ISBN,
  slug: VIP7_SET_SLUG,
  title: '7.SINIF VİP YAYINLARI EĞİTİM SETİ 6 LI',
  subtitle: '6 ders · VAV videolu fasikül seti · 7. Sınıf',
  author: 'VIP Yayınları',
  publisher: 'VIP Yayınları',
  subject: 'Eğitim Seti',
  class_levels: [...VIP7_CLASS_LEVELS],
  exam_types: [],
  description: [
    'VIP Yayınları 7. Sınıf Eğitim Seti, ortaokul 7. sınıf öğrencilerini MEB müfredatına uygun, planlı fasikül yapısı ve VAV video desteğiyle destekler.',
    '',
    'Satış Yankı Kitapevi üzerinden yapılır; branşlar tek tek değil, 6’lı set olarak gönderilir.',
    '',
    'Set içeriği (6 ders):',
    ...VIP7_SET_CONTENTS.map((t, i) => `${i + 1}. ${t}`),
    featureBlock(VIP7_FEATURES),
  ]
    .join('\n')
    .trim(),
  cover_image_url: VIP7_COVER_PATH,
  is_catalog_active: true,
  metadata: {
    series: 'egitim-setleri',
    store_kind: 'egitim-setleri',
    series_label: 'Eğitim Setleri',
    collection: 'egitim-seti',
    is_set: true,
    book_count: 6,
    set_contents: VIP7_SET_CONTENTS,
    grade: '7',
    publisher_group: 'VIP Yayınları',
    features: VIP7_FEATURES,
    sort_order: 1,
  },
};
