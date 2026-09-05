import type { TopicPool } from '../types';

/**
 * 2. Sınıf — Maarif Model 2026 müfredatı
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

const TURKCE_2 = topicsFromUnits([
  {
    unit: 'Dinleme ve Konuşma',
    topics: ['Dinleme kuralları', 'Doğru konuşma', 'Kendini ifade etme'],
  },
  {
    unit: 'Okuma',
    topics: ['Akıcı okuma', 'Anlamlı okuma', 'Kısa metinler'],
  },
  {
    unit: 'Anlama',
    topics: ['Metin anlama', 'Ana fikir', 'Basit çıkarım yapma'],
  },
  {
    unit: 'Yazma',
    topics: ['Cümle yazma', 'Kısa paragraf oluşturma', 'Duygu ve düşünce yazma'],
  },
  {
    unit: 'Dil Bilgisi',
    topics: ['Harf ve hece bilgisi', 'Sözcük türlerine giriş', 'Büyük harf kullanımı'],
  },
]);

const MATEMATIK_2 = topicsFromUnits([
  {
    unit: 'Doğal Sayılar',
    topics: ['1000’e kadar sayılar', 'Sayı örüntüleri', 'Basamak değeri'],
  },
  {
    unit: 'Toplama ve Çıkarma',
    topics: ['Zihinden toplama', 'Zihinden çıkarma', 'Problem çözme'],
  },
  {
    unit: 'Çarpma Giriş',
    topics: ['Tekrar eden toplama', 'Çarpma mantığı'],
  },
  {
    unit: 'Geometri',
    topics: ['Şekiller', 'Düzlemsel şekiller', 'Simetri'],
  },
  {
    unit: 'Ölçme',
    topics: ['Uzunluk ölçme', 'Zaman ölçme', 'Paralar'],
  },
  {
    unit: 'Veri',
    topics: ['Basit grafikler', 'Veri okuma'],
  },
]);

const HAYAT_BILGISI_2 = topicsFromUnits([
  {
    unit: 'Ben ve Okulum',
    topics: ['Okul kuralları', 'Sınıf düzeni', 'Sorumluluklar'],
  },
  {
    unit: 'Sağlıklı Yaşam',
    topics: ['Temizlik', 'Beslenme', 'Sağlıklı alışkanlıklar'],
  },
  {
    unit: 'Güvenli Hayat',
    topics: ['Trafik kuralları', 'Güvenli davranışlar', 'Acil durumlar'],
  },
  {
    unit: 'Doğada Yaşam',
    topics: ['Canlılar', 'Çevre bilinci', 'Doğayı koruma'],
  },
  {
    unit: 'Ülkem ve Dünya',
    topics: ['Bayrak ve milli değerler', 'Basit harita bilgisi'],
  },
]);

const INGILIZCE_2 = topicsFromUnits([
  {
    unit: 'Greetings',
    topics: ['Selamlaşma', 'Tanışma'],
  },
  {
    unit: 'Numbers',
    topics: ['1–20 sayılar', 'Basit sayma'],
  },
  {
    unit: 'Colors',
    topics: ['Renkler', 'Eşleştirme'],
  },
  {
    unit: 'Classroom Objects',
    topics: ['Sınıf eşyaları', 'Basit kelime bilgisi'],
  },
]);

const DIN_2 = topicsFromUnits([
  {
    unit: 'Değerler',
    topics: ['Sevgi', 'Saygı', 'Yardımlaşma'],
  },
  {
    unit: 'Temel Dini Bilgiler',
    topics: ['Allah sevgisi', 'Peygamber sevgisi'],
  },
]);

/** Sınıf anahtarı 2 için Maarif Model 2026 konu havuzu (yeni eklenen 2. sınıf) */
export const grade2Maarif2026TopicPool: TopicPool = {
  TÜRKÇE: { 2: TURKCE_2 },
  MATEMATİK: { 2: MATEMATIK_2 },
  'HAYAT BİLGİSİ': { 2: HAYAT_BILGISI_2 },
  İNGİLİZCE: { 2: INGILIZCE_2 },
  'DİN KÜLTÜRÜ': { 2: DIN_2 },
};
