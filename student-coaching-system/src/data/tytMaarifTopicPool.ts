import { TopicPool } from '../types';

/** TYT Maarif Model yaz kampı ve Maarif TYT öğrencileri için tek sınıf anahtarı */
export const MAARIF_CLASS_KEY = 'TYT-Maarif';

export const MAARIF_SUBJECT_ORDER = [
  'TYT MAARİF TÜRKÇE',
  'TYT MAARİF MATEMATİK',
  'TYT MAARİF FİZİK',
  'TYT MAARİF KİMYA',
  'TYT MAARİF BİYOLOJİ',
  'TYT MAARİF COĞRAFYA',
  'TYT MAARİF TARİH'
] as const;

export function formatMaarifSubjectLabel(subject: string): string {
  return subject.replace(/^TYT MAARİF /, '');
}

function normTopicKey(s: string) {
  return s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
}

function dedupeTopics(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of list) {
    const k = normTopicKey(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t.trim());
  }
  return out;
}

function buildMaarifPool(raw: Record<(typeof MAARIF_SUBJECT_ORDER)[number], string[]>): TopicPool {
  const out: TopicPool = {};
  for (const subject of MAARIF_SUBJECT_ORDER) {
    out[subject] = { [MAARIF_CLASS_KEY]: dedupeTopics(raw[subject] || []) };
  }
  return out;
}

const RAW_MAARIF_TOPICS: Record<(typeof MAARIF_SUBJECT_ORDER)[number], string[]> = {
  'TYT MAARİF COĞRAFYA': [
    'Ünite 1 · Coğrafya Bilimi',
    'Ünite 1 · Coğrafi Bakış',
    'Ünite 2 · Harita Okuryazarlığı',
    'Ünite 2 · Mekânsal Bilgi Teknolojilerinin Bileşenleri ve Uygulama Alanları',
    'Ünite 3 · İklim Sistemi',
    'Ünite 3 · Yeryüzünün Şekillenmesi',
    'Ünite 4 · Nüfus Dinamikleri',
    'Ünite 4 · Yerleşme',
    'Ünite 5 · Ekonomik Faaliyetleri Etkileyen Coğrafi Faktörler',
    'Ünite 5 · Ekonomik Faaliyetler ve Sektörel Yapı',
    'Ünite 6 · Afetler',
    'Ünite 6 · Afetlerle Mücadele',
    'Ünite 7 · Bölge ve Bölge Sınırı',
    'Ünite 7 · Türk Kültürünün Mekânsal Özellikleri'
  ],
  'TYT MAARİF TARİH': [
    'Ünite 1 · Tarih Öğrenmenin Faydaları, Tarihin Doğası',
    'Ünite 1 · Tarihsel Bilginin Üretim Süreci ve Dijital Dönüşüm',
    'Ünite 2 · Tarım Devrimi\'nin Eski Çağ\'a Etkileri',
    'Ünite 2 · Eski Çağ\'da Yönetimler ve Savaşanlar',
    'Ünite 2 · Eski Çağ\'da Hukuk',
    'Ünite 2 · Eski Çağ\'da İnanç, Bilim ve Sanat - Türklerde Konargöçer Yaşam',
    'Ünite 3 · Orta Çağ\'daki Kitlesel Göçler ve Avrupa Hun Devleti',
    'Ünite 3 · Orta Çağ\'da Siyasi ve Askerî Gelişmeler - I',
    'Ünite 3 · Orta Çağ\'da Siyasi ve Askerî Gelişmeler - II',
    'Ünite 3 · Orta Çağ\'da Ticaret, Bilim, Kültür ve Sanat',
    'Ünite 4 · Önemli Askerî Mücadelelerin Türk Tarihinin Seyrine Etkileri',
    'Ünite 4 · Türkistan\'dan Türkiye\'ye Türklerde Devlet ve Ordu Teşkilatları',
    'Ünite 4 · Türklerde Sosyoekonomik Hayat ve Şehirleşme',
    'Ünite 4 · Türk-İslam Medeniyetinde Bilim, Kültür, Eğitim ve Sanat',
    'Ünite 5 · Beylikten Devlete Siyasi ve Askerî Gelişmeler',
    'Ünite 5 · Osmanlı Devleti\'nde Ordu, Toprak ve Hukuk Sistemi',
    'Ünite 6 · Osmanlı Devleti\'nin Cihan Devleti Hâline Gelmesi - I',
    'Ünite 6 · Osmanlı Devleti\'nin Cihan Devleti Hâline Gelmesi - II',
    'Ünite 6 · Osmanlı Devleti\'nin Yönetim ve Ordu Yapısında Değişim',
    'Ünite 6 · Avrupalıların Sömürgeci Politikaları',
    'Ünite 6 · Osmanlı Devleti\'nde İsyanlar',
    'Ünite 6 · Osmanlı Devleti\'nde Bilim, Kültür, Eğitim ve Sanat'
  ],
  'TYT MAARİF TÜRKÇE': [
    'Tema 1 · Sözcükte Anlam Özellikleri',
    'Tema 1 · Sözcükte Anlam İlişkileri',
    'Tema 1 · Sözcükte Anlam Olayları',
    'Tema 1 · Söz Öbeklerinde Anlam',
    'Tema 2 · Cümlede Kavramlar - I',
    'Tema 2 · Cümlede Kavramlar - II',
    'Tema 2 · Cümle Yorumlama - I',
    'Tema 2 · Cümle Yorumlama - II',
    'Tema 3 · Anlatım Teknikleri',
    'Tema 3 · Düşünceyi Geliştirme Yolları',
    'Tema 3 · Parçanın Dil ve Anlatım Özellikleri',
    'Tema 3 · Paragrafta Konu ve Ana Düşünce',
    'Tema 3 · Paragrafta Yapı',
    'Tema 3 · Paragrafta Yardımcı Düşünceler',
    'Tema 4 · Sözcük Türleri',
    'Tema 4 · Zamirler',
    'Tema 4 · Sıfat',
    'Tema 4 · Zarf',
    'Tema 4 · Edat',
    'Tema 4 · Bağlaç',
    'Tema 5 · Tamlamalar',
    'Tema 6 · Fiil',
    'Tema 6 · Ek Fiil',
    'Tema 7 · Ekler',
    'Tema 7 · Yapım Ekleri',
    'Tema 7 · Sözcük Yapısı',
    'Tema 8 · Ses Bilgisi',
    'Tema 9 · Yazım Kuralları',
    'Tema 10 · Noktalama İşaretleri'
  ],
  'TYT MAARİF BİYOLOJİ': [
    'Tema 1 · Bilimsel Bilginin Doğası ve Bilimsel Araştırma Süreci',
    'Tema 1 · Canlıların Ortak Özellikleri ve Virüsler',
    'Tema 1 · Canlıların Çeşitliliği ve Sınıflandırılması',
    'Tema 1 · Domainler, Bakteri ve Arke Âlemleri',
    'Tema 1 · Protista, Bitki ve Mantar Âlemleri',
    'Tema 1 · Hayvanlar Âlemi ve Biyolojik Çeşitlilik',
    'Tema 2 · İnorganik Bileşikler',
    'Tema 2 · Karbonhidratlar, Lipitler ve Proteinler',
    'Tema 2 · Enzimler',
    'Tema 2 · Nükleik Asitler ve Vitaminler',
    'Tema 2 · Hücre ve Alt Birimleri I',
    'Tema 2 · Hücre ve Alt Birimleri II',
    'Tema 2 · Hücre Zarından Madde Geçişleri (Difüzyon ve Ozmoz)',
    'Tema 2 · Hücre Zarından Madde Geçişleri (Aktif Geçişler) ve Organizasyon',
    'Tema 3 · ATP, Fotosentez Reaksiyonları',
    'Tema 3 · Fotosentezi Etkileyen Faktörler ve Kemosentez',
    'Tema 3 · Canlılarda Sindirim Çeşitleri ve Yapıları',
    'Tema 3 · İnsan Sindirim Sistemi',
    'Tema 3 · Hücre Solunumu',
    'Tema 3 · Fermantasyon ve Beslenme',
    'Tema 4 · Ekosistemin Bileşenleri',
    'Tema 4 · Komünite ve Popülasyon Ekolojisi',
    'Tema 4 · Ekosistemde Enerji Akışı',
    'Tema 4 · Madde Döngüleri ve Ekolojik Sürdürülebilirlik'
  ],
  'TYT MAARİF KİMYA': [
    'Tema 1 · Kimyasal Tepkimeler (Oluşumu)',
    'Tema 1 · Kimyasal Tepkimeler (Türleri)',
    'Tema 1 · Mol Kavramı',
    'Tema 1 · Kimyasal Tepkimeler (Denkleştirme)',
    'Tema 1 · Kimyasal Hesaplamalar',
    'Tema 1 · Gazlar (Gaz Yasaları)',
    'Tema 1 · Gazlar (İdeal Gaz Yasası)',
    'Tema 1 · Gazlar (Kinetik Molekül Teorisi, Graham Difüzyon ve Efüzyon Yasası)',
    'Tema 2 · Etkileşimler (Metalik Bağ)',
    'Tema 2 · Etkileşimler (İyonik Bağ)',
    'Tema 2 · Etkileşimler (Kovalent Bağ)',
    'Tema 3 · Nanoparçacıklar ve Ekolojik Sürdürülebilirlik (Metal Nanoparçacıklar)',
    'Tema 3 · Nanoparçacıklar ve Ekolojik Sürdürülebilirlik (Yeşil Kimya)',
    'Tema 3 · Nanoparçacıklar ve Ekolojik Sürdürülebilirlik (Çevresel Etkiler)',
    'Tema 4 · Kimya Hayattır',
    'Tema 4 · Kimya Disiplinleri ve Uygulama Alanları',
    'Tema 4 · Kimyasal Maddelerin Kullanımı ve Güvenlik',
    'Tema 4 · Atom Teorileri ve Atom Yapısı',
    'Tema 4 · Periyodik Sistem',
    'Tema 4 · Periyodik Özellikler',
    'Tema 4 · Lewis Nokta Yapısı',
    'Tema 4 · Moleküllerin Polarlığı',
    'Tema 4 · Bileşiklerin Adlandırılması',
    'Tema 4 · Moleküller Arası Etkileşimler',
    'Tema 4 · Katılar',
    'Tema 4 · Sıvılar',
    'Tema 5 · Çözeltiler (Çözünme Süreci)',
    'Tema 5 · Çözünebilirlik',
    'Tema 5 · Çözeltilerin Sınıflandırılması',
    'Tema 5 · Derişim Birimleri',
    'Tema 5 · Çözünürlük',
    'Tema 5 · Çözünürlüğe Etki Eden Faktörler',
    'Tema 5 · Çözeltilerin Özellikleri',
    'Tema 6 · Yeşil Kimya, Çevresel ve Ekolojik Sürdürülebilirlik',
    'Tema 6 · Atmosferdeki Tepkimeler ve Küresel Sorunlar'
  ],
  'TYT MAARİF FİZİK': [
    'Ünite 1 · Fizik Bilimi ve Fiziğin Alt Dalları',
    'Ünite 1 · Fiziğe Yön Verenler ve Kariyer Keşfi',
    'Ünite 2 · Fiziksel Niceliklerin Sınıflandırılması',
    'Ünite 2 · Vektörler',
    'Ünite 2 · Doğadaki Temel Kuvvetler',
    'Ünite 2 · Hareket ve Hareket Türleri',
    'Ünite 3 · Katı Basıncı',
    'Ünite 3 · Sıvı Basıncı',
    'Ünite 3 · Açık Hava Basıncı',
    'Ünite 3 · Kaldırma Kuvveti',
    'Ünite 3 · Bernoulli İlkesi',
    'Ünite 4 · Isı, Sıcaklık ve İç Enerji',
    'Ünite 4 · Öz Isı ve Isı Sığası',
    'Ünite 4 · Hâl Değişimi',
    'Ünite 4 · Isıl Denge',
    'Ünite 4 · Isı Aktarım Yolları ve Isı İletim Hızı',
    'Ünite 5 · Sabit Hızlı Hareket',
    'Ünite 5 · Bir Boyutta Sabit İvmeli Hareket',
    'Ünite 5 · Serbest Düşme',
    'Ünite 5 · İki Boyutta Sabit İvmeli Hareket',
    'Ünite 6 · İş, Enerji ve Güç',
    'Ünite 6 · Enerji Biçimleri',
    'Ünite 6 · Mekanik Enerji',
    'Ünite 6 · Enerji Kaynakları',
    'Ünite 7 · Basit Elektrik Devreleri ve Elektrik Akımı',
    'Ünite 7 · Ohm Yasası ve Dirençlerin Bağlanması',
    'Ünite 7 · Üreteçlerin Bağlanması',
    'Ünite 7 · Elektrik Akımının Oluşturabileceği Tehlikeler ve Önlemler',
    'Ünite 8 · Dalgaların Temel Kavramları',
    'Ünite 8 · Dalgaların Sınıflandırılması',
    'Ünite 8 · Periyodik Hareketler',
    'Ünite 8 · Su Dalgalarında Yansıma ve Kırılma',
    'Ünite 8 · Rezonans ve Deprem'
  ],
  'TYT MAARİF MATEMATİK': [
    '9. Sınıf · Üçgenler',
    '9. Sınıf · Doğruda ve Üçgende Açılar',
    '9. Sınıf · Üçgende Açı-Kenar Bağıntıları',
    '9. Sınıf · Geometrik Dönüşümler',
    '9. Sınıf · Üçgende Eşlik',
    '9. Sınıf · Üçgenlerde Benzerlik',
    '9. Sınıf · Dik Üçgen',
    '9. Sınıf · Sayılar',
    '9. Sınıf · Temel İşlem Yeteneği',
    '9. Sınıf · Üslü Sayılar',
    '9. Sınıf · Köklü Sayılar',
    '9. Sınıf · Aralıklar',
    '9. Sınıf · Sayı Kümeleri',
    '9. Sınıf · Nicelikler ve Değişimler',
    '9. Sınıf · Doğrusal Fonksiyonlar',
    '9. Sınıf · Mutlak Değer Fonksiyonları',
    '9. Sınıf · Doğrusal Denklemler',
    '9. Sınıf · Doğrusal Eşitsizlikler',
    '9. Sınıf · Algoritma ve Bilişim',
    '9. Sınıf · Algoritmik Problem Çözme',
    '9. Sınıf · Algoritmik Yapılar',
    '9. Sınıf · Matematiksel İspatlarda Mantık',
    '9. Sınıf · Cebirsel İşlemlerin Algoritmik Yapısı',
    '10. Sınıf · Trigonometrik Oranlar ve Özdeşlikler',
    '10. Sınıf · Açıortay',
    '10. Sınıf · Kenarortay',
    '10. Sınıf · Kenar-Orta Dikme ve Yükseklik',
    '10. Sınıf · Üçgenin Alanı',
    '10. Sınıf · Sinüs ve Kosinüs Teoremleri',
    '10. Sınıf · Noktanın Analitiği',
    '10. Sınıf · Doğrunun Analitiği',
    '10. Sınıf · Tanımlı Fonksiyonlar',
    '10. Sınıf · Karekök Fonksiyonları',
    '10. Sınıf · Rasyonel Fonksiyonlar',
    '10. Sınıf · Ters Fonksiyonlar',
    '10. Sınıf · Eşitsizlikler',
    '10. Sınıf · Fonksiyonlardan Türetilen Denklemler',
    '10. Sınıf · İstatistiksel Araştırma Süreci',
    '10. Sınıf · Tek Nicel Değişkenli Veri Analizi',
    '10. Sınıf · İki Kategorik Değişkenli Veri Analizi',
    '10. Sınıf · Sayma Stratejileri',
    '10. Sınıf · Sıralama',
    '10. Sınıf · Seçme',
    '10. Sınıf · Pascal Üçgeni ve Güvercin Yuvası İlkesi',
    '10. Sınıf · Olayların Olasılığı',
    '10. Sınıf · Koşullu Olasılık'
  ]
};

export const tytMaarifTopicPool: TopicPool = buildMaarifPool(RAW_MAARIF_TOPICS);
