/**
 * Deterministic exam analysis: nets, approximate scores, percentile bands, yearly comparison text.
 * Net model (spec): net = doğru − (yanlış / 4)
 */

/** @typedef {{ name: string; correct: number; wrong: number; blank?: number }} SubjectInput */

const round2 = (n) => Math.round(Number(n) * 100) / 100;

/** Net (özel modele uygun): doğru − (yanlış/4) */
export const computeSubjectNet = (correct, wrong) =>
  round2((Number(correct) || 0) - (Number(wrong) || 0) / 4);

/** @param {SubjectInput[]} subjects */
export function buildSubjectOutputs(subjects) {
  const out = (subjects || []).map((s) => ({
    name: String(s.name || 'Ders').trim(),
    correct: Number(s.correct) || 0,
    wrong: Number(s.wrong) || 0,
    blank: 0,
    net: computeSubjectNet(s.correct, s.wrong)
  }));

  /** questions not always passed */
  out.forEach((row, i) => {
    const src = subjects[i];
    const b =
      typeof src?.blank === 'number' && Number.isFinite(src.blank)
        ? Math.max(0, src.blank)
        : typeof src?.questions === 'number' && src.questions > 0
          ? Math.max(0, src.questions - row.correct - row.wrong)
          : 0;
    row.blank = b;
  });

  const totalNet = round2(out.reduce((a, x) => a + x.net, 0));
  return { subjects: out, totalNet };
}

/** TYT yaklaşık ham puan: (30→250)(60→320)(90→400), parçalı lineer */
export function estimateTytApproxScore(totalNet) {
  const net = clamp(totalNet, 0, 120);
  let score;
  if (net <= 30) {
    const slope = (320 - 250) / (60 - 30);
    score = 250 + (net - 30) * slope;
  } else if (net <= 60) {
    score = interpolate(net, 30, 60, 250, 320);
  } else if (net <= 90) {
    score = interpolate(net, 60, 90, 320, 400);
  } else {
    const slope = (400 - 320) / (90 - 60);
    score = 400 + (net - 90) * slope;
  }
  return clamp(round2(score), 120, 500);
}

function interpolate(x, x0, x1, y0, y1) {
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}

/** Yüzdelik dilim (küçük = daha iyi, ÖSYM mantığında “daha dar dilim daha iyi”): yaklaşık */
export function estimateTytPercentileBand(totalNet) {
  /** [net_anchor, pct_dilim] — lineer ara */
  const pts = [
    [0, 99.9],
    [25, 88],
    [30, 75],
    [40, 55],
    [50, 35],
    [60, 16],
    [70, 6.5],
    [80, 2],
    [85, 0.9],
    [90, 0.35],
    [96, 0.08],
    [105, 0.02],
    [120, 0.01]
  ];
  const net = clamp(totalNet, 0, 120);
  let i = 0;
  while (i < pts.length - 1 && net > pts[i + 1][0]) i++;
  if (i >= pts.length - 1) return round2(pts[pts.length - 1][1]);
  const [n0, p0] = pts[i];
  const [n1, p1] = pts[i + 1];
  const p = interpolate(net, n0, n1, p0, p1);
  return clamp(round2(p), 0.01, 99.9);
}

export function estimateLgsScore500(totalNet) {
  /** 90 soru üst sınırı varsayımı ile basit doğrusal ham puan yaklaşımı */
  const maxNetApprox = 90;
  const n = clamp(totalNet, 0, maxNetApprox);
  /** ~150 alt taban deneme eksik performansında, ~490 üst bölgede */
  const score = interpolate(n, 0, maxNetApprox, 155, 490);
  return clamp(round2(score), 145, 500);
}

/** LGS için yüzdelik dilim (yaklaşık, deneme netine göre) */
export function estimateLgsPercentileBand(totalNet) {
  /** Daha sıkı dağılım LGS küçük aralıkta */
  const pts = [
    [0, 99.5],
    [35, 70],
    [45, 40],
    [55, 15],
    [65, 4],
    [75, 0.8],
    [85, 0.15],
    [95, 0.02],
    [100, 0.01]
  ];
  const net = clamp(totalNet, 0, 100);
  let i = 0;
  while (i < pts.length - 1 && net > pts[i + 1][0]) i++;
  if (i >= pts.length - 1) return round2(pts[pts.length - 1][1]);
  const [n0, p0] = pts[i];
  const [n1, p1] = pts[i + 1];
  return clamp(round2(interpolate(net, n0, n1, p0, p1)), 0.01, 99.9);
}

function normTr(s) {
  return String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeExamType(raw) {
  const u = String(raw || '').toUpperCase().trim();
  if (u === 'LGS' || u === '3' || u === '4' || u === '5' || u === '6' || u === '7') return 'LGS';
  if (u === 'YOS' || u === 'YÖS') return 'YOS';
  if (u.includes('TYT')) return 'TYT';
  /** AYT / YKS sınavları aynı 1/4 net modeli yaklaşımı ile TYT benzeri puan tahmini kullanır */
  if (u.includes('AYT') || u.includes('YKS')) return 'TYT';
  return 'TYT';
}

/** @param {'TYT'|'LGS'|'YOS'} examType */
export function buildYearComparisonText(examType, totalNet, percentile) {
  if (examType !== 'TYT') return null;

  /** Sabit yaklaşık yıllara göre “aynı sıralama için gereken net farkı” (model varsayımı) */
  const synth2024 = round2(totalNet + 1.15);
  const synth2023 = round2(totalNet + 2.35);
  const pct = clamp(percentile, 0.05, 99.9);

  return {
    year_2025: `2025 TYT model dağılımına göre yaklaşık %${pct.toFixed(2)} dilim tahmini (yaklaşık; OSYM sıralaması farklı olabilir).`,
    year_2024: `2024 referansına göre aynı sıralama hissi için yaklaşık ${synth2024.toFixed(1)} net bandına denktir denilebilir (normalizasyon modeli ±1 net).`,
    year_2023: `2023 referansı için yaklaşık ${synth2023.toFixed(
      1
    )} net bandı ile karşılaştırılabilir (resmi sıralama değildir, coaching modeli).`
  };
}

export function bucketStrengthsWeaknesses(subjects, examType) {
  /** @type {string[]} */
  const strengths = [];
  /** @type {string[]} */
  const weaknesses = [];
  const sorted = [...subjects].sort((a, b) => b.net - a.net);
  if (sorted.length === 0) return { strengths, weaknesses };

  const strongCut = examType === 'LGS' ? 6 : examType === 'YOS' ? 5 : 8;
  const weakCut = examType === 'LGS' ? 3 : examType === 'YOS' ? 2 : 5;

  sorted.slice(0, 3).forEach((s) => {
    if (s.net >= strongCut || s.net >= sorted[0]?.net - 2) strengths.push(`${s.name} (${s.net} net)`);
  });
  sorted
    .slice(-3)
    .reverse()
    .forEach((s) => {
      if (s.net <= weakCut || s.net <= sorted[sorted.length - 1]?.net + 1) weaknesses.push(`${s.name} (${s.net} net)`);
    });

  return { strengths: [...new Set(strengths)], weaknesses: [...new Set(weaknesses)] };
}

export function categorizeYosSubject(subjectName) {
  const n = normTr(subjectName);
  if (/\biq\b|sayısal\s+yetenek|sayisal\s+yetenek/i.test(n)) return 'iq';
  if (/geomet|geo/i.test(n)) return 'geometri';
  if (/matemat/i.test(n)) return 'matematik';
  return 'diger';
}

/** @returns {{ matematik:number; geometri:number; iq:number }} */
export function aggregateYosBands(subjects) {
  let matematik = 0;
  let geometri = 0;
  let iq = 0;
  (subjects || []).forEach((s) => {
    const bucket = categorizeYosSubject(s.name);
    if (bucket === 'matematik') matematik += s.net;
    else if (bucket === 'geometri') geometri += s.net;
    else if (bucket === 'iq') iq += s.net;
    /* bilinmeyen etiket: sayıma dahil etmiyoruz */
  });
  return {
    matematik: round2(matematik),
    geometri: round2(geometri),
    iq: round2(iq)
  };
}

/** Dikkat / işlem / zaman / görsel heuristic */
export function buildErrorPsychology(profile) {
  const { avgBlankRatio, avgWrongRatio, weakSubjectCount } = profile;
  const parts = [];

  if (avgBlankRatio > 0.18 && avgWrongRatio < 0.28) {
    parts.push({
      title: 'Zaman yönetimi',
      text: `Boş oranı yüksek (${Math.round(
        avgBlankRatio * 100
      )}%). Süre takibi ve “önce garanti sorular” stratejisi önerilir.`
    });
  } else if (avgBlankRatio < 0.1 && avgWrongRatio > 0.35) {
    parts.push({
      title: 'İşlem hatası analizi',
      text: `Yanlış oranı yüks (${Math.round(avgWrongRatio * 100)}%). Formül doğruluğu ve adım kontrol çalışması önerilir.`
    });
  } else if (weakSubjectCount >= 3) {
    parts.push({
      title: 'Dikkat hatası analizi',
      text: `Çok sayıda zayıf ders kalemi paralel görünüyor; yanlış-boş dağılımı “acele/bitirme kaynaklı görsel atlama” ihtimali taşır — soru işaretleme rutini yararlıdır.`
    });
  } else {
    parts.push({
      title: 'İşlem hatası analizi',
      text: 'Yanlış-boş dağılımı göre dengeli görünüyor; kritik yanlışlar için yanlış defteri ve tekrar sorusu yazımı kullanın.'
    });
  }

  parts.push({
    title: 'Görsel okuma / tablo grafik',
    text: `Görsel-işlem dengesi için tablo/grafik ağırlıklı kartlar ve zamanlayıcılı mini bloklar (${Math.max(
      24,
      25 - weakSubjectCount * 2
    )} dk önerilir).`
  });

  return parts;
}

export function profileFromSubjects(subjectRows) {
  let blanks = 0;
  let wrongs = 0;
  let solved = 0;
  subjectRows.forEach((s) => {
    blanks += Number(s.blank) || 0;
    wrongs += Number(s.wrong) || 0;
    solved += (Number(s.correct) || 0) + (Number(s.wrong) || 0) + (Number(s.blank) || 0);
  });
  solved = solved || subjectRows.reduce((a, x) => a + (Number(x.correct) || 0) + (Number(x.wrong) || 0), 0);

  const weakSubjectCount = subjectRows.filter((s) => s.net <= 5).length;
  return {
    avgBlankRatio: solved > 0 ? blanks / solved : 0,
    avgWrongRatio: solved > 0 ? wrongs / solved : 0,
    weakSubjectCount
  };
}

/** İki sınavdan trend → haftalık net artış extrapolasyonu */
export function projectScoreFromTrend(examHistoryDescending, examType) {
  /** her eleman totalNet içermeli tarih sıralı güncelden eskiye */
  if (!examHistoryDescending || examHistoryDescending.length < 2) return null;
  const newest = examHistoryDescending[0].totalNet;
  const oldest = examHistoryDescending[examHistoryDescending.length - 1].totalNet;
  const gaps = Math.max(1, examHistoryDescending.length - 1);
  const deltaNetPerExam = round2((newest - oldest) / gaps);

  /** 8 haftalık üç deneme kabulünün basit extrapolasyonu */
  const futureNet = round2(Math.min(125, newest + deltaNetPerExam * 2));
  let estScore;
  if (examType === 'LGS') estScore = estimateLgsScore500(futureNet);
  else estScore = estimateTytApproxScore(futureNet);

  return {
    headline: `Öğrencinin son ${examHistoryDescending.length} sınavına göre net değişim eğilimi yaklaşık ${deltaNetPerExam >= 0 ? '+' : ''}${deltaNetPerExam} net/sınav.`,
    extrapolated_net_2more: futureNet,
    extrapolated_approx_score: estScore,
    caveat: 'Tahmin, mevcut eğitime ve deneme sıklığına bağlıdır; çalışma yoğunluğu değişirse doğrusal trend geçerliliğini yitirir.'
  };
}
