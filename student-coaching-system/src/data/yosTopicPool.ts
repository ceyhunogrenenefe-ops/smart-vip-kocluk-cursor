import { TopicPool } from '../types';

/** Aynı ada sahip konular yalnızca öncelik sırasıyla tek derste tutulur: Matematik → Geometri → IQ. */
const YOS_ORDER = ['YÖS MATEMATİK', 'YÖS GEOMETRİ', 'YÖS IQ'] as const;
const YOS_KEY = 'YOS';

function normTopicKey(s: string) {
  return s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
}

/** Ders içi tekrarları ve dersler arası aynı isimli çakışmaları kaldırır. */
function dedupeYosAcrossSubjects(raw: Record<(typeof YOS_ORDER)[number], string[]>): TopicPool {
  const globalSeen = new Set<string>();
  const out: TopicPool = {};
  for (const subject of YOS_ORDER) {
    const list = raw[subject] || [];
    const local = new Set<string>();
    const chunk: string[] = [];
    for (const t of list) {
      const k = normTopicKey(t);
      if (!k || local.has(k) || globalSeen.has(k)) continue;
      local.add(k);
      globalSeen.add(k);
      chunk.push(t.trim());
    }
    out[subject] = { [YOS_KEY]: chunk };
  }
  return out;
}

/**
 * Ham liste — anlam olarak aynı / üst-başlık tekrarı olan birleştirilmiş:
 * (örn. iki trigonometri satırı, türev alma/uygulama, olasılık alt başlığı, üç analitik + genel geometri tek satır vb.)
 */
const RAW_YOS_TOPICS: Record<(typeof YOS_ORDER)[number], string[]> = {
  'YÖS MATEMATİK': [
    'Temel Kavramlar',
    'İşlem Kabiliyeti',
    'Sayı Basamakları',
    'Bölme Bölünebilme',
    'OBEB OKEK',
    'Rasyonel Sayılar',
    '1. Dereceden Denklemler',
    'Mutlak Değer',
    'Üslü İfadeler',
    'Köklü İfadeler',
    'Oran Orantı',
    'Denklemler, Eşitsizlikler ve Denklem Sistemleri',
    'Karışık Soru Çözümü',
    'Yaş Problemleri',
    'Yüzde Problemleri',
    'Karışım Problemleri',
    'Hareket Problemleri',
    'Sayısal Mantık ve Güncel Problemler',
    'Kümeler',
    'Mantık',
    'Fonksiyonlar ve Uygulamalar',
    'Permütasyon ve Kombinasyon',
    'Binom Açılımı',
    'Olasılık ve Koşullu-Deneysel Olasılık',
    'İstatistik ve Veri',
    'İkinci Dereceden Denklemler ve Parabol',
    'Karmaşık Sayılar',
    'Polinomlar ve Çarpanlara Ayırma',
    'Logaritma',
    'Diziler',
    'Limit ve Süreklilik',
    'Türev',
    'İntegral'
  ],
  'YÖS GEOMETRİ': [
    'Doğruda Açılar',
    'Üçgende Açılar',
    'Üçgende Alan',
    'Dik Üçgen',
    'İkizkenar ve Eşkenar Üçgen',
    'Üçgende Açıortay ve Kenarortay',
    'Üçgende Eşlik ve Benzerlik',
    'Üçgende Açı-Kenar Bağıntıları',
    'Çokgenler',
    'Dörtgenler-Deltoid',
    'Paralelkenar',
    'Eşkenar Dörtgen',
    'Dikdörtgen',
    'Kare',
    'Yamuk',
    'Çemberde Açı',
    'Çemberde Uzunluk',
    'Dairede Alan',
    'Uzay Geometri',
    'Prizmalar',
    'Piramitler',
    'Küre ve Dönel Cisimler',
    'Dönüşümler',
    'Trigonometri',
    'Analitik Geometri'
  ],
  'YÖS IQ': [
    'Şifreler',
    'Sayı Dizileri',
    'İşlemler',
    'Sayı Bağıntıları',
    'Tablolar',
    'Teraziler',
    'Eşleştirme ve Denklem Eşleştirme',
    'Küp Sayma',
    'Grafikler',
    'Çevre ve Alan',
    'KLM',
    'Şekil Tamamlama',
    'Şekil Tabloları',
    'Şekil Sıralama',
    'Farklı Olan Şekli Bulma',
    'Şekil Karşılaştırma',
    'Kağıt Kesme ve Katlama',
    'Üçgen Sayma',
    'Saat',
    'Sudoku',
    'Mantık Problemleri'
  ]
};

export const yosTopicPool: TopicPool = dedupeYosAcrossSubjects(RAW_YOS_TOPICS);
