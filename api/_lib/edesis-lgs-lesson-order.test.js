import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/** Mirror of EdesisOpticalSheet LGS sort — keep in sync with UI */
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

function lgsLessonRank(lessonName) {
  const n = foldLessonName(lessonName);
  for (const row of LGS_LESSON_ORDER) {
    if (row.test(n)) return row.rank;
  }
  return 50;
}

function sortLgsOpticalLessons(lessons) {
  return [...(lessons || [])].sort((a, b) => {
    const ra = lgsLessonRank(String(a.lessonName || ''));
    const rb = lgsLessonRank(String(b.lessonName || ''));
    if (ra !== rb) return ra - rb;
    return String(a.lessonName || '').localeCompare(String(b.lessonName || ''), 'tr');
  });
}

describe('sortLgsOpticalLessons', () => {
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
      sortLgsOpticalLessons(shuffled).map((x) => x.lessonName),
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
});
