import type { TopicPool } from '../types';

/**
 * 11. Sınıf — Maarif Model 2026 müfredatı
 * Ünite · konu formatında; Fizik “Serbest düşme” alt konuları ayrı satır.
 */
function topicsFromUnits(
  units: { unit: string; topics: string[]; expand?: Record<string, string[]> }[]
): string[] {
  const out: string[] = [];
  for (const u of units) {
    for (const topic of u.topics) {
      const clean = topic.replace(/^📌\s*/, '').replace(/\s*\(GÜNCEL EK\)\s*$/i, '').trim();
      out.push(`${u.unit} · ${clean}`);
      const subKey = Object.keys(u.expand || {}).find((k) =>
        clean.toLocaleLowerCase('tr-TR').includes(k.toLocaleLowerCase('tr-TR'))
      );
      if (subKey && u.expand?.[subKey]) {
        for (const sub of u.expand[subKey]) {
          out.push(`${u.unit} · ${clean} · ${sub}`);
        }
      }
    }
  }
  return out;
}

const EDEBIYAT_11 = topicsFromUnits([
  {
    unit: 'Anlam Bilgisi',
    topics: ['Paragraf anlamı', 'Cümlede anlam', 'Anlatım bozuklukları'],
  },
  {
    unit: 'Hikaye ve Roman',
    topics: ['Hikaye türleri', 'Anlatım teknikleri', 'Roman çözümleme', 'Karakter ve olay örgüsü'],
  },
  {
    unit: 'Şiir Bilgisi',
    topics: ['Ahenk unsurları', 'Nazım biçimleri', 'İmge ve sembolizm'],
  },
  {
    unit: 'Tiyatro',
    topics: ['Dramatik yapı', 'Trajedi – Komedi', 'Modern tiyatro'],
  },
  {
    unit: 'Öğretici Metinler',
    topics: ['Makale', 'Deneme', 'Fıkra', 'Eleştiri'],
  },
  {
    unit: 'Dil Bilgisi',
    topics: ['Yazım kuralları', 'Noktalama işaretleri'],
  },
]);

const MATEMATIK_11 = topicsFromUnits([
  {
    unit: 'Fonksiyonlar',
    topics: ['Fonksiyon kavramı', 'Bileşke fonksiyon', 'Ters fonksiyon'],
  },
  {
    unit: 'Polinomlar',
    topics: ['Polinom tanımı', 'Polinomlarda işlemler'],
  },
  {
    unit: '2. Derece Denklemler',
    topics: ['Denklem çözme', 'Eşitsizlikler', 'Parabol giriş'],
  },
  {
    unit: 'Kombinatorik',
    topics: ['Permütasyon', 'Kombinasyon', 'Olasılık'],
  },
  {
    unit: 'Trigonometri',
    topics: ['Trigonometrik oranlar', 'Birlik çember', 'Trigonometrik denklemler'],
  },
  {
    unit: 'Logaritma',
    topics: ['Logaritma kuralları', 'Logaritmik denklemler'],
  },
  {
    unit: 'Diziler',
    topics: ['Aritmetik dizi', 'Geometrik dizi'],
  },
  {
    unit: 'Limit ve Süreklilik',
    topics: ['Limit kavramı', 'Süreklilik'],
  },
]);

const FIZIK_11 = topicsFromUnits([
  {
    unit: 'Kuvvet ve Hareket',
    topics: [
      'Newton’un hareket yasaları',
      'Sürtünme kuvveti',
      'İki boyutta hareket',
      'Düzgün çembersel hareket',
      'Limit hız',
      'Serbest düşme',
    ],
    expand: {
      'serbest düşme': [
        'Serbest düşme tanımı',
        'Yer çekimi ivmesi (g)',
        'Hava direnci ihmal koşulu',
        'Hız-zaman grafiği',
        'Konum-zaman ilişkisi',
        'Düşey atış ilişkisi',
        'Eşit ivmeli hareket bağlantısı',
      ],
    },
  },
  {
    unit: 'Enerji',
    topics: ['İş – enerji', 'Güç', 'Enerji korunumu'],
  },
  {
    unit: 'Elektrik ve Manyetizma',
    topics: ['Elektrik yükleri', 'Elektrik alan', 'Manyetik alan'],
  },
  {
    unit: 'Dalgalar ve Optik',
    topics: ['Dalga türleri', 'Ses dalgaları', 'Işık ve yansıma', 'Kırılma'],
  },
  {
    unit: 'Modern Fizik',
    topics: ['Atom modelleri', 'Radyoaktivite'],
  },
]);

const KIMYA_11 = topicsFromUnits([
  {
    unit: 'Kimyasal Tepkimeler',
    topics: ['Tepkime türleri', 'Mol kavramı'],
  },
  {
    unit: 'Kimyasal Denge',
    topics: ['Denge sabiti', 'Le Chatelier ilkesi'],
  },
  {
    unit: 'Asit – Baz',
    topics: ['pH – pOH', 'Titrasyon'],
  },
  {
    unit: 'Elektrokimya',
    topics: ['Piller', 'Elektroliz'],
  },
  {
    unit: 'Organik Kimya Giriş',
    topics: ['Hidrokarbonlar', 'Fonksiyonel gruplar'],
  },
]);

const BIYOLOJI_11 = topicsFromUnits([
  {
    unit: 'Hücre Bölünmeleri',
    topics: ['Mitoz', 'Mayoz'],
  },
  {
    unit: 'Kalıtım',
    topics: ['Mendel genetiği', 'Çaprazlama'],
  },
  {
    unit: 'DNA ve Protein',
    topics: ['DNA replikasyonu', 'Protein sentezi'],
  },
  {
    unit: 'Ekoloji',
    topics: ['Ekosistem', 'Enerji akışı', 'Madde döngüleri'],
  },
  {
    unit: 'İnsan Fizyolojisi',
    topics: ['Sinir sistemi', 'Endokrin sistem', 'Sindirim sistemi', 'Dolaşım sistemi'],
  },
]);

const TARIH_11 = topicsFromUnits([
  {
    unit: 'Osmanlı Yükselme',
    topics: ['Kuruluş sonrası genişleme', 'Devlet teşkilatı'],
  },
  {
    unit: 'Osmanlı Gerileme',
    topics: ['Duraklama nedenleri', 'Islahat hareketleri'],
  },
  {
    unit: '19. Yüzyıl Osmanlı',
    topics: ['Tanzimat', 'Islahat Fermanı'],
  },
]);

const COGRAFYA_11 = topicsFromUnits([
  {
    unit: 'Türkiye Fiziki Coğrafya',
    topics: ['Yer şekilleri', 'İklim'],
  },
  {
    unit: 'Beşeri Coğrafya',
    topics: ['Nüfus', 'Yerleşme'],
  },
  {
    unit: 'Ekonomik Coğrafya',
    topics: ['Tarım', 'Sanayi', 'Enerji kaynakları'],
  },
]);

const FELSEFE_11 = topicsFromUnits([
  {
    unit: 'Felsefe Giriş',
    topics: ['Bilgi felsefesi', 'Varlık felsefesi'],
  },
  {
    unit: 'Etik',
    topics: ['Ahlak felsefesi'],
  },
  {
    unit: 'Siyaset ve Sanat',
    topics: ['Siyaset felsefesi', 'Sanat felsefesi'],
  },
]);

const INGILIZCE_11 = topicsFromUnits([
  {
    unit: 'Language Skills',
    topics: ['Reading comprehension', 'Writing essays', 'Vocabulary building'],
  },
  {
    unit: 'Grammar',
    topics: ['Tenses advanced', 'Passive voice', 'Reported speech'],
  },
]);

const DIN_11 = topicsFromUnits([
  {
    unit: 'İnanç ve İbadet',
    topics: ['İslam inanç esasları', 'İbadetler'],
  },
  {
    unit: 'Ahlak ve Hayat',
    topics: ['Ahlaki değerler', 'Din ve modern hayat'],
  },
]);

/** Dil ve Anlatım: edebiyat müfredatındaki dil / öğretici metin odaklı üniteler */
const DIL_VE_ANLATIM_11 = topicsFromUnits([
  {
    unit: 'Anlam Bilgisi',
    topics: ['Paragraf anlamı', 'Cümlede anlam', 'Anlatım bozuklukları'],
  },
  {
    unit: 'Öğretici Metinler',
    topics: ['Makale', 'Deneme', 'Fıkra', 'Eleştiri'],
  },
  {
    unit: 'Dil Bilgisi',
    topics: ['Yazım kuralları', 'Noktalama işaretleri'],
  },
]);

/** Sınıf anahtarı 11 için Maarif Model 2026 konu havuzu (mevcut 11. sınıf konularının yerine geçer) */
export const grade11Maarif2026TopicPool: TopicPool = {
  EDEBİYAT: { 11: EDEBIYAT_11 },
  'DİL VE ANLATIM': { 11: DIL_VE_ANLATIM_11 },
  MATEMATİK: { 11: MATEMATIK_11 },
  FİZİK: { 11: FIZIK_11 },
  KİMYA: { 11: KIMYA_11 },
  BİYOLOJİ: { 11: BIYOLOJI_11 },
  TARİH: { 11: TARIH_11 },
  COĞRAFYA: { 11: COGRAFYA_11 },
  FELSEFE: { 11: FELSEFE_11 },
  İNGİLİZCE: { 11: INGILIZCE_11 },
  'DİN KÜLTÜRÜ': { 11: DIN_11 },
};

/** Belirtilen sınıf seviyesindeki konuları override havuzuyla tamamen değiştirir (birleştirmez). */
export function replaceClassLevelTopics(
  base: TopicPool,
  classLevel: number | string,
  overrides: TopicPool
): TopicPool {
  const next: TopicPool = { ...base };
  for (const [subject, levels] of Object.entries(overrides)) {
    const replacement = levels?.[classLevel] ?? levels?.[String(classLevel)];
    if (!replacement) continue;
    next[subject] = {
      ...(base[subject] || {}),
      [classLevel]: [...replacement],
    };
  }
  return next;
}
