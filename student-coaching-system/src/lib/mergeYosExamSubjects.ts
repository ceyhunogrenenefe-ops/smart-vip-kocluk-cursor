/**
 * YÖS deneme çıktılarında temel matematik + geometri ayrı satırlardır;
 * işlenmiş kayıtta tek başlıkta toplanır ("YÖS Matematik Genel").
 */

export interface YosMergeableSubject {
  name: string;
  questions?: number;
  correct: number;
  wrong: number;
  blank: number;
  net: number;
  avg?: number;
}

export const YOS_MATEMATIK_GENEL_LABEL = 'YÖS Matematik Genel';

function isAlreadyMergedMatematikGenel(name: string): boolean {
  return /\bMatematik\s+Genel\b/i.test(name);
}

/** Matematik / geometri YÖS satırları; IQ ve sayısal yetenek hariç. */
export function participatesInYosMatematikGenelMerge(name: string): boolean {
  if (!name?.trim() || isAlreadyMergedMatematikGenel(name)) return false;

  const n = name.replace(/\s+/g, ' ').trim();
  const u = n.toLocaleUpperCase('tr-TR');

  const looksIq =
    /\bİQ\b/u.test(n) ||
    /\bIQ\b/i.test(n) ||
    /SAYISAL\s+YETENEK/i.test(u) ||
    /^YÖS\s+İ?Q$/iu.test(n) ||
    /^YOS\s+İ?Q$/iu.test(n);

  if (looksIq) return false;

  const hasYos =
    u.includes('YÖS') ||
    u.includes('YOS') ||
    /YOS[\s-]/i.test(n) ||
    /YÖS[\s-]/u.test(n);

  const isMath = u.includes('MATEMATİK') || u.includes('MATEMATIK') || /TEMEL\s+MATEMAT/i.test(u);
  const isGeo = u.includes('GEOMETRİ') || u.includes('GEOMETRI') || u.includes('GEOMET');

  return hasYos && (isMath || isGeo);
}

export function mergeYosMatematikGenelSubjects<T extends YosMergeableSubject>(
  examType: string | undefined,
  subjects: T[],
  recalcNet: (correct: number, wrong: number) => number
): T[] {
  const isYos = examType === 'YOS' || String(examType || '').toUpperCase().replace(/Ö/g, 'O') === 'YOS';
  if (!isYos || subjects.length === 0) return subjects;

  let firstParticipatingIdx = -1;
  subjects.forEach((s, i) => {
    if (participatesInYosMatematikGenelMerge(s.name) && firstParticipatingIdx < 0) {
      firstParticipatingIdx = i;
    }
  });
  if (firstParticipatingIdx < 0) return subjects;

  const grouped = subjects.filter((s) => participatesInYosMatematikGenelMerge(s.name));

  const questions = grouped.reduce((a, x) => a + (x.questions ?? 0), 0);
  const correct = grouped.reduce((a, x) => a + x.correct, 0);
  const wrong = grouped.reduce((a, x) => a + x.wrong, 0);
  const blank = grouped.reduce((a, x) => a + x.blank, 0);
  const net = recalcNet(correct, wrong);

  const avgDefined = grouped.filter((x) => typeof x.avg === 'number' && !Number.isNaN(x.avg!));
  const avgCombined =
    avgDefined.length > 0
      ? avgDefined.reduce((a, x) => a + (x.avg ?? 0), 0) / avgDefined.length
      : grouped[0].avg;

  const mergedRow = {
    ...grouped[0],
    name: YOS_MATEMATIK_GENEL_LABEL,
    questions,
    correct,
    wrong,
    blank,
    net,
    avg: avgCombined
  } as T;

  const result: T[] = [];
  subjects.forEach((s, i) => {
    if (participatesInYosMatematikGenelMerge(s.name)) {
      if (i === firstParticipatingIdx) result.push(mergedRow);
      return;
    }
    result.push(s);
  });
  return result;
}
