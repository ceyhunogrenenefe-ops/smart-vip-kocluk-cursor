import type { TopicPool } from '../types';

/**
 * 7. Sınıf — Maarif Model 2026 müfredatı
 * Ünite · konu formatında konu havuzuna yazılır.
 */
function topicsFromUnits(units: { unit: string; topics: string[] }[]): string[] {
  const out: string[] = [];
  for (const u of units) {
    for (const topic of u.topics) {
      out.push(`${u.unit} · ${topic.trim()}`);
    }
  }
  return out;
}

const TURKCE_7 = topicsFromUnits([
  {
    unit: 'Sözcükte ve Cümlede Anlam',
    topics: ['Gerçek, mecaz, terim anlam', 'Cümlede anlam ilişkileri', 'Deyimler ve atasözleri'],
  },
  {
    unit: 'Paragraf',
    topics: ['Ana fikir', 'Yardımcı fikir', 'Paragraf oluşturma', 'Paragraf tamamlama'],
  },
  {
    unit: 'Dil Bilgisi',
    topics: ['Fiiller', 'Zamanlar', 'Sözcük türleri', 'Ekler'],
  },
  {
    unit: 'Metin Türleri',
    topics: ['Hikaye', 'Masal', 'Fabl', 'Bilgilendirici metinler'],
  },
  {
    unit: 'Yazım Kuralları',
    topics: ['Büyük harf kullanımı', 'Noktalama işaretleri', 'Yazım yanlışları'],
  },
]);

const MATEMATIK_7 = topicsFromUnits([
  {
    unit: 'Tam Sayılar',
    topics: ['Tam sayılarla işlemler', 'Mutlak değer'],
  },
  {
    unit: 'Rasyonel Sayılar',
    topics: ['Rasyonel sayı kavramı', 'Dört işlem'],
  },
  {
    unit: 'Cebirsel İfadeler',
    topics: ['Değişken kavramı', 'İfade oluşturma', 'Basit denklemler'],
  },
  {
    unit: 'Geometri',
    topics: ['Açılar', 'Üçgenler', 'Çokgenler', 'Daire ve çember'],
  },
  {
    unit: 'Veri Analizi',
    topics: ['Grafikler', 'Ortalama – medyan – mod'],
  },
  {
    unit: 'Olasılık',
    topics: ['Basit olaylar', 'Olasılık hesaplama'],
  },
]);

const FEN_7 = topicsFromUnits([
  {
    unit: 'Güneş Sistemi ve Ötesi',
    topics: ['Güneş sistemi', 'Gezegenler', 'Uzay araştırmaları'],
  },
  {
    unit: 'Hücre ve Bölünmeler',
    topics: ['Hücre yapısı', 'Mitoz bölünme'],
  },
  {
    unit: 'Kuvvet ve Enerji',
    topics: ['Kuvvet çeşitleri', 'Sürtünme', 'Enerji dönüşümleri'],
  },
  {
    unit: 'Madde ve Isı',
    topics: ['Hal değişimi', 'Isı – sıcaklık', 'Madde halleri'],
  },
  {
    unit: 'Elektrik',
    topics: ['Elektrik devreleri', 'Seri – paralel bağlama'],
  },
]);

const SOSYAL_7 = topicsFromUnits([
  {
    unit: 'İletişim ve İnsan İlişkileri',
    topics: ['İletişim türleri', 'Hak ve sorumluluk'],
  },
  {
    unit: 'Kültür ve Miras',
    topics: ['Türk-İslam tarihi', 'Kültürel miras'],
  },
  {
    unit: 'Ülkemiz ve Dünya',
    topics: ['Harita bilgisi', 'Bölgeler', 'İklim ve yerleşme'],
  },
  {
    unit: 'Üretim, Dağıtım, Tüketim',
    topics: ['Ekonomi temel kavramları', 'Kaynaklar'],
  },
  {
    unit: 'Demokrasi ve Vatandaşlık',
    topics: ['Temel haklar', 'Demokratik yönetim'],
  },
]);

const INGILIZCE_7 = topicsFromUnits([
  {
    unit: 'Daily Life',
    topics: ['Günlük rutinler', 'Sıklık zarfları'],
  },
  {
    unit: 'Preferences',
    topics: ['Like / dislike', 'Comparisons'],
  },
  {
    unit: 'Health',
    topics: ['Sağlık ifadeleri', 'Öneriler'],
  },
  {
    unit: 'Holiday',
    topics: ['Tatil planları', 'Geçmiş zaman giriş'],
  },
]);

const DIN_7 = topicsFromUnits([
  {
    unit: 'İslam’da İnanç',
    topics: ['İman esasları', 'Peygamberler'],
  },
  {
    unit: 'İbadetler',
    topics: ['Namaz', 'Oruç', 'Zekat'],
  },
  {
    unit: 'Ahlak',
    topics: ['Güzel ahlak', 'Değerler eğitimi'],
  },
]);

/** Sınıf anahtarı 7 için Maarif Model 2026 konu havuzu (mevcut 7. sınıf konularının yerine geçer) */
export const grade7Maarif2026TopicPool: TopicPool = {
  TÜRKÇE: { 7: TURKCE_7 },
  MATEMATİK: { 7: MATEMATIK_7 },
  'FEN BİLİMLERİ': { 7: FEN_7 },
  'SOSYAL BİLİMLER': { 7: SOSYAL_7 },
  İNGİLİZCE: { 7: INGILIZCE_7 },
  'DİN KÜLTÜRÜ': { 7: DIN_7 },
};
