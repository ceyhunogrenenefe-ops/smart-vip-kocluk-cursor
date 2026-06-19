/**
 * Yaz kampı — HAFTALIK 13 saat, 10 hafta
 * SADECE TYT konuları (AYT / TYT Maarif hariç)
 */
import XLSX from 'xlsx';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const startYear = parseInt(process.argv[2] || '2026', 10);
const HAFTA_SAYISI = 10;

const BLOCKS = [
  { key: 'mat', ders: 'TYT MATEMATİK', saat: 4 },
  { key: 'geo', ders: 'TYT GEOMETRİ', saat: 2 },
  { key: 'fiz', ders: 'TYT FİZİK', saat: 3 },
  { key: 'kim', ders: 'TYT KİMYA', saat: 2 },
  { key: 'bio', ders: 'TYT BİYOLOJİ', saat: 2 }
];

/** Konu havuzunda TYT Biyoloji altında duran ama AYT İnsan Fizyolojisi kapsamındaki konular */
const TYT_BIYO_AYT_SISTEM_KONULARI = new Set([
  'Sinir Sistemi',
  'Endokrin Sistem',
  'Duyu Organları',
  'Destek ve Hareket Sistemi',
  'Sindirim Sistemi',
  'Dolaşım Sistemi',
  'Solunum Sistemi',
  'Üriner Sistem (Boşaltım Sistemi)',
  'Üreme Sistemi ve Embriyonik Gelişim'
]);

const RAW_TOPICS = {
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
  ]
};

/** Sadece TYT — biyolojide AYT sistem konuları çıkarıldı */
const TOPICS = Object.fromEntries(
  Object.entries(RAW_TOPICS).map(([ders, list]) => [
    ders,
    ders === 'TYT BİYOLOJİ'
      ? list.filter((k) => !TYT_BIYO_AYT_SISTEM_KONULARI.has(k))
      : list
  ])
);

function formatDateTR(d) {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** 10 hafta: Pazartesi başlangıçlı (1 Temmuz 2026 Çarşamba → hafta1 = 1-6 Temmuz) */
function buildWeeks(year) {
  const campStart = new Date(`${year}-07-01T12:00:00+03:00`);
  const weeks = [];
  for (let w = 0; w < HAFTA_SAYISI; w++) {
    const start = addDays(campStart, w * 7);
    const end = addDays(campStart, w * 7 + 6);
    weeks.push({
      no: w + 1,
      start,
      end,
      label: `${formatDateTR(start)} – ${formatDateTR(end)}`
    });
  }
  return weeks;
}

/** Konuları 10 haftaya eşit böl — her hafta o derse ait konu dilimi */
function topicsForWeek(ders, weekIndex) {
  const topics = TOPICS[ders];
  const n = topics.length;
  const start = Math.floor((weekIndex * n) / HAFTA_SAYISI);
  const end = Math.floor(((weekIndex + 1) * n) / HAFTA_SAYISI);
  return topics.slice(start, Math.max(start + 1, end));
}

/** Haftalık saati konulara böl — alt başlık + önerilen saat */
function splitHoursAcrossTopics(topics, weeklyHours) {
  if (!topics.length) return [];
  const base = Math.floor((weeklyHours / topics.length) * 10) / 10;
  const rows = topics.map((konu, i) => {
    const saat =
      i === topics.length - 1
        ? Math.round((weeklyHours - base * (topics.length - 1)) * 10) / 10
        : base;
    return {
      konu,
      altBaslik: topics.length > 1 ? `${konu} (${saat} saat)` : konu,
      saat
    };
  });
  return rows;
}

const weeks = buildWeeks(startYear);

// ── Haftalık plan verisi ──
const weeklyPlan = weeks.map((w, wi) => {
  const blocks = BLOCKS.map((b) => {
    const konular = topicsForWeek(b.ders, wi);
    const detay = splitHoursAcrossTopics(konular, b.saat);
    return { ...b, konular, detay };
  });
  const toplamSaat = blocks.reduce((s, b) => s + b.saat, 0);
  return { ...w, blocks, toplamSaat };
});

// ── Sayfa: Bilgi ──
const infoRows = [
  ['Yaz Kampı — 10 Haftalık Fen & Matematik Programı'],
  [],
  ['Kamp başlangıcı', formatDateTR(weeks[0].start)],
  ['Kamp bitişi (10. hafta)', formatDateTR(weeks[9].end)],
  ['Hafta sayısı', HAFTA_SAYISI],
  ['Haftalık toplam ders saati', 13],
  [],
  ['Haftalık ders dağılımı', 'Saat'],
  ...BLOCKS.map((b) => [b.ders, b.saat]),
  ['TOPLAM', 13],
  [],
  ['Kaynak', 'Smart Koçluk Konu Havuzu — yalnızca TYT (AYT hariç)'],
  [
    'Not',
    'TYT Biyoloji: Sinir, Endokrin, organ sistemleri vb. AYT kapsamındaki konular çıkarıldı. Haftalık 13 saat; 10 haftaya bölüştürülmüştür.'
  ],
  ['Toplam TYT konu', Object.values(TOPICS).reduce((s, t) => s + t.length, 0)]
];

// ── Sayfa: 10 Hafta Özet ──
const ozetHeader = [
  'Hafta',
  'Tarih Aralığı',
  'Toplam Saat',
  ...BLOCKS.flatMap((b) => [`${b.ders} (${b.saat}s)`, `${b.ders} — Konular`])
];
const ozetRows = [ozetHeader];

for (const w of weeklyPlan) {
  const row = [w.no, w.label, w.toplamSaat];
  for (const b of w.blocks) {
    row.push(b.saat, b.konular.join(' · '));
  }
  ozetRows.push(row);
}

// ── Sayfa: Haftalık Detay (uzun format) ──
const detayRows = [
  [
    'Hafta',
    'Tarih Aralığı',
    'Ders',
    'Haftalık Saat',
    'Sıra',
    'Ana Konu',
    'Konu Alt Başlığı',
    'Önerilen Saat'
  ]
];

for (const w of weeklyPlan) {
  for (const b of w.blocks) {
    b.detay.forEach((d, i) => {
      detayRows.push([
        w.no,
        w.label,
        b.ders,
        b.saat,
        i + 1,
        d.konu,
        d.altBaslik,
        d.saat
      ]);
    });
  }
}

// ── Sayfa: Konu Takip (tüm konular hangi haftada) ──
const trackRows = [['Sınav', 'Ders', 'Konu No', 'Konu', 'Hafta', 'Tarih Aralığı', 'Haftalık Ders Saati', 'Önerilen Saat']];

for (const b of BLOCKS) {
  TOPICS[b.ders].forEach((konu, idx) => {
    let haftaNo = null;
    let tarih = '';
    let onerilen = '';
    for (const w of weeklyPlan) {
      const block = w.blocks.find((x) => x.ders === b.ders);
      const hit = block.detay.find((d) => d.konu === konu);
      if (hit) {
        haftaNo = w.no;
        tarih = w.label;
        onerilen = hit.saat;
        break;
      }
    }
    trackRows.push(['TYT', b.ders, idx + 1, konu, haftaNo ?? '-', tarih, b.saat, onerilen || '-']);
  });
}

// ── Her hafta ayrı sayfa (kompakt görünüm) ──
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(infoRows), 'Bilgi');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ozetRows), '10 Hafta Özet');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detayRows), 'Haftalık Detay');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(trackRows), 'Konu Takip');

for (const w of weeklyPlan) {
  const sheetRows = [
    [`Hafta ${w.no}`, w.label],
    [`Toplam: ${w.toplamSaat} saat / hafta`],
    [],
    ['Ders', 'Haftalık Saat', 'Konu Alt Başlıkları', 'Önerilen Saat Dağılımı']
  ];
  for (const b of w.blocks) {
    const altBasliklar = b.detay.map((d) => d.altBaslik).join('\n');
    const saatDag = b.detay.map((d) => `${d.konu}: ${d.saat}s`).join(' · ');
    sheetRows.push([b.ders, b.saat, altBasliklar, saatDag]);
  }
  const name = `Hafta ${w.no}`.slice(0, 31);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetRows), name);
}

const outDir = resolve(root, 'exports');
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, `Yaz-Kampi-10Hafta-13s-Sadece-TYT-${startYear}.xlsx`);
XLSX.writeFile(wb, outPath);

console.log('OK', outPath);
for (const w of weeklyPlan) {
  console.log(
    `Hafta ${w.no} (${w.label}):`,
    w.blocks.map((b) => `${b.ders.split(' ').pop()}=${b.konular.length} konu`).join(', ')
  );
}
