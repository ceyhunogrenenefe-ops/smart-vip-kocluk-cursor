/**
 * TYT konu havuzu (mockData) → 1 Temmuz – 5 Eylül günlük dağılım Excel
 * Çalıştır: node scripts/generate-tyt-yaz-programi.mjs
 */
import XLSX from 'xlsx';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Konu havuzundaki TYT dersleri — YKS-Sayısal listesi (tüm YKS kollarında aynı) */
const TYT_SUBJECTS = [
  'TYT TÜRKÇE',
  'TYT MATEMATİK',
  'TYT GEOMETRİ',
  'TYT FİZİK',
  'TYT KİMYA',
  'TYT BİYOLOJİ',
  'TYT TARİH',
  'TYT COĞRAFYA',
  'TYT FELSEFE',
  'TYT DİN KÜLTÜRÜ'
];

const TYT_TOPICS = {
  'TYT TÜRKÇE': [
    'Sözcükte Anlam', 'Söz Yorumu', 'Deyim ve Atasözü', 'Cümlede Anlam', 'Paragraf',
    'Paragrafta Anlatım Teknikleri', 'Paragrafta Düşünceyi Geliştirme Yolları', 'Paragrafta Yapı',
    'Paragrafta Konu-Ana Düşünce', 'Paragrafta Yardımcı Düşünce', 'Ses Bilgisi', 'Yazım Kuralları',
    'Noktalama İşaretleri', 'Sözcükte Yapı/Ekler', 'Sözcük Türleri', 'İsimler', 'Zamirler',
    'Sıfatlar', 'Zarflar', 'Edat – Bağlaç – Ünlem', 'Fiiller', 'Fiilde Anlam (Kip-Kişi-Yapı)',
    'Ek Fiil', 'Fiilimsi', 'Fiilde Çatı', 'Sözcük Grupları', 'Cümlenin Ögeleri', 'Cümle Türleri',
    'Anlatım Bozukluğu'
  ],
  'TYT MATEMATİK': [
    'Temel Kavramlar', 'Sayı Basamakları', 'Bölme ve Bölünebilme', 'EBOB – EKOK', 'Rasyonel Sayılar',
    'Basit Eşitsizlikler', 'Mutlak Değer', 'Üslü Sayılar', 'Köklü Sayılar', 'Çarpanlara Ayırma',
    'Oran Orantı', 'Denklem Çözme', 'Sayı Problemleri', 'Kesir Problemleri', 'Yaş Problemleri',
    'Hareket Hız Problemleri', 'İşçi Emek Problemleri', 'Yüzde Problemleri', 'Kar Zarar Problemleri',
    'Karışım Problemleri', 'Grafik Problemleri', 'Rutin Olmayan Problemler', 'Kümeler',
    'Kartezyen Çarpım', 'Mantık', 'Fonksiyonlar', 'Permütasyon', 'Kombinasyon', 'Olasılık',
    'Veri – İstatistik'
  ],
  'TYT GEOMETRİ': [
    'Doğruda Açılar', 'Üçgende Açılar', 'Dik Üçgen', 'İkizkenar Üçgen', 'Eşkenar Üçgen', 'Açıortay',
    'Kenarortay', 'Eşlik ve Benzerlik', 'Üçgende Alan', 'Üçgende Benzerlik', 'Açı Kenar Bağıntıları',
    'Çokgenler', 'Dörtgenler', 'Deltoid', 'Paralelkenar', 'Eşkenar Dörtgen', 'Dikdörtgen',
    'Çemberde Açı', 'Çemberde Uzunluk', 'Dairede Çevre ve Alan', 'Noktanın Analitiği',
    'Doğrunun Analitiği', 'Dönüşüm Geometrisi', 'Prizmalar', 'Silindir', 'Piramit', 'Çemberin Analitiği'
  ],
  'TYT FİZİK': [
    'Fizik Bilimine Giriş', 'Vektörler', 'Madde ve Özellikleri', 'Kuvvet, Tork ve Denge',
    'Sıvıların Kaldırma Kuvveti', 'Kütle Merkezi', 'Basınç', 'Basit Makineler',
    'Isı, Sıcaklık ve Genleşme', 'Hareket', 'Hareket ve Kuvvet', "Newton'un Hareket Yasaları",
    'Dinamik', 'İş, Güç ve Enerji II', 'İş, Güç ve Enerji', 'Atışlar', 'Elektrik', 'İtme ve Momentum'
  ],
  'TYT KİMYA': [
    'Kimya Bilimi', 'Atomun Yapısı', 'Atom ve Periyodik Sistem', 'Periyodik Tablo',
    'Kimyasal Türler Arası Etkileşimler', 'Maddenin Halleri', 'Kimyasal Hesaplamalar',
    'Kimyanın Temel Kanunları', 'Asit, Baz ve Tuz', 'Karışımlar', 'Doğa ve Kimya', 'Kimya Her Yerde'
  ],
  'TYT BİYOLOJİ': [
    'Yaşam Bilimi Biyolojisi', 'Sinir Sistemi', 'Canlıların Ortak Özellikleri', 'Endokrin Sistem',
    'Canlıların Temel Bileşenleri', 'Duyu Organları', 'Güncel Çevre Sorunları',
    'Destek ve Hareket Sistemi', 'Hücre ve Organeller - Madde Geçişleri', 'Sindirim Sistemi',
    'Canlıların Sınıflandırılması', 'Dolaşım Sistemi', 'Hücrede Bölünme - Üreme', 'Solunum Sistemi',
    'Kalıtım', 'Üriner Sistem (Boşaltım Sistemi)', 'Bitki Biyolojisi',
    'Üreme Sistemi ve Embriyonik Gelişim', 'Ekosistem', 'Komünite Ekolojisi', 'Popülasyon Ekolojisi',
    'Nükleik Asitler', 'Genetik Şifre ve Protein Sentezi', 'Canlılık ve Enerji', 'Fotosentez',
    'Kemosentez', 'Hücresel Solunum', 'Canlılar ve Çevre'
  ],
  'TYT TARİH': [
    'Tarih ve Zaman', 'İnsan ve Toplum', 'Eski Çağ Uygarlıkları', 'İslam Medeniyetinin Doğuşu',
    'Türklerin İslamiyet\'i Kabulü', 'Türkiye Selçuklu Devleti', 'Osmanlı Devleti\'nin Kuruluşu',
    'Osmanlı Devleti\'nin Yükselişi', 'XV. ve XVI. Yüzyılda Osmanlı Devleti',
    'XVII. Yüzyılda Osmanlı Devleti', 'XVIII. Yüzyılda Osmanlı Devleti', 'XIX. Yüzyılda Osmanlı Devleti',
    'XX. Yüzyılda Osmanlı Devleti', 'Kurtuluş Savaşı', 'Atatürk İlkeleri'
  ],
  'TYT COĞRAFYA': [
    'Doğa ve İnsan', 'Dünya\'nın Şekli ve Hareketleri', 'Coğrafi Koordinatlar', 'Harita Bilgisi',
    'İklim Bilgisi', 'Sıcaklık ve Basınç', 'Rüzgarlar ve Yağış', 'İklim Tipleri ve Bitki Örtüsü',
    'Nüfus ve Yerleşme', 'Kentleşme ve Göç', 'Türkiye\'nin Coğrafi Konumu', 'Türkiye\'nin İklimi',
    'Türkiye\'nin Bitki Örtüsü', 'Türkiye\'de Nüfus ve Yerleşme'
  ],
  'TYT FELSEFE': [
    'Felsefeye Giriş', 'Felsefe Nedir?', 'Felsefenin Konusu ve Amacı', 'Felsefi Düşüncenin Özellikleri',
    'Bilgi Felsefesi', 'Bilginin Tanımı ve Kaynağı', 'Varlık Felsefesi', 'Ahlak Felsefesi',
    'Estetik (Güzellik Felsefesi)'
  ],
  'TYT DİN KÜLTÜRÜ': [
    'İnsan ve İnsanın Yaratılışı', 'İman ve İmanın Mahiyeti', 'İslam\'da İman Esasları', 'İbadet ve Dua',
    'İslam\'da Temel İbadetler', 'İslam\'da Ahlak', 'Hz. Muhammed\'in Hayatı',
    'Hz. Muhammed\'in Örnekliği', 'Kur\'an-ı Kerim\'in Mahiyeti', 'Din ve Günlük Hayat'
  ]
};

const GUN_ADLARI = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

function formatDateTR(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

/** 1 Temmuz – 5 Eylül arası tüm günler */
function buildDateRange(startYear = 2026) {
  const start = new Date(`${startYear}-07-01T12:00:00+03:00`);
  const end = new Date(`${startYear}-09-05T12:00:00+03:00`);
  const days = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }
  return days;
}

/** Konuları ders sırasına göre dağıt — günde 2–3 konu, dersler dönüşümlü */
function distributeTopics(days) {
  const queues = TYT_SUBJECTS.map((subject) => ({
    subject,
    topics: [...TYT_TOPICS[subject]]
  })).filter((q) => q.topics.length > 0);

  const totalTopics = queues.reduce((s, q) => s + q.topics.length, 0);
  const topicsPerDay = Math.ceil(totalTopics / days.length);
  const minPerDay = Math.floor(totalTopics / days.length);
  const extraDays = totalTopics - minPerDay * days.length;

  const schedule = [];
  let subjectIdx = 0;

  for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
    const date = days[dayIdx];
    const countToday = dayIdx < extraDays ? minPerDay + 1 : minPerDay;
    const dayTopics = [];

    let added = 0;
    let attempts = 0;
    while (added < countToday && attempts < queues.length * 4) {
      const q = queues[subjectIdx % queues.length];
      subjectIdx++;
      attempts++;
      if (q.topics.length === 0) continue;
      const topic = q.topics.shift();
      dayTopics.push({ subject: q.subject, topic });
      added++;
    }

    schedule.push({ date, dayTopics });
  }

  // Kalan konular varsa son günlere ekle
  for (const q of queues) {
    while (q.topics.length > 0) {
      const last = schedule[schedule.length - 1];
      last.dayTopics.push({ subject: q.subject, topic: q.topics.shift() });
    }
  }

  return schedule;
}

function weekNumberFromStart(date, startDate) {
  const diff = Math.floor((date - startDate) / 86400000);
  return Math.floor(diff / 7) + 1;
}

const startYear = parseInt(process.argv[2] || '2026', 10);
const days = buildDateRange(startYear);
const schedule = distributeTopics(days);

const dailyRows = [['Tarih', 'Gün', 'Hafta', 'Sıra', 'Ders', 'Konu', 'Kaynak']];
const flatRows = [['Tarih', 'Gün', 'Hafta', 'Ders', 'Konu No', 'Konu', 'Kaynak']];
const summary = {};

for (const { date, dayTopics } of schedule) {
  const gun = GUN_ADLARI[date.getDay()];
  const hafta = weekNumberFromStart(date, days[0]);
  const tarih = formatDateTR(date);

  dayTopics.forEach(({ subject, topic }, i) => {
    dailyRows.push([tarih, gun, hafta, i + 1, subject, topic, 'Konu Havuzu (TYT)']);
    if (!summary[subject]) summary[subject] = 0;
    summary[subject]++;
  });
}

let globalNo = 0;
for (const { date, dayTopics } of schedule) {
  const gun = GUN_ADLARI[date.getDay()];
  const hafta = weekNumberFromStart(date, days[0]);
  const tarih = formatDateTR(date);
  for (const { subject, topic } of dayTopics) {
    globalNo++;
    const subjectTopics = TYT_TOPICS[subject];
    const konuNo = subjectTopics.indexOf(topic) + 1;
    flatRows.push([tarih, gun, hafta, subject, konuNo, topic, 'Konu Havuzu (TYT)']);
  }
}

const summaryRows = [['Ders', 'Konu Sayısı', 'Planlanan Gün Aralığı']];
for (const subject of TYT_SUBJECTS) {
  const count = summary[subject] || 0;
  const first = flatRows.find((r, i) => i > 0 && r[3] === subject);
  const last = [...flatRows].reverse().find((r) => r[3] === subject);
  summaryRows.push([subject, count, first && last ? `${first[0]} – ${last[0]}` : '-']);
}
summaryRows.push([]);
summaryRows.push(['Toplam konu', globalNo, `${formatDateTR(days[0])} – ${formatDateTR(days[days.length - 1])}`]);
summaryRows.push(['Toplam gün', days.length, '']);
summaryRows.push(['Günde ortalama konu', (globalNo / days.length).toFixed(1), '']);

const infoRows = [
  ['TYT Yaz Programı — Konu Dağılımı'],
  ['Başlangıç', formatDateTR(days[0])],
  ['Bitiş', formatDateTR(days[days.length - 1])],
  ['Kaynak', 'Smart Koçluk Konu Havuzu (mockData / TYT)'],
  ['Not', 'Konular ders sırasına göre, günler arası dönüşümlü dağıtılmıştır.'],
  []
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(infoRows), 'Bilgi');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dailyRows), 'Günlük Program');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(flatRows), 'Tüm Konular');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Ders Özeti');

const outDir = resolve(root, 'exports');
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, `TYT-Yaz-Programi-${startYear}-01Temmuz-05Eylul.xlsx`);
XLSX.writeFile(wb, outPath);

console.log('OK', outPath);
console.log('Gün:', days.length, '| Konu:', globalNo, '| Ort/gün:', (globalNo / days.length).toFixed(1));
