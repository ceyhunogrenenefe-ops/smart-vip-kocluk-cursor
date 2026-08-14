/**
 * Edesis sınav analizi — son 5 / son 10, sınav türü ayrımı, konu önceliği, otomatik taslak.
 * Sıfır net uydurulmaz; katılmayan sınav ortalamaya girmez.
 */

export const EDESIS_REPORT_CODES = {
  KARNE: 102,
  BK5: 104,
  BK10: 105
};

export const EDESIS_REPORT_LABELS = {
  102: 'Sınav karnesi',
  104: 'BK-5 — Son 5 sınav analizi',
  105: 'BK-10 — Son 10 sınav analizi'
};

export const ANALYSIS_REPORT_STATUSES = [
  'draft',
  'teacher_review',
  'coach_review',
  'admin_review',
  'approved',
  'published_student',
  'shared_parent',
  'revised',
  'archived'
];

export const ANALYSIS_STATUS_LABELS = {
  draft: 'Taslak',
  teacher_review: 'Öğretmen değerlendirmesinde',
  coach_review: 'Koç değerlendirmesinde',
  admin_review: 'Yönetici onayında',
  approved: 'Onaylandı',
  published_student: 'Öğrenci sayfasına aktarıldı',
  shared_parent: 'Veliyle paylaşıldı',
  revised: 'Revize edildi',
  archived: 'Arşivlendi'
};

export const DEFAULT_TOPIC_THRESHOLDS = [
  { max: 39, level: 'kritik', label: 'Kritik' },
  { max: 59, level: 'gelistirilmeli', label: 'Geliştirilmeli' },
  { max: 74, level: 'orta', label: 'Orta' },
  { max: 89, level: 'iyi', label: 'İyi' },
  { max: 100, level: 'cok_iyi', label: 'Çok iyi' }
];

function foldTr(s) {
  return String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n) {
  return Math.round(num(n) * 100) / 100;
}

function pct(numVal, den) {
  if (!den || den <= 0) return null;
  return round2((100 * numVal) / den);
}

export function inferExamFamilyFromClassLevel(classLevel) {
  const raw = String(classLevel ?? '').trim();
  const s = foldTr(raw);
  if (!s) return 'tyt';
  if (s === 'lgs' || /\blgs\b/.test(s) || s === '8') return 'lgs';
  if (s === 'yos' || /\byos\b/.test(s)) return 'yos';
  if (/yks-ea|esit.?agirlik/.test(s)) return 'yks-ea';
  if (/yks-say|sayisal/.test(s)) return 'yks-say';
  if (/ayt|yks-sozel|yks-/.test(s)) return 'ayt';
  if (/tyt/.test(s)) return 'tyt';
  const n = Number(raw);
  if (n === 8) return 'lgs';
  if (n >= 3 && n <= 7) return 'okul';
  return 'tyt';
}

export function normalizeExamFamily(exam) {
  const type = foldTr(exam?.examType || '');
  const blob = foldTr(`${exam?.examType || ''} ${exam?.examTitle || ''} ${exam?.examName || ''}`);
  if (type === 'lgs' || /\blgs\b/.test(blob)) return 'lgs';
  if (type === 'yos' || /\byos\b/.test(blob)) return 'yos';
  if (type === 'ayt' || /\bayt\b/.test(blob)) return 'ayt';
  if (type === 'yks-ea' || /yks-ea|esit.?agirlik/.test(blob)) return 'yks-ea';
  if (type === 'yks-say' || /yks-say|yks.?sayisal/.test(blob)) return 'yks-say';
  if (type === 'tyt' || /\btyt\b/.test(blob)) return 'tyt';
  if (/\byks\b/.test(blob)) return 'tyt';
  if (type === '3' || type === '4' || type === '5' || type === '6' || type === '7') return 'okul';
  if (/\b(3|4|5|6|7)(\.|-| )?sinif\b/.test(blob)) return 'okul';
  return 'diger';
}

export function filterBreakdownByBranch(rows, branch) {
  const b = foldTr(branch);
  if (!b) return rows || [];
  return (rows || []).filter((r) => {
    const name = foldTr(r.name || r.subject || '');
    return name.includes(b) || b.includes(name);
  });
}

export function examHasResult(exam) {
  if (!exam || typeof exam !== 'object') return false;
  if (exam.attended === false || exam.katildi === false) return false;
  if (String(exam.attendance || exam.katilim || '').toLowerCase() === 'katilmadi') return false;
  const correct = num(exam.correct ?? exam.dogru);
  const wrong = num(exam.wrong ?? exam.yanlis);
  const blank = num(exam.blank ?? exam.bos);
  const net = exam.totalNet ?? exam.net ?? exam.net_score;
  if (correct + wrong + blank > 0) return true;
  if (net != null && String(net).trim() !== '') return true;
  if (Array.isArray(exam.subjects) && exam.subjects.some((s) => num(s.correct) + num(s.wrong) + num(s.blank) > 0)) {
    return true;
  }
  return false;
}

export function sortExamsByExamDateDesc(exams) {
  return (Array.isArray(exams) ? exams : [])
    .slice()
    .sort((a, b) => {
      const ta = Date.parse(a.examDate || a.date || 0) || 0;
      const tb = Date.parse(b.examDate || b.date || 0) || 0;
      return tb - ta;
    });
}

export function filterExamsByFamily(exams, family) {
  const want = String(family || '').trim().toLowerCase();
  if (!want || want === 'all' || want === 'hepsi') return exams;
  return exams.filter((e) => normalizeExamFamily(e) === want);
}

export function selectComparisonExams(exams, { family, window = 'all', examIds, from, to } = {}) {
  let list = sortExamsByExamDateDesc(exams);
  if (family) list = filterExamsByFamily(list, family);
  if (from) {
    const start = Date.parse(from);
    if (Number.isFinite(start)) list = list.filter((e) => (Date.parse(e.examDate || e.date || 0) || 0) >= start);
  }
  if (to) {
    const end = Date.parse(to);
    if (Number.isFinite(end)) list = list.filter((e) => (Date.parse(e.examDate || e.date || 0) || 0) <= end);
  }
  if (Array.isArray(examIds) && examIds.length) {
    const set = new Set(examIds.map((id) => String(id)));
    list = list.filter((e) => set.has(String(e.id || e.edesisExamId || '')));
  }
  const withResult = list.filter(examHasResult);
  const absent = list.filter((e) => !examHasResult(e));
  const win = String(window || 'all');
  let compared = withResult;
  if (win === 'last5' || win === '5') compared = withResult.slice(0, 5);
  if (win === 'last10' || win === '10') compared = withResult.slice(0, 10);
  return { all: list, withResult, absent, compared, last5: withResult.slice(0, 5), last10: withResult.slice(0, 10) };
}

function subjectSuccessRate(s) {
  const tot = num(s.correct) + num(s.wrong) + num(s.blank);
  return pct(num(s.correct), tot);
}

export function classifyTopicPriority(successRate, thresholds = DEFAULT_TOPIC_THRESHOLDS) {
  if (successRate == null || !Number.isFinite(Number(successRate))) {
    return { level: 'orta', label: 'Orta', successRate: null };
  }
  const rate = Number(successRate);
  const rows = Array.isArray(thresholds) && thresholds.length ? thresholds : DEFAULT_TOPIC_THRESHOLDS;
  for (const row of rows) {
    if (rate <= Number(row.max)) return { level: row.level, label: row.label, successRate: round2(rate) };
  }
  const last = rows[rows.length - 1];
  return { level: last.level, label: last.label, successRate: round2(rate) };
}

export function buildStudentAnalysisSummary(exams, opts = {}) {
  const sel = selectComparisonExams(exams, opts);
  const compared = sel.compared;
  const nets = compared.map((e) => num(e.totalNet ?? e.net ?? e.net_score));
  const last = compared[0] || null;
  const prev = compared[1] || null;
  const lastNet = last ? num(last.totalNet ?? last.net) : null;
  const prevNet = prev ? num(prev.totalNet ?? prev.net) : null;
  const netChange = lastNet != null && prevNet != null ? round2(lastNet - prevNet) : null;
  const netChangePct = lastNet != null && prevNet != null && prevNet !== 0 ? pct(lastNet - prevNet, Math.abs(prevNet)) : null;
  const avg = (arr) => (arr.length ? round2(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
  const last5Nets = sel.last5.map((e) => num(e.totalNet ?? e.net));
  const last10Nets = sel.last10.map((e) => num(e.totalNet ?? e.net));
  const successRates = compared
    .map((e) => {
      const tot = num(e.correct) + num(e.wrong) + num(e.blank);
      return pct(num(e.correct), tot);
    })
    .filter((v) => v != null);
  const subjectRows = buildSubjectBreakdown(compared);
  const strongest = subjectRows.slice().sort((a, b) => b.avgNet - a.avgNet)[0] || null;
  const weakest = subjectRows.slice().sort((a, b) => a.avgNet - b.avgNet)[0] || null;
  return {
    examCount: compared.length,
    totalExamCount: sel.withResult.length,
    absentCount: sel.absent.length,
    lastNet,
    prevNet,
    netChange,
    netChangePct,
    last5Avg: avg(last5Nets),
    last10Avg: avg(last10Nets),
    bestNet: nets.length ? Math.max(...nets) : null,
    worstNet: nets.length ? Math.min(...nets) : null,
    successRate: avg(successRates),
    strongestSubject: strongest?.name || null,
    weakestSubject: weakest?.name || null,
    lastExamDate: last?.examDate || last?.date || null,
    lastExamTitle: last?.examTitle || last?.examName || last?.examType || null,
    family: opts.family || null,
    window: opts.window || 'all'
  };
}

export function buildSubjectBreakdown(exams) {
  const map = new Map();
  for (const exam of exams || []) {
    if (!examHasResult(exam)) continue;
    for (const s of exam.subjects || []) {
      const name = String(s.name || '').trim();
      if (!name) continue;
      const key = name.toLocaleUpperCase('tr-TR');
      if (!map.has(key)) {
        map.set(key, {
          name,
          examCount: 0,
          nets: [],
          correct: 0,
          wrong: 0,
          blank: 0,
          lastNet: null,
          bestNet: null,
          worstNet: null
        });
      }
      const row = map.get(key);
      const net = num(s.net);
      row.examCount += 1;
      row.nets.push(net);
      row.correct += num(s.correct);
      row.wrong += num(s.wrong);
      row.blank += num(s.blank);
      if (row.lastNet == null) row.lastNet = net;
      row.bestNet = row.bestNet == null ? net : Math.max(row.bestNet, net);
      row.worstNet = row.worstNet == null ? net : Math.min(row.worstNet, net);
    }
  }
  return [...map.values()].map((row) => {
    const tot = row.correct + row.wrong + row.blank;
    const last5 = row.nets.slice(0, 5);
    const last10 = row.nets.slice(0, 10);
    const avg = (arr) => (arr.length ? round2(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
    const prevAvg = row.nets.length > 5 ? avg(row.nets.slice(5, 10)) : null;
    const last5Avg = avg(last5);
    return {
      name: row.name,
      examCount: row.examCount,
      correct: row.correct,
      wrong: row.wrong,
      blank: row.blank,
      avgNet: avg(row.nets),
      lastNet: row.lastNet,
      last5Avg,
      last10Avg: avg(last10),
      periodChange: last5Avg != null && prevAvg != null ? round2(last5Avg - prevAvg) : null,
      bestNet: row.bestNet,
      worstNet: row.worstNet,
      successRate: pct(row.correct, tot),
      rising: row.nets.length >= 2 ? row.nets[0] > row.nets[1] : false,
      falling: row.nets.length >= 2 ? row.nets[0] < row.nets[1] : false
    };
  });
}

export function buildTopicBreakdown(exams, thresholds = DEFAULT_TOPIC_THRESHOLDS) {
  const map = new Map();
  for (const exam of exams || []) {
    if (!examHasResult(exam)) continue;
    for (const s of exam.subjects || []) {
      for (const t of s.topics || []) {
        const topicName = String(t.name || '').trim();
        if (!topicName) continue;
        const key = `${String(s.name || '').toLocaleUpperCase('tr-TR')}::${topicName.toLocaleUpperCase('tr-TR')}`;
        if (!map.has(key)) {
          map.set(key, {
            name: topicName,
            subject: s.name || '',
            correct: 0,
            wrong: 0,
            blank: 0
          });
        }
        const row = map.get(key);
        row.correct += num(t.correct);
        row.wrong += num(t.wrong);
        row.blank += num(t.blank);
      }
    }
  }
  return [...map.values()]
    .map((row) => {
      const total = row.correct + row.wrong + row.blank;
      const successRate = pct(row.correct, total);
      const pri = classifyTopicPriority(successRate, thresholds);
      return {
        ...row,
        total,
        successRate,
        priority: pri.level,
        priorityLabel: pri.label
      };
    })
    .sort((a, b) => (a.successRate ?? 101) - (b.successRate ?? 101));
}

export function buildLastVsPrevComparison(exams) {
  const withRes = sortExamsByExamDateDesc(exams).filter(examHasResult);
  const last5 = withRes.slice(0, 5);
  const prev5 = withRes.slice(5, 10);
  const avg = (arr) =>
    arr.length ? round2(arr.reduce((a, e) => a + num(e.totalNet ?? e.net), 0) / arr.length) : null;
  const last5Avg = avg(last5);
  const prev5Avg = avg(prev5);
  return {
    last5Avg,
    prev5Avg,
    change: last5Avg != null && prev5Avg != null ? round2(last5Avg - prev5Avg) : null,
    last5Count: last5.length,
    prev5Count: prev5.length,
    bars: [
      { name: 'Son 5', avgNet: last5Avg },
      { name: 'Önceki 5', avgNet: prev5Avg }
    ]
  };
}

export function buildChartSeries(exams) {
  const chronological = sortExamsByExamDateDesc(exams).filter(examHasResult).reverse();
  const netLine = chronological.map((e) => ({
    examTitle: e.examTitle || e.examName || e.examType || 'Deneme',
    examDate: e.examDate || e.date || '',
    net: num(e.totalNet ?? e.net),
    correct: num(e.correct),
    wrong: num(e.wrong),
    blank: num(e.blank),
    successRate: pct(num(e.correct), num(e.correct) + num(e.wrong) + num(e.blank))
  }));
  const subjects = buildSubjectBreakdown(exams);
  return {
    netLine,
    subjects: subjects.map((s) => ({ name: s.name, avgNet: s.avgNet, lastNet: s.lastNet })),
    rising: subjects.filter((s) => s.rising).map((s) => s.name),
    falling: subjects.filter((s) => s.falling).map((s) => s.name),
    lastVsPrev: buildLastVsPrevComparison(exams)
  };
}

function fmtNet(v) {
  if (v == null) return 'veri yok';
  return String(round2(v));
}

function onlyIfData(condition, text) {
  return condition ? text : '';
}

export function buildAutoEvaluationDraft({ summary, subjects, topics, studentName } = {}) {
  const name = String(studentName || 'Öğrenci').trim() || 'Öğrenci';
  const s = summary || {};
  const sub = Array.isArray(subjects) ? subjects : [];
  const top = Array.isArray(topics) ? topics : [];
  const strong = sub.filter((r) => (r.successRate ?? 0) >= 75).map((r) => r.name);
  const weak = sub.filter((r) => (r.successRate ?? 100) < 60).map((r) => r.name);
  const kritik = top.filter((t) => t.priority === 'kritik');
  const last5 = s.last5Avg != null ? `Son 5 deneme net ortalaması ${fmtNet(s.last5Avg)}.` : 'Son 5 deneme için yeterli sonuç yok.';
  const last10 = s.last10Avg != null ? `Son 10 deneme net ortalaması ${fmtNet(s.last10Avg)}.` : 'Son 10 deneme için yeterli sonuç yok.';
  const change =
    s.netChange != null
      ? `Son sınav neti ${fmtNet(s.lastNet)}; bir önceki sınava göre ${s.netChange >= 0 ? '+' : ''}${fmtNet(s.netChange)} net (${s.netChangePct != null ? `${s.netChangePct}%` : 'yüzde hesaplanamadı'}).`
      : onlyIfData(s.lastNet != null, `Son sınav neti ${fmtNet(s.lastNet)}. Karşılaştırılacak önceki sınav yok.`);

  return {
    genel: `${name} için ${s.examCount || 0} değerlendirilmiş deneme var. ${last5} ${last10}`.trim(),
    sonSinav: s.lastExamTitle
      ? `${s.lastExamTitle} (${s.lastExamDate || 'tarih yok'}): ${change || 'net verisi yok.'}`
      : 'Son sınav kaydı yok.',
    son5: last5,
    son10: last10,
    netGelisimi: change || 'Net gelişimi için en az iki sonuçlu deneme gerekir.',
    dersBazli: sub.length
      ? sub.map((r) => `${r.name}: son net ${fmtNet(r.lastNet)}, son 5 ort. ${fmtNet(r.last5Avg)}, D ${r.correct} Y ${r.wrong} B ${r.blank}.`).join('\n')
      : 'Ders kırılımı yok.',
    gucluDersler: strong.length ? strong.join(', ') : 'Yeterli veri yok.',
    gelistirilecekDersler: weak.length ? weak.join(', ') : 'Yeterli veri yok.',
    kritikKonular: kritik.length
      ? kritik.slice(0, 12).map((t) => `${t.subject} / ${t.name} (başarı ${fmtNet(t.successRate)}%)`).join('\n')
      : 'Kritik konu verisi yok.',
    ogretmen: '',
    koc: '',
    haftalikOneri: weak.length
      ? `${weak.slice(0, 3).join(', ')} derslerinde konu tekrarı ve soru çözümü planlanmalı.`
      : '',
    soruHedefi: '',
    etut: '',
    ozelDers: '',
    ogrenciMesaj: '',
    veliMesaj: '',
    sonrakiHedef: s.lastNet != null ? `Bir sonraki denemede son netin (${fmtNet(s.lastNet)}) üzerine çıkmak.` : ''
  };
}

export function buildExamTableRows(exams) {
  return sortExamsByExamDateDesc(exams).map((e) => {
    const has = examHasResult(e);
    const tot = num(e.correct) + num(e.wrong) + num(e.blank);
    return {
      id: e.id || null,
      edesisExamId: e.edesisExamId || null,
      examTitle: e.examTitle || e.examName || e.examType || 'Deneme',
      examDate: e.examDate || e.date || '',
      examType: e.examType || '',
      family: normalizeExamFamily(e),
      totalNet: has ? num(e.totalNet ?? e.net) : null,
      correct: has ? num(e.correct) : null,
      wrong: has ? num(e.wrong) : null,
      blank: has ? num(e.blank) : null,
      successRate: has ? pct(num(e.correct), tot) : null,
      attended: has,
      attendanceLabel: has ? 'Katıldı' : 'Katılmadı'
    };
  });
}

export function payloadToExam(row) {
  if (row?.app_payload && typeof row.app_payload === 'object') {
    return { ...row.app_payload, id: row.app_payload.id || row.id, studentId: row.app_payload.studentId || row.student_id };
  }
  return {
    id: row?.id,
    studentId: row?.student_id,
    examTitle: row?.exam_name,
    examName: row?.exam_name,
    examDate: row?.date,
    examType: row?.app_payload?.examType || '',
    totalNet: num(row?.net_score),
    correct: num(row?.correct),
    wrong: num(row?.wrong),
    blank: num(row?.blank),
    subjects: Array.isArray(row?.app_payload?.subjects) ? row.app_payload.subjects : [],
    source: row?.app_payload?.source || 'edesis',
    edesisExamId: row?.app_payload?.edesisExamId
  };
}

export function buildFullStudentAnalysis(exams, opts = {}) {
  const sel = selectComparisonExams(exams, opts);
  const summary = buildStudentAnalysisSummary(exams, opts);
  let subjects = buildSubjectBreakdown(sel.compared);
  let topics = buildTopicBreakdown(sel.compared, opts.thresholds);
  if (opts.teacherBranch) {
    subjects = filterBreakdownByBranch(subjects, opts.teacherBranch);
    topics = filterBreakdownByBranch(topics, opts.teacherBranch);
  }
  const charts = buildChartSeries(sel.compared);
  const table = buildExamTableRows(sel.all);
  const draft = buildAutoEvaluationDraft({
    summary,
    subjects,
    topics,
    studentName: opts.studentName
  });
  return {
    summary,
    subjects,
    topics,
    charts,
    table,
    draft,
    last5: sel.last5.map((e) => e.id || e.edesisExamId),
    last10: sel.last10.map((e) => e.id || e.edesisExamId),
    comparedIds: sel.compared.map((e) => e.id || e.edesisExamId),
    window: opts.window || 'all',
    family: opts.family || null
  };
}
