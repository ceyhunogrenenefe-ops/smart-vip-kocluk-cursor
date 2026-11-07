export type JuniorVipMascotGender = 'girl' | 'boy';

const FEMALE_FIRST = new Set(
  `ada ayşe ayse azra asya beren beril berra beyza buse ceren defne derya dila dilara ece eda elif elifnaz elifnur emine esila esma esra eylül ecrin fatma gamze gizem gül gülşah hatice hira irem ipek melis melisa meryem miray naz nehir nisan nisa pelin rabia rana rüya sena sevda sibel simay suden sude tuğba yaren yasemin zehra zeynep zümra`
    .split(/\s+/)
);

const MALE_FIRST = new Set(
  `ahmet ali alp aras arda ayaz baran batu batuhan berk buğra burak can cenk deniz doruk efe emir emirhan enes eren furkan gökhan halil hasan hüseyin ibrahim kaan kerem kuzey mert mete muhammed muhammet mustafa oğuz onur ömer salih samet serkan tarık tolga umut utku yasin yiğit yigit yusuf`
    .split(/\s+/)
);

function normFirstName(name: string) {
  return String(name || '')
    .trim()
    .split(/\s+/)[0]
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

/** Öğrenci kaydında cinsiyet alanı yok — ad üzerinden sezgisel (maskot için). */
export function inferJuniorVipMascotGender(studentName?: string | null): JuniorVipMascotGender {
  const first = normFirstName(studentName || '');
  if (!first) return 'boy';
  if (FEMALE_FIRST.has(first)) return 'girl';
  if (MALE_FIRST.has(first)) return 'boy';
  if (first.endsWith('e') && !first.endsWith('me') && first.length > 3) return 'girl';
  return 'boy';
}
