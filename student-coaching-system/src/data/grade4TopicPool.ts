import type { TopicPool } from '../types';

/**
 * 4. Sınıf konu havuzu — kurumun '4_sinif_konulari.xlsx' listesinden (Eylül 2026).
 * Sıra dosyadaki gibi korunur. Almanca gibi burada olmayan dersler mevcut havuzdan gelir.
 */
export const grade4TopicPool: TopicPool = {
  'TÜRKÇE': {
    4: [
      'Okuma anlama',
      'Sözcükte anlam',
      'Cümlede anlam',
      'Paragraf bilgisi',
      'Yazım kuralları',
      'Noktalama işaretleri',
      'Fiiller',
      'İsimler',
      'Zamirler',
      'Hikâye unsurları',
    ],
  },
  'MATEMATİK': {
    4: [
      'Doğal sayılar',
      'Toplama-çıkarma',
      'Çarpma-bölme',
      'Problemler',
      'Kesirler',
      'Zaman ölçüleri',
      'Uzunluk/ağırlık/sıvı ölçme',
      'Geometrik şekiller',
      'Alan ve çevre',
      'Veri ve grafikler',
    ],
  },
  'FEN BİLİMLERİ': {
    4: [
      'Vücudumuzun sistemleri',
      'Madde ve özellikleri',
      'Kuvvet ve hareket',
      'Işık ve ses',
      'Dünya ve evren',
      'Basit elektrik devreleri',
    ],
  },
  'SOSYAL BİLGİLER': {
    4: [
      'Birey ve toplum',
      'Kültür ve miras',
      'İnsanlar, yerler ve çevreler',
      'Üretim, dağıtım ve tüketim',
      'Bilim, teknoloji ve toplum',
      'Etkin vatandaşlık',
      'Küresel bağlantılar',
    ],
  },
  'DİN KÜLTÜRÜ': {
    4: [
      'İslam’ın şartları',
      'Güzel ahlak',
      'İbadetler',
      'Peygamberimizin hayatı',
    ],
  },
  'DİĞER DERSLER': {
    4: [
      'Görsel sanatlar',
      'Müzik',
      'Beden eğitimi',
    ],
  },
};
