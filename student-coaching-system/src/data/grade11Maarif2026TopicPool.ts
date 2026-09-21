import type { TopicPool } from '../types';

/**
 * 11. Sınıf — Maarif Model 2026 müfredatı (Eylül 2026 güncel tema/ünite sırası)
 * "Tema/Ünite · Konu" formatında; sıra müfredattaki gibi korunur.
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
    unit: '1. Tema: Bir Diyeceğim Var!',
    topics: [
      'Geleneksel Türk Tiyatrosu',
      'Öğretici Metin: Mektup',
      'Öğretici Metin: Dilekçe',
      'E-Posta Vasıtasıyla İletişim',
    ],
  },
  {
    unit: '2. Tema: Kültür Yolculuğu',
    topics: [
      'Türk Dünyasından Hikâye İncelemesi',
      'Orhun Abideleri',
      'Divanü Lugati\'t-Türk',
      'Âşık Tarzı Halk Şiiri',
      'Çeviri İçi Müze Gezisi',
    ],
  },
  {
    unit: '3. Tema: Yaşamın İzinde',
    topics: [
      'Roman',
      'Biyografi',
      'Mülakat',
      'Radyo Tiyatrosu',
    ],
  },
  {
    unit: '4. Tema: Hayatın Aynası',
    topics: [
      'Tiyatro',
      'Küçürek Hikâye',
      'Belgesel',
      'Afiş Hazırlama',
    ],
  },
]);

const MATEMATIK_11 = topicsFromUnits([
  {
    unit: '1. Tema: Nicelikler ve Değişimler',
    topics: [
      'Trigonometrik Referans Fonksiyonlar',
      'Üstel ve Logaritmik Referans Fonksiyonlar',
      'Fonksiyonlarla Dört İşlem ve Fonksiyonların Bileşkesi',
    ],
  },
  {
    unit: '2. Tema: Geometrik Şekiller',
    topics: [
      'Çokgenler',
      'Dörtgenler',
      'Özel Dörtgenler',
    ],
  },
  {
    unit: '3. Tema: İstatistiksel Araştırma Süreci',
    topics: [
      'İki Nicel Değişken İlişkisini İçeren İstatistiksel Problemi Oluşturma',
      'Verileri Toplama ve Analize Hazır Hâle Getirme',
      'Bulgulara Ulaşma ve Bulguları Yorumlama',
      'İstatistiksel Görsel, Özet, Sonuç, Yorum, Çıkarım veya Tahminleri Değerlendirme',
    ],
  },
]);

const FIZIK_11 = topicsFromUnits([
  {
    unit: '1. Ünite: Kuvvet ve Hareket',
    topics: [
      'Newton Hareket Yasaları',
      'Sürtünme Kuvveti',
      'Limit Hız',
      'Çembersel Hareket',
    ],
  },
  {
    unit: '2. Ünite: Elektrik ve Manyetizma',
    topics: [
      'Elektriksel Kuvvet ve Elektriksel Alan',
      'Manyetik Alan ve Manyetik Kuvvet',
      'İndüksiyon Akımı',
      'Transformatörler',
    ],
  },
  {
    unit: '3. Ünite: Madde ve Doğası',
    topics: [
      'Yarı İletkenlik',
      'Süper İletkenlik',
    ],
  },
  {
    unit: '4. Ünite: Optik',
    topics: [
      'Işık Şiddeti, Işık Akısı ve Aydınlanma',
      'Düzlem Aynalar',
      'Küresel Aynalar',
      'Kırılma',
      'Görünür Derinlik',
      'Fiber Optik',
      'Prizmalar',
    ],
  },
]);

const KIMYA_11 = topicsFromUnits([
  {
    unit: '1. Tema: Etkileşim',
    topics: [
      'Kimyasal Tepkimelerde Enerji',
      'Kimyasal Tepkimelerde Hız',
    ],
  },
  {
    unit: '2. Tema: Çeşitlilik',
    topics: [
      'Denge',
      'Asit ve Baz Çözeltilerinde Denge',
      'Çözünürlük Dengesi',
    ],
  },
  {
    unit: '3. Tema: Sürdürülebilirlik',
    topics: [
      'Nanoteknoloji ve Sürdürülebilirlik',
    ],
  },
]);

const BIYOLOJI_11 = topicsFromUnits([
  {
    unit: '1. Tema: Tepki',
    topics: [
      'Bitkilerde Tepki',
      'Bitkilerde Hormonlar ve Tepki',
      'Tropizma (Yönelim), Nasti (Irganım, İrkilme)',
      'Hayvanlarda Tepki',
      'Sinir Sistemi',
      'Refleksler',
      'Kemik, Eklem ve Kaslar',
      'Bağışıklık',
    ],
  },
  {
    unit: '2. Tema: Homeostazi',
    topics: [
      'Homeostazi ve Canlılar İçin Önemi',
      'Endokrin Sistem',
      'Dolaşım Sistemi',
      'Solunum Sistemi',
      'Boşaltım Sistemi',
      'Homeostazinin Sağlanamadığı Durumlarda Oluşabilecek Sağlık Problemleri',
      'Diabetes Mellitus (Kan Şekeri Dengesinin Bozulduğu)',
      'Diabetes İnsipidus (Osmotik Denge Bozukluğu)',
      'Hipertansiyon (Kan Basıncı Dengesinin Bozulduğu)',
      'Obezite (Vücut Ağırlığı Dengesinin Bozulduğu)',
    ],
  },
]);

const TARIH_11 = topicsFromUnits([
  {
    unit: '1. Ünite: Değişen Dünyada Osmanlı Devleti',
    topics: [
      'Osmanlı’nın Siyasi ve Askerî Mücadeleleri',
      'Lale Devri',
      '1755 Lizbon ve 1766 İstanbul Depremleri',
      'Sanayi Devrimi',
    ],
  },
  {
    unit: '2. Ünite: Dönüşüm Sürecinde Osmanlı',
    topics: [
      'Fransız İhtilali',
      'Siyasi-Askerî ve İdari Gelişmeler',
      'Bilim-Sanat ve Teknoloji',
      'Osmanlı’da Sanayileşme',
    ],
  },
  {
    unit: '3. Ünite: Savaşlar Sarmalında Osmanlı',
    topics: [
      'Siyasi ve Askerî Gelişmeler',
      'Kitlesel Göçler ve Salgınlar',
      'Osmanlı Devleti’nin İnsanlık Tarihine Katkıları',
    ],
  },
]);

const COGRAFYA_11 = topicsFromUnits([
  {
    unit: '1. Ünite',
    topics: [
      'Mekânsal Sorunlar Karşısında Coğrafya Bilimi',
    ],
  },
  {
    unit: '2. Ünite',
    topics: [
      'Web Tabanlı CBS ile Harita Uygulamaları',
    ],
  },
  {
    unit: '3. Ünite',
    topics: [
      'Su Kaynakları',
      'Türkiye’deki Su Kaynaklarının Etkileri',
    ],
  },
  {
    unit: '4. Ünite',
    topics: [
      'Türkiye ve Dünyada Yerleşmelerin Mekânsal Organizasyonu',
    ],
  },
  {
    unit: '5. Ünite',
    topics: [
      'Tarımsal Faaliyetler',
      'Tarımda Sürdürülebilirlik',
      'Stratejik ve Kritik Madenler',
      'Enerji Kaynakları',
      'Sanayileşmenin Mekânsal Etkileri',
    ],
  },
  {
    unit: '6. Ünite',
    topics: [
      'Gezegen Sınırı',
      'Küresel İklim Değişikliği',
      'Türkiye’de Suyun Sürdürülebilir Kullanımı',
    ],
  },
  {
    unit: '7. Ünite',
    topics: [
      'Türkiye’nin Kültürel Hinterlandı',
      'Tarımsal Üretim (Örnek Ülke)',
      'Sanayileşme Süreci (Örnek Ülkeler)',
      'Madencilik Faaliyetleri (Örnek Ülke)',
      'Enerji Kaynakları (Örnek Ülkeler)',
    ],
  },
]);

const FELSEFE_11 = topicsFromUnits([
  {
    unit: '1. Ünite: Çevre Sorunları ve Felsefe',
    topics: [
      'Çevre Problemleri',
      'Çevre Etiği',
    ],
  },
  {
    unit: '2. Ünite: Teknoloji ve Hayat',
    topics: [
      'Teknoloji ve İnsan Hayatı',
      'Ontolojik Problemler',
      'Aksiyolojik Problemler',
    ],
  },
  {
    unit: '3. Ünite: Akıl ve İnanç',
    topics: [
      'Akıl-İnanç İlişkisine Yönelik Felsefi Görüşler',
    ],
  },
  {
    unit: '4. Ünite: Edebiyat ve Felsefe',
    topics: [
      'Dil, Edebiyat ve Felsefe İlişkisi',
      'Edebi Unsurlara Felsefi Bakış',
    ],
  },
  {
    unit: '5. Ünite: Hayatın Anlamı',
    topics: [
      'Mutluluk ve Hayat İlişkisi',
      'Varoluş ve Kendi Olma',
    ],
  },
  {
    unit: '6. Ünite: Hukuk ve Felsefe',
    topics: [
      'Hukukun Gereği ve Önemi',
      'Hukukun Kaynağı',
      'Ahlak ve Hukuk İlişkisi',
    ],
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

/**
 * Eylül 2026 güncellemesiyle kaldırılan eski 11. sınıf konuları.
 * Kullanıcı tarayıcısında saklanan konu havuzu (customTopics) eski varsayılanları içerdiği için
 * yüklenirken bunlar çıkarılır; aksi halde eski ve yeni konular karışık görünür.
 */
export const RETIRED_GRADE11_TOPICS: Record<string, string[]> = {
  'EDEBİYAT': [
    'Anlam Bilgisi · Paragraf anlamı',
    'Anlam Bilgisi · Cümlede anlam',
    'Anlam Bilgisi · Anlatım bozuklukları',
    'Hikaye ve Roman · Hikaye türleri',
    'Hikaye ve Roman · Anlatım teknikleri',
    'Hikaye ve Roman · Roman çözümleme',
    'Hikaye ve Roman · Karakter ve olay örgüsü',
    'Şiir Bilgisi · Ahenk unsurları',
    'Şiir Bilgisi · Nazım biçimleri',
    'Şiir Bilgisi · İmge ve sembolizm',
    'Tiyatro · Dramatik yapı',
    'Tiyatro · Trajedi – Komedi',
    'Tiyatro · Modern tiyatro',
    'Öğretici Metinler · Makale',
    'Öğretici Metinler · Deneme',
    'Öğretici Metinler · Fıkra',
    'Öğretici Metinler · Eleştiri',
    'Dil Bilgisi · Yazım kuralları',
    'Dil Bilgisi · Noktalama işaretleri',
  ],
  'MATEMATİK': [
    'Fonksiyonlar · Fonksiyon kavramı',
    'Fonksiyonlar · Bileşke fonksiyon',
    'Fonksiyonlar · Ters fonksiyon',
    'Polinomlar · Polinom tanımı',
    'Polinomlar · Polinomlarda işlemler',
    '2. Derece Denklemler · Denklem çözme',
    '2. Derece Denklemler · Eşitsizlikler',
    '2. Derece Denklemler · Parabol giriş',
    'Kombinatorik · Permütasyon',
    'Kombinatorik · Kombinasyon',
    'Kombinatorik · Olasılık',
    'Trigonometri · Trigonometrik oranlar',
    'Trigonometri · Birlik çember',
    'Trigonometri · Trigonometrik denklemler',
    'Logaritma · Logaritma kuralları',
    'Logaritma · Logaritmik denklemler',
    'Diziler · Aritmetik dizi',
    'Diziler · Geometrik dizi',
    'Limit ve Süreklilik · Limit kavramı',
    'Limit ve Süreklilik · Süreklilik',
  ],
  'FİZİK': [
    'Kuvvet ve Hareket · Newton’un hareket yasaları',
    'Kuvvet ve Hareket · Sürtünme kuvveti',
    'Kuvvet ve Hareket · İki boyutta hareket',
    'Kuvvet ve Hareket · Düzgün çembersel hareket',
    'Kuvvet ve Hareket · Limit hız',
    'Kuvvet ve Hareket · Serbest düşme',
    'Kuvvet ve Hareket · Serbest düşme · Serbest düşme tanımı',
    'Kuvvet ve Hareket · Serbest düşme · Yer çekimi ivmesi (g)',
    'Kuvvet ve Hareket · Serbest düşme · Hava direnci ihmal koşulu',
    'Kuvvet ve Hareket · Serbest düşme · Hız-zaman grafiği',
    'Kuvvet ve Hareket · Serbest düşme · Konum-zaman ilişkisi',
    'Kuvvet ve Hareket · Serbest düşme · Düşey atış ilişkisi',
    'Kuvvet ve Hareket · Serbest düşme · Eşit ivmeli hareket bağlantısı',
    'Enerji · İş – enerji',
    'Enerji · Güç',
    'Enerji · Enerji korunumu',
    'Elektrik ve Manyetizma · Elektrik yükleri',
    'Elektrik ve Manyetizma · Elektrik alan',
    'Elektrik ve Manyetizma · Manyetik alan',
    'Dalgalar ve Optik · Dalga türleri',
    'Dalgalar ve Optik · Ses dalgaları',
    'Dalgalar ve Optik · Işık ve yansıma',
    'Dalgalar ve Optik · Kırılma',
    'Modern Fizik · Atom modelleri',
    'Modern Fizik · Radyoaktivite',
  ],
  'KİMYA': [
    'Kimyasal Tepkimeler · Tepkime türleri',
    'Kimyasal Tepkimeler · Mol kavramı',
    'Kimyasal Denge · Denge sabiti',
    'Kimyasal Denge · Le Chatelier ilkesi',
    'Asit – Baz · pH – pOH',
    'Asit – Baz · Titrasyon',
    'Elektrokimya · Piller',
    'Elektrokimya · Elektroliz',
    'Organik Kimya Giriş · Hidrokarbonlar',
    'Organik Kimya Giriş · Fonksiyonel gruplar',
  ],
  'BİYOLOJİ': [
    'Hücre Bölünmeleri · Mitoz',
    'Hücre Bölünmeleri · Mayoz',
    'Kalıtım · Mendel genetiği',
    'Kalıtım · Çaprazlama',
    'DNA ve Protein · DNA replikasyonu',
    'DNA ve Protein · Protein sentezi',
    'Ekoloji · Ekosistem',
    'Ekoloji · Enerji akışı',
    'Ekoloji · Madde döngüleri',
    'İnsan Fizyolojisi · Sinir sistemi',
    'İnsan Fizyolojisi · Endokrin sistem',
    'İnsan Fizyolojisi · Sindirim sistemi',
    'İnsan Fizyolojisi · Dolaşım sistemi',
  ],
  'TARİH': [
    'Osmanlı Yükselme · Kuruluş sonrası genişleme',
    'Osmanlı Yükselme · Devlet teşkilatı',
    'Osmanlı Gerileme · Duraklama nedenleri',
    'Osmanlı Gerileme · Islahat hareketleri',
    '19. Yüzyıl Osmanlı · Tanzimat',
    '19. Yüzyıl Osmanlı · Islahat Fermanı',
  ],
  'COĞRAFYA': [
    'Türkiye Fiziki Coğrafya · Yer şekilleri',
    'Türkiye Fiziki Coğrafya · İklim',
    'Beşeri Coğrafya · Nüfus',
    'Beşeri Coğrafya · Yerleşme',
    'Ekonomik Coğrafya · Tarım',
    'Ekonomik Coğrafya · Sanayi',
    'Ekonomik Coğrafya · Enerji kaynakları',
  ],
  'FELSEFE': [
    'Felsefe Giriş · Bilgi felsefesi',
    'Felsefe Giriş · Varlık felsefesi',
    'Etik · Ahlak felsefesi',
    'Siyaset ve Sanat · Siyaset felsefesi',
    'Siyaset ve Sanat · Sanat felsefesi',
  ],
};

/** Saklanan havuzdan kaldırılmış 11. sınıf konularını ayıklar (koçun kendi eklediği konular kalır). */
export function stripRetiredGrade11Topics(pool: TopicPool): TopicPool {
  const next: TopicPool = { ...pool };
  for (const [subject, retiredList] of Object.entries(RETIRED_GRADE11_TOPICS)) {
    const levels = next[subject];
    const current = levels?.[11] ?? levels?.['11'];
    if (!current) continue;
    const drop = new Set(retiredList);
    const kept = current.filter((t) => !drop.has(t));
    // Nesne anahtarları string olduğundan 11 ile '11' aynı alandır
    next[subject] = { ...levels, 11: kept };
  }
  return next;
}

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
