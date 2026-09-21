import type { TopicPool } from '../types';

/**
 * 7. Sınıf — Maarif Modeli temaları (kurumun '7_Sinif_Maarif_Modeli_Konu_Takip.xlsx', Eylül 2026).
 * Sıra dosyadaki gibi korunur. Ders anahtarları sistemde kullanılanlarla aynı
 * (Sosyal Bilgiler → 'SOSYAL BİLİMLER', Din Kültürü ve Ahlak Bilgisi → 'DİN KÜLTÜRÜ').
 */
export const grade7Maarif2026TopicPool: TopicPool = {
  'TÜRKÇE': {
    7: [
      'Hayat Boyu Gelişim',
      'Bir Hilal Uğruna',
      'İletişim ve Sosyal İlişkiler',
      'Türk Sanatı',
      'Okuma Kültürü',
      'Hak ve Sorumluluklar',
    ],
  },
  'MATEMATİK': {
    7: [
      'Sayılar ve Nicelikler',
      'İşlemlerle Cebirsel Düşünme ve Değişimler',
      'Dönüşüm',
      'Geometrik Nicelikler',
      'Geometrik Şekiller',
      'İstatistik ve Olasılık',
    ],
  },
  'FEN BİLİMLERİ': {
    7: [
      'Uzay Çağı',
      'Kuvvet ve Enerji',
      'Sistemler',
      'Işığın Kırılması ve Mercekler',
      'Madde',
      'Elektriklenme',
      'Sürdürülebilir Yaşam',
    ],
  },
  'SOSYAL BİLİMLER': {
    7: [
      'Birlikte Yaşamak',
      'Evimiz Dünya',
      'Ortak Mirasımız',
      'Demokrasi',
      'Ekonomi',
      'Teknoloji ve Sosyal Bilimler',
    ],
  },
  'İNGİLİZCE': {
    7: [
      'Kişilik ve Dış Görünüş',
      'Günlük Rutinler ve Spor',
      'Geçmiş Zaman ve Biyografiler',
      'Vahşi Yaşam ve Çevre',
      'Kutlamalar ve Gelecek Planları',
    ],
  },
  'DİN KÜLTÜRÜ': {
    7: [
      'Melek ve Ahiret İnancı',
      'Hac, Umre ve Kurban',
      'Ahlaki Davranışlar ve İslam Yorumları',
      'Hz. Muhammed\'in Hayatı',
      'Dünya Dinleri',
    ],
  },
};

/**
 * Eylül 2026 güncellemesiyle kaldırılan eski 7. sınıf konuları; tarayıcıda saklanan
 * konu havuzundan (customTopics) yüklemede ayıklanır. Koçun eklediği konular kalır.
 */
export const RETIRED_GRADE7_TOPICS: Record<string, string[]> = {
  'TÜRKÇE': [
    'Sözcükte ve Cümlede Anlam · Gerçek, mecaz, terim anlam',
    'Sözcükte ve Cümlede Anlam · Cümlede anlam ilişkileri',
    'Sözcükte ve Cümlede Anlam · Deyimler ve atasözleri',
    'Paragraf · Ana fikir',
    'Paragraf · Yardımcı fikir',
    'Paragraf · Paragraf oluşturma',
    'Paragraf · Paragraf tamamlama',
    'Dil Bilgisi · Fiiller',
    'Dil Bilgisi · Zamanlar',
    'Dil Bilgisi · Sözcük türleri',
    'Dil Bilgisi · Ekler',
    'Metin Türleri · Hikaye',
    'Metin Türleri · Masal',
    'Metin Türleri · Fabl',
    'Metin Türleri · Bilgilendirici metinler',
    'Yazım Kuralları · Büyük harf kullanımı',
    'Yazım Kuralları · Noktalama işaretleri',
    'Yazım Kuralları · Yazım yanlışları',
  ],
  'MATEMATİK': [
    'Tam Sayılar · Tam sayılarla işlemler',
    'Tam Sayılar · Mutlak değer',
    'Rasyonel Sayılar · Rasyonel sayı kavramı',
    'Rasyonel Sayılar · Dört işlem',
    'Cebirsel İfadeler · Değişken kavramı',
    'Cebirsel İfadeler · İfade oluşturma',
    'Cebirsel İfadeler · Basit denklemler',
    'Geometri · Açılar',
    'Geometri · Üçgenler',
    'Geometri · Çokgenler',
    'Geometri · Daire ve çember',
    'Veri Analizi · Grafikler',
    'Veri Analizi · Ortalama – medyan – mod',
    'Olasılık · Basit olaylar',
    'Olasılık · Olasılık hesaplama',
  ],
  'FEN BİLİMLERİ': [
    'Güneş Sistemi ve Ötesi · Güneş sistemi',
    'Güneş Sistemi ve Ötesi · Gezegenler',
    'Güneş Sistemi ve Ötesi · Uzay araştırmaları',
    'Hücre ve Bölünmeler · Hücre yapısı',
    'Hücre ve Bölünmeler · Mitoz bölünme',
    'Kuvvet ve Enerji · Kuvvet çeşitleri',
    'Kuvvet ve Enerji · Sürtünme',
    'Kuvvet ve Enerji · Enerji dönüşümleri',
    'Madde ve Isı · Hal değişimi',
    'Madde ve Isı · Isı – sıcaklık',
    'Madde ve Isı · Madde halleri',
    'Elektrik · Elektrik devreleri',
    'Elektrik · Seri – paralel bağlama',
  ],
  'SOSYAL BİLİMLER': [
    'İletişim ve İnsan İlişkileri · İletişim türleri',
    'İletişim ve İnsan İlişkileri · Hak ve sorumluluk',
    'Kültür ve Miras · Türk-İslam tarihi',
    'Kültür ve Miras · Kültürel miras',
    'Ülkemiz ve Dünya · Harita bilgisi',
    'Ülkemiz ve Dünya · Bölgeler',
    'Ülkemiz ve Dünya · İklim ve yerleşme',
    'Üretim, Dağıtım, Tüketim · Ekonomi temel kavramları',
    'Üretim, Dağıtım, Tüketim · Kaynaklar',
    'Demokrasi ve Vatandaşlık · Temel haklar',
    'Demokrasi ve Vatandaşlık · Demokratik yönetim',
  ],
  'İNGİLİZCE': [
    'Daily Life · Günlük rutinler',
    'Daily Life · Sıklık zarfları',
    'Preferences · Like / dislike',
    'Preferences · Comparisons',
    'Health · Sağlık ifadeleri',
    'Health · Öneriler',
    'Holiday · Tatil planları',
    'Holiday · Geçmiş zaman giriş',
  ],
  'DİN KÜLTÜRÜ': [
    'İslam’da İnanç · İman esasları',
    'İslam’da İnanç · Peygamberler',
    'İbadetler · Namaz',
    'İbadetler · Oruç',
    'İbadetler · Zekat',
    'Ahlak · Güzel ahlak',
    'Ahlak · Değerler eğitimi',
  ],
};

export function stripRetiredGrade7Topics(p: TopicPool): TopicPool {
  const next: TopicPool = { ...p };
  for (const [subject, retiredList] of Object.entries(RETIRED_GRADE7_TOPICS)) {
    const levels = next[subject];
    const current = levels?.[7] ?? levels?.['7'];
    if (!current) continue;
    const drop = new Set(retiredList);
    next[subject] = { ...levels, 7: current.filter((t) => !drop.has(t)) };
  }
  return next;
}
