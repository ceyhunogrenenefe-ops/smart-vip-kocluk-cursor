/**
 * 5. sınıf VIP Yayınları eğitim seti — Yankı Kitapevi vitrin ürünü.
 * 5’li set: Matematik, Fen, Türkçe, Sosyal Bilgiler, İngilizce.
 */

import { slugifyTr } from './commerce-lgs8-catalog.js';

export const VIP5_SERIES = 'vip-5-egitim';
export const VIP5_CLASS_LEVELS = ['5'];

export const VIP5_SET_SLUG = '5sinif-vip-yayinlari-egitim-seti-5-li';
export const VIP5_SET_ISBN = '978-625-12345-5-0';
/** Yerel public kapak — SPA rewrite dışı /commerce/ yolu */
export const VIP5_COVER_PATH = '/commerce/vip-lgs-8-kitap-seti.jpg';

export const VIP5_SET_CONTENTS = [
  'VIP Yayınları 5. Sınıf Matematik Eğitim Seti',
  'VIP Yayınları 5. Sınıf Fen Bilimleri Eğitim Seti',
  'VIP Yayınları 5. Sınıf Türkçe Eğitim Seti',
  'VIP Yayınları 5. Sınıf Sosyal Bilgiler Eğitim Seti',
  'VIP Yayınları 5. Sınıf İngilizce Eğitim Seti',
];

const VIP5_FEATURES = [
  'MEB 5. sınıf müfredatına uyumlu fasikül / föy yapısı.',
  'VAV (VIP Anlatım Videoları) ve mobil kütüphane desteği.',
  'Konu özetleri, pekiştirme ve beceri temelli sorular.',
  'Akıllı tahta uyumlu dijital içerik.',
  '5 ders tek sette: Matematik, Fen, Türkçe, Sosyal, İngilizce.',
];

function featureBlock(features) {
  if (!Array.isArray(features) || !features.length) return '';
  return `\n\nÖne Çıkan Özellikler:\n${features.map((f) => `• ${f}`).join('\n')}`;
}

export const VIP5_BOOKS = VIP5_SET_CONTENTS.map((title, idx) => {
  const subjects = ['Matematik', 'Fen Bilimleri', 'Türkçe', 'Sosyal Bilgiler', 'İngilizce'];
  const subject = subjects[idx] || 'Diğer';
  const isbn = `978-625-12355-${idx + 1}-${(idx + 5) % 10}`;
  return {
    isbn,
    slug: slugifyTr(title),
    title,
    subtitle: `5. Sınıf · ${subject}`,
    author: 'VIP Yayınları',
    publisher: 'VIP Yayınları',
    subject,
    class_levels: [...VIP5_CLASS_LEVELS],
    exam_types: [],
    description: `${title}, 5. sınıf MEB müfredatına uygun VIP Eğitim Seti serisindendir.${featureBlock(VIP5_FEATURES)}`,
    cover_image_url: VIP5_COVER_PATH,
    is_catalog_active: false,
    metadata: {
      series: VIP5_SERIES,
      series_label: 'VIP Eğitim Seti',
      collection: 'egitim-seti',
      store_kind: 'egitim-setleri',
      grade: '5',
      publisher_group: 'VIP Yayınları',
      features: VIP5_FEATURES,
      sort_order: idx + 1,
    },
  };
});

/** Tek vitrin ürünü: 5’li VIP 5. sınıf eğitim seti. */
export const VIP5_SET = {
  isbn: VIP5_SET_ISBN,
  slug: VIP5_SET_SLUG,
  title: '5.SINIF VİP YAYINLARI EĞİTİM SETİ 5 LI',
  subtitle: '5 ders · VAV videolu fasikül seti · 5. Sınıf',
  author: 'VIP Yayınları',
  publisher: 'VIP Yayınları',
  subject: 'Eğitim Seti',
  class_levels: [...VIP5_CLASS_LEVELS],
  exam_types: [],
  description: [
    'VIP Yayınları 5. Sınıf Eğitim Seti, ortaokula geçiş dönemindeki öğrencileri MEB müfredatına uygun, planlı fasikül yapısı ve VAV video desteğiyle destekler.',
    '',
    'Satış Yankı Kitapevi üzerinden yapılır; branşlar tek tek değil, 5’li set olarak gönderilir.',
    '',
    'Set içeriği (5 ders):',
    ...VIP5_SET_CONTENTS.map((t, i) => `${i + 1}. ${t}`),
    featureBlock(VIP5_FEATURES),
  ]
    .join('\n')
    .trim(),
  cover_image_url: VIP5_COVER_PATH,
  is_catalog_active: true,
  metadata: {
    series: 'egitim-setleri',
    store_kind: 'egitim-setleri',
    series_label: 'Eğitim Setleri',
    collection: 'egitim-seti',
    is_set: true,
    book_count: 5,
    set_contents: VIP5_SET_CONTENTS,
    grade: '5',
    publisher_group: 'VIP Yayınları',
    features: VIP5_FEATURES,
    sort_order: 1,
  },
};
