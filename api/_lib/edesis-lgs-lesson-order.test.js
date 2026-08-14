import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function foldLessonName(s) {
  return String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const LGS_LESSON_ORDER = [
  { rank: 0, test: (n) => /\bturkce\b/.test(n) },
  { rank: 1, test: (n) => /\binkilap\b|\btarih\b/.test(n) && !/\bdin\b/.test(n) },
  { rank: 2, test: (n) => /\bdin\b/.test(n) },
  { rank: 3, test: (n) => /\bingilizce\b|\benglish\b/.test(n) },
  { rank: 4, test: (n) => /\bmatematik\b|\bmath\b/.test(n) },
  { rank: 5, test: (n) => /\bfen\b/.test(n) }
];

const TYT_LESSON_ORDER = [
  { rank: 0, test: (n) => /\bturkce\b/.test(n) },
  { rank: 1, test: (n) => /\bsosyal\b/.test(n) },
  { rank: 2, test: (n) => /\bmatematik\b|\bmath\b/.test(n) },
  { rank: 3, test: (n) => /\bfen\b/.test(n) },
  { rank: 1.1, test: (n) => /\btarih\b/.test(n) },
  { rank: 1.2, test: (n) => /\bcografya\b/.test(n) },
  { rank: 1.3, test: (n) => /\bfelsefe\b/.test(n) },
  { rank: 1.4, test: (n) => /\bdin\b/.test(n) }
];

function lessonRankForFamily(family, lessonName) {
  const n = foldLessonName(lessonName);
  const table = family === 'lgs' ? LGS_LESSON_ORDER : family === 'yks' || family === 'tyt' ? TYT_LESSON_ORDER : null;
  if (!table) return 50;
  for (const row of table) {
    if (row.test(n)) return row.rank;
  }
  return 50;
}

function sortOpticalLessonsByFamily(lessons, family) {
  return [...(lessons || [])].sort((a, b) => {
    const ra = lessonRankForFamily(family, String(a.lessonName || ''));
    const rb = lessonRankForFamily(family, String(b.lessonName || ''));
    if (ra !== rb) return ra - rb;
    return String(a.lessonName || '').localeCompare(String(b.lessonName || ''), 'tr');
  });
}

describe('sortOpticalLessonsByFamily', () => {
  it('orders LGS tabs as Türkçe|İnkılap / Din|İngilizce / Matematik|Fen', () => {
    const shuffled = [
      { lessonName: 'LGS-FEN BİLİMLERİ' },
      { lessonName: 'LGS-DİN KÜLTÜRÜ' },
      { lessonName: 'LGS-İNGİLİZCE' },
      { lessonName: 'LGS-TÜRKÇE' },
      { lessonName: 'LGS-MATEMATİK' },
      { lessonName: 'LGS-İNKILAP TARİHİ' }
    ];
    assert.deepEqual(
      sortOpticalLessonsByFamily(shuffled, 'lgs').map((x) => x.lessonName),
      [
        'LGS-TÜRKÇE',
        'LGS-İNKILAP TARİHİ',
        'LGS-DİN KÜLTÜRÜ',
        'LGS-İNGİLİZCE',
        'LGS-MATEMATİK',
        'LGS-FEN BİLİMLERİ'
      ]
    );
  });

  it('orders TYT tabs as Türkçe|Sosyal / Matematik|Fen', () => {
    const shuffled = [
      { lessonName: 'TYT-FEN BİLİMLERİ' },
      { lessonName: 'TYT-MATEMATİK' },
      { lessonName: 'TYT-SOSYAL BİLİMLER' },
      { lessonName: 'TYT-TÜRKÇE' }
    ];
    assert.deepEqual(
      sortOpticalLessonsByFamily(shuffled, 'yks').map((x) => x.lessonName),
      ['TYT-TÜRKÇE', 'TYT-SOSYAL BİLİMLER', 'TYT-MATEMATİK', 'TYT-FEN BİLİMLERİ']
    );
  });
});
