/**
 * 8. sınıf LGS kitap mağazası — VIP / Paraf / Deneme koleksiyonları
 * ve Yankı Kitapevi satıcı kimliği.
 */

import { liraToKurus } from './commerce-utils.js';

export const YANKI_VENDOR_SLUG = 'yanki-kitapevi';
export const YANKI_VENDOR_NAME = 'Yankı Kitapevi';
export const YANKI_VENDOR_EMAIL = 'yanki@kitapevi.com';

export const VIP_LGS8_SERIES = 'vip-lgs-8-egitim';
export const PARAF_LGS8_SERIES = 'paraf-lgs-8-egitim';
export const LGS8_DENEME_SERIES = 'lgs-8-denemeler';

export const VIP_LGS8_SET_SLUG = 'vip-lgs-8-kitap-seti';
export const VIP_LGS8_SET_ISBN = '978-625-12345-0-0';
export const VIP_LGS8_COVER_PATH = '/commerce/vip-lgs-8-kitap-seti.jpg';

export const PARAF_LGS8_SET_SLUG = 'paraf-8-sinif-iq-lgs-soru-kutuphanesi-seti';
export const PARAF_LGS8_SET_ISBN = '978-625-78901-0-4';
export const PARAF_LGS8_COVER_PATH = '/commerce/paraf-lgs-8-iq-soru-kutuphanesi-seti.jpg';

export const LGS8_CLASS_LEVELS = ['8', 'LGS'];

const TR_MAP = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
  â: 'a',
  î: 'i',
  û: 'u',
  Ç: 'c',
  Ğ: 'g',
  İ: 'i',
  I: 'i',
  Ö: 'o',
  Ş: 's',
  Ü: 'u',
};

export function slugifyTr(value) {
  const mapped = String(value || '')
    .split('')
    .map((ch) => TR_MAP[ch] ?? ch)
    .join('');
  return mapped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function isLgs8ClassLevel(value) {
  if (value == null || value === '') return false;
  const s = String(value).trim().toLocaleUpperCase('tr');
  if (s === 'LGS' || s === '8' || s.startsWith('8.') || s.startsWith('8 ')) return true;
  const n = parseInt(String(value), 10);
  return n === 8;
}

export function offerStatusForPrice(priceKurus, { approveIfPriced = true } = {}) {
  const n = Number(priceKurus) || 0;
  if (approveIfPriced && n > 0) return 'approved';
  return 'draft';
}

function featureBlock(features) {
  if (!Array.isArray(features) || !features.length) return '';
  const lines = features.map((f) => `• ${f}`).join('\n');
  return `\n\nÖne Çıkan Özellikler:\n${lines}`;
}

function book({
  isbn,
  title,
  subject,
  fascicleCount,
  description,
  features,
  sortOrder,
}) {
  return {
    isbn,
    slug: slugifyTr(title),
    title,
    subtitle: `${fascicleCount} Föy / Fasikül · 8. Sınıf LGS`,
    author: 'VIP Yayınları',
    publisher: 'VIP Yayınları',
    subject,
    class_levels: [...LGS8_CLASS_LEVELS],
    exam_types: ['LGS'],
    description: `${description}${featureBlock(features)}`.trim(),
    cover_image_url: VIP_LGS8_COVER_PATH,
    is_catalog_active: true,
    metadata: {
      series: VIP_LGS8_SERIES,
      series_label: 'VIP Eğitim Seti',
      collection: 'egitim-seti',
      fascicle_count: fascicleCount,
      grade: '8',
      exam: 'LGS',
      publisher_group: 'VIP Yayınları',
      features,
      sort_order: sortOrder,
    },
  };
}

export const VIP_LGS8_BOOKS = [
  book({
    isbn: '978-625-12345-1-7',
    title: 'VIP Yayınları 8. Sınıf LGS Fen Bilimleri Eğitim Seti',
    subject: 'Fen Bilimleri',
    fascicleCount: 31,
    sortOrder: 1,
    description:
      'VIP Yayınları 8. Sınıf Fen Bilimleri Eğitim Seti, MEB müfredatına ve LGS sınav formatına %100 uyumlu olarak hazırlanmıştır. 31 haftalık fasikül yapısı sayesinde konuları adım adım ve planlı bir şekilde öğrenmenizi sağlar.',
    features: [
      'VAV (VIP Anlatım Videoları): Takıldığınız konularda video konu anlatımları ve detaylı soru çözümleri.',
      'Yeni Nesil ve Beceri Temelli Sorular: Deney, grafik ve tablo yorumlama ağırlıklı özgün sorular.',
      'Akıllı Tahta ve Mobil Kütüphane Uyumlu: Dijital eğitime tam entegre.',
      'Adım Adım Başarı: Konu özetleri, pekiştirme etkinlikleri ve bölüm sonu LGS tarama testleri.',
    ],
  }),
  book({
    isbn: '978-625-12345-2-4',
    title: 'VIP Yayınları 8. Sınıf LGS Matematik Eğitim Seti',
    subject: 'Matematik',
    fascicleCount: 39,
    sortOrder: 2,
    description:
      'LGS hazırlık sürecinde öğrencilerin en çok zorlandığı matematik dersini pratik, anlaşılır ve keyifli hale getiren VIP 8. Sınıf Matematik Eğitim Seti, kapsamlı 39 fasikülden oluşmaktadır.',
    features: [
      'Akıl Yürütme ve Mantık Soruları: PISA/TIMSS ve MEB örnek soruları formatında yeni nesil problem yaklaşımları.',
      'VAV Desteği: Tüm fasiküller için video anlatım ve video çözüm desteği.',
      'Kademeli Soru Sistemi: Temel seviyeden başlayarak LGS zorluk seviyesine ulaşan soru kurgusu.',
      'Akıllı Tahta & Mobil Kütüphane: Hem sınıf içi hem bireysel çalışma için uygun altyapı.',
    ],
  }),
  book({
    isbn: '978-625-12345-3-1',
    title: 'VIP Yayınları 8. Sınıf LGS Türkçe Eğitim Seti',
    subject: 'Türkçe',
    fascicleCount: 38,
    sortOrder: 3,
    description:
      'Paragraf yorumlama, sözel mantık-muhakeme ve dil bilgisi konularını eksiksiz kapsayan VIP 8. Sınıf Türkçe Eğitim Seti, 38 haftalık çalışma programıyla sınavda tam isabet hedefleyen öğrenciler için tasarlandı.',
    features: [
      'Sözel Mantık & Muhakeme: Özel şifreleme ve görsel/tablo okuma stratejileri.',
      'Okuma Anlama & Paragraf Analizi: Uzun metinlerde hızlı okuma ve doğru analiz becerisi kazandıran sorular.',
      'VAV Video Çözüm Desteği: Çözülemeyen tüm soruların uzman öğretmenler tarafından videolu anlatımı.',
      'Güncel MEB Formatı: En son yayımlanan örnek sorularla birebir uyumlu içerik.',
    ],
  }),
  book({
    isbn: '978-625-12345-4-8',
    title: 'VIP Yayınları 8. Sınıf LGS İngilizce Eğitim Seti',
    subject: 'İngilizce',
    fascicleCount: 21,
    sortOrder: 4,
    description:
      '8. Sınıf İngilizce müfredatındaki 10 ünitenin tamamını kelime bilgisi, diyalog tamamlama ve görsel okuma etkinlikleriyle ele alan 21 fasiküllük VIP İngilizce Eğitim Seti.',
    features: [
      'Tematik Kelime Listeleri: Ünite bazlı kritik kelimeler ve eş anlamlı/zıt anlamlı yapıları.',
      'Diyalog & Durum Soruları: Günlük konuşma kalıpları ve görsel destekli yeni nesil LGS soruları.',
      'VAV Anlatım Videoları: Telaffuz ve konu anlatım desteği.',
      'Soru Çözüm Videoları: Eksiksiz soru analizleri ve akıllı tahta uyumu.',
    ],
  }),
  book({
    isbn: '978-625-12345-5-5',
    title: 'VIP Yayınları 8. Sınıf LGS Din Kültürü ve Ahlak Bilgisi Eğitim Seti',
    subject: 'Din Kültürü ve Ahlak Bilgisi',
    fascicleCount: 17,
    sortOrder: 5,
    description:
      "Ayet ve hadis yorumlama, kavram analizi ve çıkarım yapma becerilerini güçlendiren VIP 8. Sınıf Din Kültürü ve Ahlak Bilgisi Eğitim Seti, 17 fasikül ile LGS'de full yapmayı hedefler.",
    features: [
      'Kavram Haritaları & Özetler: Ünite bazlı kritik dini kavramların yalın anlatımı.',
      'Ayet-Hadis Yorumlama Odaklı: Ezberden uzak, anlama ve mantık yürütmeye dayalı soru tipleri.',
      'VAV & Mobil Kütüphane: Video anlatım ve detaylı soru çözümleri.',
      'Kısa Zamanda Tam Tekrar: Fasikül yapısı ile hızlı ve verimli konu taraması.',
    ],
  }),
  book({
    isbn: '978-625-12345-6-2',
    title: 'VIP Yayınları 8. Sınıf LGS T.C. İnkılap Tarihi ve Atatürkçülük Eğitim Seti',
    subject: 'T.C. İnkılap Tarihi ve Atatürkçülük',
    fascicleCount: 21,
    sortOrder: 6,
    description:
      'Kronolojik olay zinciri, harita okuma ve tarihi metinleri analiz etme üzerine kurgulanan VIP 8. Sınıf İnkılap Tarihi ve Atatürkçülük Eğitim Seti, 21 fasikülden oluşan zengin içeriğe sahiptir.',
    features: [
      'Harita, Tablo ve Görsel Yorumlama: LGS’de belirleyici olan görsel okuma odaklı sorular.',
      'Neden-Sonuç İlişkisi Kurgusu: Tarihi olayları ezberletmeyen, mantık ilişkisi kurduran içerik planı.',
      'VAV Video Çözüm: Video destekli anlatımlar ve adım adım soru çözümleri.',
      'Akıllı Tahta & Mobil Kütüphane Entegrasyonu: Tam dijital içerik desteği.',
    ],
  }),
];

export const VIP_LGS8_PACKAGE = {
  name: 'VIP Yayınları 8. Sınıf LGS Kitap Seti',
  slug: VIP_LGS8_SET_SLUG,
  class_level: '8',
  program: 'lgs',
  isbn: VIP_LGS8_SET_ISBN,
  cover_image_url: VIP_LGS8_COVER_PATH,
  description:
    'Bu kapsamlı VIP LGS Kitap Seti, 8. Sınıf öğrencilerini Liselere Giriş Sınavı’na (LGS) eksiksiz bir şekilde hazırlar. Altı ana ders (Fen, Matematik, Türkçe, İngilizce, Din Kültürü ve İnkılap Tarihi) için VAV destekli, detaylı ve güncel konu anlatımlı, çözümlü soru bankaları ve interaktif dijital içeriklerle donatılmıştır.',
  book_isbns: VIP_LGS8_BOOKS.map((b) => b.isbn),
};

export const PARAF_LGS8_IQ_SET_CONTENTS = [
  'Paraf 8. Sınıf IQ Türkçe Soru Kütüphanesi',
  'Paraf 8. Sınıf IQ Matematik Soru Kütüphanesi',
  'Paraf 8. Sınıf IQ Fen Bilimleri Soru Kütüphanesi',
  'Paraf 8. Sınıf IQ T.C. İnkılap Tarihi ve Atatürkçülük Soru Kütüphanesi',
  'Paraf 8. Sınıf IQ İngilizce Soru Kütüphanesi',
  'Paraf 8. Sınıf LGS Sözel Mantık ve Paragraf Soru Kütüphanesi',
];

const PARAF_IQ_FEATURES = [
  'IQ ve mantık odaklı yeni nesil sorular (PISA / TIMSS formatı).',
  'Tamamı video çözümlü soru bankası.',
  'Sözel mantık ve paragraf gücü: metin analizi, şifreleme, görsel yorumlama.',
  'Akıllı tahta ve mobil kütüphane desteği.',
  'Kademeli / sarmal test yapısı: kavramadan deneme tadına.',
  '1. hamur, renkli baskı, karton kapak.',
];

/** Tek ürün: 6 kitaplık set. Branşlar ayrı satılmaz. */
export const PARAF_LGS8_IQ_SET = {
  isbn: PARAF_LGS8_SET_ISBN,
  slug: PARAF_LGS8_SET_SLUG,
  title: 'Paraf Yayınları 8. Sınıf IQ LGS Soru Kütüphanesi Hazırlık Seti (6 Kitap)',
  subtitle: '6 kitaplık set · Soru bankası ve deneme · 8. Sınıf LGS',
  author: 'Paraf Yayınları',
  publisher: 'Paraf Yayınları',
  subject: 'LGS Set',
  class_levels: [...LGS8_CLASS_LEVELS],
  exam_types: ['LGS'],
  description: [
    'Paraf Yayınları 8. Sınıf IQ LGS Soru Kütüphanesi Seti, Liselere Geçiş Sınavı’na (LGS) hazırlanan öğrencilerin muhakeme, analitik düşünme ve yeni nesil soru çözme becerilerini en üst seviyeye çıkarmak için özel olarak hazırlanmıştır. MEB güncel müfredatına ve LGS sınav standartlarına %100 uyumludur.',
    '',
    'Set, IQ serisi branş soru bankaları ile LGS’nin belirleyicisi Sözel Mantık ve Paragraf kitabını tek pakette sunar. Satış Yankı Kitapevi üzerinden yapılır; kitaplar tek tek değil, 6’lı set olarak gönderilir.',
    '',
    'Set içeriği (6 kitap):',
    ...PARAF_LGS8_IQ_SET_CONTENTS.map((t, i) => `${i + 1}. ${t}`),
    featureBlock(PARAF_IQ_FEATURES),
  ].join('\n').trim(),
  cover_image_url: PARAF_LGS8_COVER_PATH,
  is_catalog_active: true,
  metadata: {
    series: PARAF_LGS8_SERIES,
    series_label: 'Paraf Eğitim Seti',
    collection: 'egitim-seti',
    is_set: true,
    book_count: 6,
    set_contents: PARAF_LGS8_IQ_SET_CONTENTS,
    grade: '8',
    exam: 'LGS',
    publisher_group: 'Paraf Yayınları',
    paper: '1. Hamur, Renkli Baskı, Karton Kapak',
    language: 'Türkçe',
    features: PARAF_IQ_FEATURES,
    sort_order: 1,
  },
};

export const LGS8_COLLECTIONS = [
  {
    key: VIP_LGS8_SERIES,
    label: 'VIP Eğitim Seti',
    publisher: 'VIP Yayınları',
    class_level: '8',
    exam: 'LGS',
    coming_soon: false,
    cover_image_url: VIP_LGS8_COVER_PATH,
    description: '6 ders · VAV videolu fasikül seti · Yankı Kitapevi kargosu',
  },
  {
    key: PARAF_LGS8_SERIES,
    label: 'Paraf Eğitim Seti',
    publisher: 'Paraf Yayınları',
    class_level: '8',
    exam: 'LGS',
    coming_soon: false,
    cover_image_url: PARAF_LGS8_COVER_PATH,
    description: 'IQ Soru Kütüphanesi · 6 kitaplık set · Yankı Kitapevi',
  },
  {
    key: LGS8_DENEME_SERIES,
    label: 'Denemeler',
    publisher: null,
    class_level: '8',
    exam: 'LGS',
    coming_soon: true,
    cover_image_url: null,
    description: 'LGS deneme setleri yakında eklenecek.',
  },
];

export function yankiVendorDefaults(extra = {}) {
  return {
    name: YANKI_VENDOR_NAME,
    slug: YANKI_VENDOR_SLUG,
    description: 'Online VIP Dershane 8. sınıf LGS kitapları — kargo Yankı Kitapevi tarafından gönderilir.',
    contact_email: extra.contact_email || YANKI_VENDOR_EMAIL,
    contact_phone: extra.contact_phone || null,
    city: extra.city || 'İstanbul',
    commission_rate: extra.commission_rate ?? 0,
    is_active: true,
    institution_id: extra.institution_id || null,
    linked_kitapci_id: extra.linked_kitapci_id || null,
    meta: {
      fulfillment: 'yanki-kitapevi',
      whatsapp_notify: true,
      ...(extra.meta && typeof extra.meta === 'object' ? extra.meta : {}),
    },
  };
}

function parsePriceKurus(raw) {
  if (raw == null || raw === '') return 0;
  if (raw.price_kurus != null && raw.price_kurus !== '') {
    const n = parseInt(String(raw.price_kurus), 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  const lira = raw.price_lira ?? raw.price ?? raw.fiyat;
  if (lira == null || lira === '') return 0;
  const n = Number(String(lira).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return liraToKurus(n);
}

/**
 * Admin toplu yükleme satırını katalog kaydına çevirir.
 * Fiyat yoksa teklif taslak kalır (mağazada "Fiyat yakında").
 */
export function normalizeBulkBookInput(raw = {}) {
  const title = String(raw.title || raw.urun_adi || '').trim();
  if (!title) throw new Error('Ürün adı (title) gerekli');
  const isbn = String(raw.isbn || raw.barkod || '').replace(/\s/g, '') || null;
  const fascicleCount = parseInt(String(raw.fascicle_count ?? raw.fasikul ?? raw.icerk ?? ''), 10);
  const series = String(raw.series || VIP_LGS8_SERIES).trim() || VIP_LGS8_SERIES;
  const publisher = String(raw.publisher || raw.yayinevi || 'VIP Yayınları').trim();
  const classLevels = Array.isArray(raw.class_levels) && raw.class_levels.length
    ? raw.class_levels.map((x) => String(x))
    : [...LGS8_CLASS_LEVELS];
  const features = Array.isArray(raw.features) ? raw.features.map((x) => String(x).trim()).filter(Boolean) : [];
  const descriptionBase = String(raw.description || raw.aciklama || '').trim();
  const price_kurus = parsePriceKurus(raw);
  const stock = parseInt(String(raw.stock ?? raw.stok ?? 100), 10);
  return {
    isbn,
    slug: String(raw.slug || slugifyTr(title)),
    title,
    subtitle: String(raw.subtitle || '').trim() || null,
    author: String(raw.author || publisher).trim() || null,
    publisher,
    subject: String(raw.subject || raw.ders || '').trim() || null,
    class_levels: classLevels,
    exam_types: Array.isArray(raw.exam_types) && raw.exam_types.length ? raw.exam_types : ['LGS'],
    description: `${descriptionBase}${featureBlock(features)}`.trim() || null,
    cover_image_url: String(raw.cover_image_url || '').trim() || null,
    is_catalog_active: raw.is_catalog_active !== false,
    metadata: {
      series,
      series_label: String(raw.series_label || '').trim() || null,
      collection: String(raw.collection || 'egitim-seti').trim(),
      fascicle_count: Number.isFinite(fascicleCount) && fascicleCount > 0 ? fascicleCount : null,
      grade: '8',
      exam: 'LGS',
      publisher_group: publisher,
      features,
      ...(raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {}),
    },
    price_kurus,
    stock_quantity: Number.isFinite(stock) && stock >= 0 ? stock : 100,
    shipping_days: parseInt(String(raw.shipping_days ?? 3), 10) || 3,
  };
}

export function vipLgs8BulkRows(priceOverrides = {}) {
  return VIP_LGS8_BOOKS.map((b) => ({
    ...b,
    price_kurus: parsePriceKurus(priceOverrides[b.isbn] || priceOverrides[b.slug] || {}),
    stock_quantity: 100,
    shipping_days: 3,
  }));
}
