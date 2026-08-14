/**
 * Edesis External API v1.5 — https://{domain}/api/external/v1
 * Auth: X-API-Key header only (key is tenant-scoped; no KurumKodu).
 * v1.5: GET /exams/{id}/structure, POST /exams/{id}/results (ingest), GET /results/status
 * v1.4: GET /students TermId, StudentState, ClassroomId, IsActive, ModifiedAfter
 */

const API_V1_PREFIX = '/api/external/v1';

export const V1_PATHS = {
  students: `${API_V1_PREFIX}/students`,
  terms: `${API_V1_PREFIX}/terms`,
  exams: `${API_V1_PREFIX}/exams`,
  grades: `${API_V1_PREFIX}/grades`,
  departments: `${API_V1_PREFIX}/departments`,
  classrooms: `${API_V1_PREFIX}/classrooms`,
  parents: `${API_V1_PREFIX}/parents`,
  examResults: `${API_V1_PREFIX}/exams/results`,
  examResultsByExam: (examId) => `${API_V1_PREFIX}/exams/${encodeURIComponent(examId)}/results`,
  examStructure: (examId) => `${API_V1_PREFIX}/exams/${encodeURIComponent(examId)}/structure`,
  examById: (examId) => `${API_V1_PREFIX}/exams/${encodeURIComponent(examId)}`,
  examBooklets: (examId) => `${API_V1_PREFIX}/exams/${encodeURIComponent(examId)}/booklets`,
  examFiles: (examId) => `${API_V1_PREFIX}/exams/${encodeURIComponent(examId)}/files`,
  examPdf: (examId) => `${API_V1_PREFIX}/exams/${encodeURIComponent(examId)}/pdf`,
  examSubjects: (examId) => `${API_V1_PREFIX}/exams/${encodeURIComponent(examId)}/subjects`,
  examResultsStatus: (examId) => `${API_V1_PREFIX}/exams/${encodeURIComponent(examId)}/results/status`,
  examResultsLessons: (examId) => `${API_V1_PREFIX}/exams/${encodeURIComponent(examId)}/results/lessons`,
  examResultsSubjects: (examId) => `${API_V1_PREFIX}/exams/${encodeURIComponent(examId)}/results/subjects`,
  analyticsReports: `${API_V1_PREFIX}/analytics/reports`,
  analyticsStudent: (studentId) =>
    `${API_V1_PREFIX}/analytics/reports/student/${encodeURIComponent(studentId)}`,
  examReport: `${API_V1_PREFIX}/reports/exam-report`,
  reportJobStatus: (jobId) => `${API_V1_PREFIX}/reports/job-status/${encodeURIComponent(jobId)}`
};

const DEFAULT_BASES = [
  'https://onlinevipdershane.api.edesis.com',
  'https://onlinevipdershane.edesis.com'
];

const PAGE_SIZE = 1000; // liste uçları
const BREAKDOWN_PAGE_SIZE = 100; // /results/lessons ve /results/subjects max 100
const MAX_PAGES = 50;

/** Edesis bazen konu kırılımını yalnızca detay bayraklarıyla döner */
const EXAM_DETAIL_QUERY = {
  IncludeDetails: true,
  includeSubjectDetails: true,
  includeTopics: true
};

const SUBJECT_ARRAY_KEYS = [
  'dersler',
  'subjects',
  'branches',
  'lessonResults',
  'dersSonuclari',
  'subjectResults',
  'examSubjectResults',
  'sinavSonucDersler',
  'ogrenciSinavSonucDersleri',
  'detayliSonuclar',
  'detaySonuclar',
  'lessons',
  'lessonDetails',
  'bransSonuclari',
  'examBranches',
  'branchResults',
  'konular'
];

function normEdesisId(v) {
  if (v == null || v === '') return '';
  return String(v).trim();
}

export function flattenEdesisRow(row) {
  if (!row || typeof row !== 'object') return row || {};
  if (row.ogrenci && typeof row.ogrenci === 'object' && !Array.isArray(row.ogrenci)) {
    return { ...row, ...row.ogrenci };
  }
  return row;
}

function examIdsMatch(a, b) {
  const x = normEdesisId(a);
  const y = normEdesisId(b);
  return Boolean(x && y && x === y);
}

function subjectTopicCount(row) {
  return extractSubjectsFromEdesisRow(row)
    .map(mapSubjectEntry)
    .reduce((n, s) => n + (s.topics?.length ?? 0), 0);
}

/** Konu kırılımı eksikse zenginleştir — çok dersli özet satırları da dahil */
export function needsTopicEnrichment(row) {
  const subs = extractSubjectsFromEdesisRow(row).map(mapSubjectEntry);
  if (!subs.length) return true;
  return !subs.some((s) => (s.topics?.length ?? 0) > 0);
}

function findEnrichmentKeyForDetailRow(byKey, detailRow) {
  const key = edesisResultKey(detailRow);
  if (key && byKey.has(key)) return key;

  const flat = flattenEdesisRow(detailRow);
  const detailExamId = pickStr(flat, ['examId', 'sinavId', 'sinav_id']);
  const detailStudentId = pickStr(flat, ['studentId', 'ogrenciId', 'ogrenci_id']);
  if (!detailExamId || !detailStudentId) return null;

  for (const [k, base] of byKey.entries()) {
    const baseFlat = flattenEdesisRow(base);
    const baseExamId = pickStr(baseFlat, ['examId', 'sinavId', 'sinav_id']);
    const baseStudentId = pickStr(baseFlat, ['studentId', 'ogrenciId', 'ogrenci_id']);
    if (examIdsMatch(detailExamId, baseExamId) && normEdesisId(detailStudentId) === normEdesisId(baseStudentId)) {
      return k;
    }
  }
  return null;
}

export const EDESIS_HTML404_HELP =
  'Edesis v1 endpoint bulunamadı — EDESIS_API_BASE_URL=https://{kurum}.api.edesis.com olmalı; key paketi exams veya student_dashboard olmalı (bilgi@sinavza.com).';

export function getEdesisConfig() {
  const apiKey = String(process.env.EDESIS_API_KEY || '').trim();
  let baseUrl = String(process.env.EDESIS_API_BASE_URL || '').trim().replace(/\/+$/, '');

  // Eski yapılandırma: base URL path içeriyorsa domain'e indir
  if (baseUrl && /\/api\/external/i.test(baseUrl)) {
    baseUrl = baseUrl.replace(/\/api\/external.*$/i, '').replace(/\/+$/, '');
  }

  const authMode = String(process.env.EDESIS_AUTH_MODE || 'x-api-key').trim().toLowerCase();

  // Legacy env — artık kullanılmıyor; v1 path sabit
  const legacyResults = String(process.env.EDESIS_RESULTS_PATH || '').trim();
  const legacyExams = String(process.env.EDESIS_EXAMS_PATH || '').trim();
  const institutionCode = String(process.env.EDESIS_INSTITUTION_CODE || '').trim();

  const bases = baseUrl ? [baseUrl] : DEFAULT_BASES;

  return {
    apiKey,
    institutionCode,
    baseUrl: baseUrl || bases[0],
    bases,
    authMode,
    apiVersion: 'v1.5',
    legacyResultsPath: legacyResults || null,
    legacyExamsPath: legacyExams || null
  };
}

function buildHeaders(cfg, { forGet = false } = {}) {
  const h = { Accept: 'application/json' };
  if (!forGet) h['Content-Type'] = 'application/json';
  if (!cfg.apiKey) return h;
  if (cfg.authMode === 'bearer') h.Authorization = `Bearer ${cfg.apiKey}`;
  else h['X-API-Key'] = cfg.apiKey;
  return h;
}

function joinUrl(base, path) {
  const b = String(base || '').replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

function stripResponseText(text) {
  return String(text || '')
    .replace(/^\uFEFF/, '')
    .trim();
}

function looksLikeHtml(text) {
  const t = stripResponseText(text).slice(0, 200).toLowerCase();
  return (
    t.startsWith('<!doctype') ||
    t.startsWith('<html') ||
    t.startsWith('<head') ||
    t.includes('egitimdestek - error') ||
    t.includes('m-error_title')
  );
}

export function parseEdesisResponseText(text) {
  const cleaned = stripResponseText(text);
  if (!cleaned) return { json: null, parseOk: true, rawPreview: '' };
  if (looksLikeHtml(cleaned)) {
    return { json: null, parseOk: false, rawPreview: cleaned.slice(0, 200), invalidBody: 'html' };
  }
  try {
    return { json: JSON.parse(cleaned), parseOk: true, rawPreview: cleaned.slice(0, 200) };
  } catch {
    return {
      json: null,
      parseOk: false,
      rawPreview: cleaned.slice(0, 200),
      invalidBody: 'non_json'
    };
  }
}

export async function fetchEdesisJson(cfg, path, { method = 'GET', body, timeoutMs = 30000 } = {}) {
  const url = joinUrl(cfg.baseUrl, path);
  const maxAttempts = 3;
  let last = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const init = {
      method,
      headers: buildHeaders(cfg, { forGet: method === 'GET' }),
      signal: AbortSignal.timeout(timeoutMs)
    };
    if (body !== undefined && method !== 'GET') {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const res = await fetch(url, init);
    const text = await res.text();
    const contentType = res.headers.get('content-type') || '';
    const parsed = parseEdesisResponseText(text);
    const json = parsed.parseOk ? parsed.json : { _raw: parsed.rawPreview, _invalidBody: parsed.invalidBody };

    last = {
      ok: res.ok,
      status: res.status,
      url,
      json,
      parseOk: parsed.parseOk,
      contentType,
      rawPreview: parsed.rawPreview,
      text: stripResponseText(text)?.slice(0, 300),
      rateLimit: {
        limit: res.headers.get('x-ratelimit-limit'),
        remaining: res.headers.get('x-ratelimit-remaining')
      }
    };

    if (res.status !== 429 || attempt === maxAttempts - 1) return last;
    const retryAfterRaw = res.headers.get('retry-after');
    const retryAfter = Number(retryAfterRaw);
    const waitMs = Number.isFinite(retryAfter) ? Math.min(Math.max(retryAfter, 1) * 1000, 20000) : 2000 * (attempt + 1);
    await sleep(waitMs);
  }
  return last;
}

function isEdesisErrorBody(json) {
  return Boolean(json && typeof json === 'object' && (json.error || json.unAuthorizedRequest));
}

export function isReachableEdesisResponse(r) {
  if (!r?.ok || isEdesisErrorBody(r.json)) return false;
  if (r.parseOk === false || r.json?._invalidBody) return false;
  if (looksLikeHtml(r.text || r.rawPreview || '')) return false;
  return true;
}

export function isAuthConnectedResponse(r) {
  if (!r?.ok) return false;
  if (r.status === 401 || r.status === 403) return false;
  if (isEdesisErrorBody(r.json)) return false;
  if (looksLikeHtml(r.text || r.rawPreview || '')) return false;
  return true;
}

function isEdesisHtml404(r) {
  const preview = stripResponseText(r?.rawPreview || r?.text || '').toLowerCase();
  return looksLikeHtml(preview) && (preview.includes('404') || preview.includes('error'));
}

function defaultDateRangeQuery() {
  const end = new Date();
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 2);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { StartDate: fmt(start), EndDate: fmt(end) };
}

function unwrapList(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.items)) return json.items;
  if (json.result && Array.isArray(json.result.items)) return json.result.items;
  if (json.result && Array.isArray(json.result)) return json.result;
  if (json.data && Array.isArray(json.data)) return json.data;
  // Tek kayıt (exams/results bazen obje döner)
  if (typeof json === 'object' && (json.studentId != null || json.examId != null)) return [json];
  return [];
}

export function describeEdesisJson(json) {
  if (json == null) return { type: 'null' };
  if (Array.isArray(json)) return { type: 'array', length: json.length };
  if (typeof json !== 'object') return { type: typeof json };
  const keys = Object.keys(json).slice(0, 20);
  const hint = {};
  for (const k of keys.slice(0, 8)) {
    const v = json[k];
    if (Array.isArray(v)) hint[k] = `array[${v.length}]`;
    else if (v && typeof v === 'object') hint[k] = `object{${Object.keys(v).slice(0, 5).join(',')}}`;
    else hint[k] = typeof v;
  }
  return { type: 'object', keys, hint, unwrappedLength: unwrapList(json).length, totalCount: json.totalCount };
}

function buildQuery(params) {
  const parts = [];
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/** v1 sayfalı liste — MaxResultCount max 1000; kırılım uçlarında max 100 */
async function fetchAllPaged(cfg, path, query = {}, { pageSize = PAGE_SIZE } = {}) {
  const items = [];
  let skip = 0;
  let lastTotal = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = buildQuery({
      ...query,
      MaxResultCount: pageSize,
      SkipCount: skip
    });
    const r = await fetchEdesisJson(cfg, `${path}${qs}`);
    if (r.status === 429) {
      const err = new Error('edesis_rate_limit');
      err.retryAfter = 10;
      throw err;
    }
    if (!isReachableEdesisResponse(r)) {
      if (page === 0) return { rows: [], response: r, error: r.json?.error || 'fetch_failed', totalCount: 0 };
      break;
    }
    const batch = unwrapList(r.json);
    items.push(...batch);
    const total = Number(r.json?.totalCount);
    if (Number.isFinite(total)) lastTotal = total;
    if (!batch.length || batch.length < pageSize) break;
    if (Number.isFinite(total) && items.length >= total) break;
    skip += batch.length;
  }
  return {
    rows: items,
    response: null,
    error: null,
    totalCount: lastTotal != null ? lastTotal : items.length
  };
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pickStr(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

function foldTrAscii(s) {
  return String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

/** Katalog satırı — Edesis `id` sınav kimliğidir */
export function pickEdesisCatalogExamId(row) {
  const r = flattenEdesisRow(row);
  return pickStr(r, ['id', 'examId', 'sinavId', 'sinav_id']);
}

/** Sonuç satırı — `id` sonuç kaydı olabilir, sınav için examId kullanılır */
export function pickEdesisResultExamId(row) {
  const r = flattenEdesisRow(row);
  if (r.exam && typeof r.exam === 'object') {
    const nested = pickStr(r.exam, ['id', 'examId', 'sinavId']);
    if (nested) return nested;
  }
  return pickStr(r, ['examId', 'sinavId', 'sinav_id', 'exam_id']);
}

/**
 * Öğrenci kademesi / sınav türü → program anahtarı (lgs, yks, yos, 34, 56).
 * Kurum kataloğundaki TYT/YÖS/ilkokul denemelerini LGS öğrencisinden ayırmak için.
 */
export function inferEdesisExamProgramKeys(parts = {}) {
  const blob = foldTrAscii(
    [parts.gradeName, parts.className, parts.classLevel, parts.examType, parts.examName]
      .filter((v) => v != null && String(v).trim())
      .join(' ')
  );
  const keys = new Set();
  if (/\blgs\b/.test(blob)) keys.add('lgs');
  if (/\b(tyt|ayt|yks)\b/.test(blob)) keys.add('yks');
  if (/\byos\b/.test(blob)) keys.add('yos');
  if (/3\s*-\s*4/.test(blob)) keys.add('34');
  if (/5\s*-\s*6/.test(blob)) keys.add('56');
  if (/(?:^|[\s.])(7|8)(?:\.|\s|$)/.test(blob) || /\b(7|8)\s*\.?\s*sinif\b/.test(blob)) keys.add('lgs');
  if (/(?:^|[\s.])(9|10|11|12)(?:\.|\s|$)/.test(blob) || /\bmezun\b/.test(blob)) keys.add('yks');
  if (/(?:^|[\s.])(3|4)(?:\.|\s|$)/.test(blob) && !keys.has('lgs') && !keys.has('yks')) keys.add('34');
  if (/(?:^|[\s.])(5|6)(?:\.|\s|$)/.test(blob) && !keys.has('lgs') && !keys.has('yks')) keys.add('56');
  return keys;
}

export function edesisCatalogExamMatchesProgram(exam, programKeys) {
  if (!programKeys || !programKeys.size) return false;
  const examKeys = inferEdesisExamProgramKeys({
    examType: exam?.examType || exam?.sinavTuru,
    examName: exam?.name || exam?.examName || exam?.title || exam?.examTitle
  });
  for (const k of examKeys) {
    if (programKeys.has(k)) return true;
  }
  return false;
}

/** Sonuç listesinden baskın program (sınıf yoksa LGS vs 5. sınıf karışmasını ayırır) */
export function majorityEdesisProgramKeys(items) {
  const counts = new Map();
  for (const item of items || []) {
    const ks = inferEdesisExamProgramKeys({
      examType: item.examType,
      examName: item.name || item.examName || item.examTitle
    });
    for (const k of ks) counts.set(k, (counts.get(k) || 0) + 1);
  }
  if (!counts.size) return new Set();
  let best = 0;
  for (const n of counts.values()) if (n > best) best = n;
  const leaders = [...counts.entries()].filter(([, n]) => n === best).map(([k]) => k);
  if (leaders.length !== 1) return new Set();
  return new Set(leaders);
}

export function filterEdesisExamsForStudentProgram(items, programKeys) {
  const list = Array.isArray(items) ? items : [];
  let keys = programKeys instanceof Set ? new Set(programKeys) : new Set(programKeys || []);
  if (!keys.size) keys = majorityEdesisProgramKeys(list);
  if (!keys.size) return list;
  return list.filter((item) =>
    edesisCatalogExamMatchesProgram(
      { examType: item.examType, name: item.name || item.examName || item.examTitle },
      keys
    )
  );
}

const OPEN_CATALOG_WINDOW_DAYS = 21;

export function isOpenEdesisCatalogExam(exam) {
  const status = String(exam?.resultStatus || exam?.status || 'None').trim();
  // Closed only — Ready = kurumda sonuç var; atanmış öğrenci hâlâ girebilir (Edesis Online gibi)
  if (/^(closed|cancelled|canceled|archived|deleted|inactive)$/i.test(status)) return false;
  return true;
}

function collectEdesisIdList(obj, keys) {
  const out = [];
  for (const k of keys) {
    const v = obj?.[k];
    if (v == null || v === '') continue;
    if (Array.isArray(v)) {
      for (const it of v) {
        if (it != null && typeof it === 'object') {
          const id = pickStr(it, ['id', 'studentId', 'ogrenciId', 'classroomId', 'sinifId']);
          if (id) out.push(id);
        } else if (String(it).trim()) {
          out.push(String(it).trim());
        }
      }
    } else if (typeof v === 'string' && v.includes(',')) {
      out.push(...v.split(',').map((s) => s.trim()).filter(Boolean));
    } else if (String(v).trim()) {
      out.push(String(v).trim());
    }
  }
  return out;
}

/**
 * Katalog satırı bu öğrenciye atanmış mı?
 * true / false / null (alan yok, bilinmiyor)
 */
export function catalogExamAssignedToStudent(exam, scope = {}) {
  const flat = flattenEdesisRow(exam);
  const nestedCandidates = [flat.exam, flat.sinav, flat.result, flat.data]
    .filter((x) => x && typeof x === 'object' && !Array.isArray(x))
    .map((x) => flattenEdesisRow(x));
  const sources = [flat, ...nestedCandidates];

  for (const src of sources) {
    if (src.isAllClasses === true || src.allClasses === true || src.tumSiniflar === true) {
      return true;
    }
    const studentIds = collectEdesisIdList(src, [
      'studentIds',
      'ogrenciIds',
      'assignedStudentIds',
      'ogrenciIdList',
      'studentIdList',
      'students',
      'ogrenciler',
      'sinavOgrenciler',
      'examStudents',
      'ogrenciListesi',
      'assignedStudents'
    ]);
    const wantStudent = normEdesisId(scope.edesisStudentId);
    if (studentIds.length && wantStudent) {
      return studentIds.some((id) => normEdesisId(id) === wantStudent);
    }
    const classroomIds = collectEdesisIdList(src, [
      'classroomIds',
      'sinifIds',
      'classroomId',
      'sinifId',
      'classId',
      'classIds',
      'subeIds',
      'sinifIdList'
    ]);
    const wantClass = normEdesisId(scope.classroomId);
    if (classroomIds.length && wantClass) {
      return classroomIds.some((id) => normEdesisId(id) === wantClass);
    }
  }
  return null;
}

/** Detay zenginleştirme sırası — yeni tanımlanan denemeler önce */
export function sortCatalogExamsByRecencyDesc(rows) {
  return [...(rows || [])].sort((a, b) => catalogExamRecencyMs(b) - catalogExamRecencyMs(a));
}

function catalogExamRecencyMs(exam) {
  const flat = flattenEdesisRow(exam);
  let best = 0;
  for (const k of [
    'lastModificationTime',
    'modifiedDate',
    'updatedAt',
    'resultsUpdatedAt',
    'creationTime',
    'createdDate',
    'createdAt',
    'examDate',
    'date'
  ]) {
    const t = Date.parse(flat[k]);
    if (Number.isFinite(t) && t > best) best = t;
  }
  return best;
}

export function isRecentOpenCatalogExam(exam, now = new Date(), windowDays = OPEN_CATALOG_WINDOW_DAYS) {
  const ms = catalogExamRecencyMs(exam);
  if (!ms) return false;
  const diffDays = (now.getTime() - ms) / 86400000;
  return diffDays <= windowDays;
}

function catalogRowExamId(row) {
  return String(row?.id ?? row?.examId ?? row?.sinavId ?? '').trim();
}

/**
 * GET /exams?StudentId= / ClassroomId= gerçekten süzdü mü?
 * Tam katalog dökümü (aynı id kümesi) → false.
 * Küçük kurumlarda oran yüksek olsa bile id alt kümesi → true (eski %75 kuralı atanmışları kaçırıyordu).
 */
export function catalogLooksStudentFiltered(fullRows, studentRows) {
  const full = Array.isArray(fullRows) ? fullRows : [];
  const student = Array.isArray(studentRows) ? studentRows : [];
  if (!student.length) return false;

  const fullIds = new Set(full.map(catalogRowExamId).filter(Boolean));
  const studentIds = [...new Set(student.map(catalogRowExamId).filter(Boolean))];
  if (!studentIds.length) return false;
  if (!fullIds.size) return studentIds.length > 0 && studentIds.length <= 80;

  // API StudentId’yi yok sayıp tüm kataloğu döndü
  if (studentIds.length >= fullIds.size) {
    const same = studentIds.every((id) => fullIds.has(id));
    if (same) return false;
  }

  const subsetOfFull = studentIds.every((id) => fullIds.has(id));
  if (subsetOfFull && studentIds.length < fullIds.size) return true;

  // Farklı şekil ama belirgin şekilde daha kısa liste
  if (studentIds.length < full.length && studentIds.length <= 80) return true;
  return false;
}

/** Henüz sonucu olmayan, bu öğrenciye tanımlanmış katalog denemesi */
export function shouldOfferUntakenCatalogExam(exam, scope = {}, now = new Date()) {
  if (!exam || !isOpenEdesisCatalogExam(exam)) return false;
  const keys = scope.programKeys instanceof Set ? scope.programKeys : new Set(scope.programKeys || []);
  const assigned = catalogExamAssignedToStudent(exam, scope);
  if (assigned === false) return false;
  if (keys.size && !edesisCatalogExamMatchesProgram(exam, keys)) return false;
  if (assigned === true) return true;
  // Atama alanı yok: yalnızca Edesis StudentId listesi gerçekten kısaldıysa güven.
  if (scope.assignedCatalogOnly) return true;
  return false;
}

const BOOKLET_URL_KEYS = [
  'bookletUrl',
  'bookletPDFUrl',
  'bookletPdfUrl',
  'kitapcikUrl',
  'kitapcikPdfUrl',
  'examPdfUrl',
  'sinavPdfUrl',
  'sinavUrl',
  'denemeUrl',
  'denemePdfUrl',
  'pdfFileUrl',
  'fileUrl',
  'pdfUrl',
  'downloadUrl',
  'signedUrl',
  'storageUrl',
  'blobUrl',
  'cdnUrl'
];

const SKIP_BOOKLET_URL_KEYS = /reporturl|statusurl|karne|analytics|thumbnail|imageurl|logo|avatar/i;

export function collectEdesisBookletFiles(json, out = [], seen = new Set()) {
  if (!json || typeof json !== 'object') return out;
  if (seen.has(json)) return out;
  seen.add(json);
  if (Array.isArray(json)) {
    for (const it of json) collectEdesisBookletFiles(it, out, seen);
    return dedupeBookletFiles(out);
  }

  const kitapcikTuru =
    pickStr(json, ['kitapcikTuru', 'booklet', 'bookletType', 'bookletCode', 'kitapcik']) || '';
  const name = pickStr(json, ['bookletName', 'fileName', 'filename', 'name', 'title']) || 'Kitapçık PDF';
  const mime = pickStr(json, ['mimeType', 'contentType', 'fileType', 'content_type', 'mime']).toLowerCase();

  const dedicated = pickStr(json, BOOKLET_URL_KEYS);
  const generic = pickStr(json, ['url', 'href', 'link']);
  let url = coerceFileUrl(dedicated);
  if (!url && generic && looksLikeBookletFile({ url: generic, mime, name, kitapcikTuru })) {
    url = coerceFileUrl(generic);
  }
  if (url) {
    out.push({ url, kitapcikTuru, name });
  }

  for (const [k, v] of Object.entries(json)) {
    if (typeof v === 'string' && /booklet|kitapcik|pdf|denemeurl|sinavurl|denemepdf|sinavpdf/i.test(k) && !SKIP_BOOKLET_URL_KEYS.test(k)) {
      const nestedUrl = coerceFileUrl(v);
      if (nestedUrl) {
        const letter = (k.match(/(?:^|[^A-Z])([ABCD])(?:$|[^A-Z])/i) || [])[1] || kitapcikTuru;
        out.push({ url: nestedUrl, kitapcikTuru: letter || '', name: k });
      }
    }
    if (v && typeof v === 'object') collectEdesisBookletFiles(v, out, seen);
  }
  return dedupeBookletFiles(out);
}

function coerceFileUrl(u) {
  const s = String(u || '').trim();
  if (!s || s === 'null' || s === 'undefined') return '';
  if (s.startsWith('//')) return `https:${s}`;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/')) return s;
  // Edesis CDN: uzantısız UUID (rehber: denemeUrl çoğu zaman .pdf’siz)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.pdf)?$/i.test(s)) {
    return `/files/${s}`;
  }
  if (/\.pdf(\?|$)/i.test(s) || /^(files|uploads|cdn|storage|file)\//i.test(s)) {
    return `/${s.replace(/^\/+/, '')}`;
  }
  if (/^[a-z0-9][a-z0-9_./%-]*\.(pdf|bin)(\?|$)/i.test(s)) {
    return `/${s.replace(/^\/+/, '')}`;
  }
  return '';
}

export function looksLikePdfBuffer(buf) {
  if (!buf || buf.length < 5) return false;
  const head = Buffer.isBuffer(buf) ? buf.subarray(0, 8).toString('latin1') : String(buf).slice(0, 8);
  return head.includes('%PDF-');
}

/** LGS sözel/sayısal, YKS tek kitapçık — sanal optik UI */
export function detectEdesisExamFamily(title, examType) {
  const t = foldTrAscii(`${title || ''} ${examType || ''}`);
  if (/\blgs\b/.test(t) || /ortaokul/.test(t)) return 'lgs';
  if (/\byos\b/.test(t)) return 'yos';
  if (/\bayt\b/.test(t)) return 'ayt';
  if (/\btyt\b|\byks\b/.test(t)) return 'yks';
  if (/(?:^|[\s.])(7|8)(?:\.|\s|$)/.test(t) || /\b(7|8)\s*\.?\s*sinif\b/.test(t)) return 'lgs';
  if (/(?:^|[\s.])(9|10|11|12)(?:\.|\s|$)/.test(t) || /\bmezun\b/.test(t)) return 'yks';
  return 'generic';
}

export function edesisOpticalUi(family) {
  const f = String(family || 'generic');
  if (f === 'lgs') {
    return { bookletMode: 'dual-sozel-sayisal', choiceCount: 4, tabPrefix: 'LGS' };
  }
  if (f === 'yks' || f === 'tyt' || f === 'ayt') {
    return { bookletMode: 'single', choiceCount: 5, tabPrefix: f === 'ayt' ? 'AYT' : 'TYT' };
  }
  if (f === 'yos') {
    return { bookletMode: 'single', choiceCount: 5, tabPrefix: 'YÖS' };
  }
  return { bookletMode: 'single', choiceCount: 4, tabPrefix: '' };
}

export function pickEdesisBookletLessons(structure, kitapcikTuru) {
  const rows = Array.isArray(structure?.rows) ? structure.rows : [];
  const booklets = Array.isArray(structure?.booklets) ? structure.booklets : [];
  const want = String(kitapcikTuru || '').trim();
  const matchedRows = rows.filter((r) => String(r.kitapcikTuru || '') === want);
  if (matchedRows.length) return matchedRows;
  const matchedBook = booklets.find((b) => String(b.kitapcikTuru || '') === want);
  if (matchedBook?.lessons?.length) return matchedBook.lessons;
  if (booklets[0]?.lessons?.length) return booklets[0].lessons;
  return rows;
}

function pickExamMetaFromJson(json) {
  if (!json || typeof json !== 'object') return {};
  const src =
    json.result && typeof json.result === 'object' && !Array.isArray(json.result)
      ? { ...json, ...json.result }
      : json;
  const title = pickStr(src, ['name', 'examName', 'title', 'examTitle', 'sinavAdi']);
  const examType = pickStr(src, ['examType', 'sinavTuru', 'type']);
  const remainingSeconds = Number(src.kalanSaniye || src.remainingSeconds || src.sinavSuresi || 0);
  return {
    title,
    examType,
    remainingSeconds: Number.isFinite(remainingSeconds) && remainingSeconds > 0 ? remainingSeconds : 0
  };
}

function looksLikePdfUrl(u) {
  const s = String(u || '').toLowerCase();
  return (
    /^(https?:)?\/\//.test(s) &&
    (s.includes('.pdf') ||
      s.includes('/pdf') ||
      s.includes('booklet') ||
      s.includes('kitapcik') ||
      s.includes('blob.core.windows.net') ||
      s.includes('cdn.') ||
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(s))
  );
}

function looksLikeBookletFile({ url, mime, name, kitapcikTuru }) {
  if (mime.includes('pdf')) return true;
  const n = String(name || '').toLowerCase();
  if (n.includes('.pdf') || n.includes('kitapcik') || n.includes('booklet')) return true;
  if (kitapcikTuru && coerceFileUrl(url)) return true;
  return looksLikePdfUrl(url);
}

export function resolveEdesisFileUrl(fileUrl, cfg = {}) {
  const s = coerceFileUrl(fileUrl);
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  const bases = [
    String(cfg.baseUrl || getEdesisConfig().baseUrl || '').replace(/\/+$/, ''),
    String(process.env.EDESIS_FILE_BASE_URL || '').replace(/\/+$/, ''),
    String(process.env.EDESIS_CDN_BASE_URL || '').replace(/\/+$/, '')
  ].filter(Boolean);
  const path = s.startsWith('/') ? s : `/${s}`;
  if (!bases.length) return path;
  // API host + /files/{uuid} — Edesis çoğu zaman aynı domain üzerinden verir
  return `${bases[0]}${path}`;
}

function dedupeBookletFiles(files) {
  const seen = new Set();
  const out = [];
  for (const f of files || []) {
    const key = `${String(f.kitapcikTuru || '').toUpperCase()}|${f.url}`;
    if (!f.url || seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

export function pickEdesisBookletFile(files, kitapcikTuru) {
  const list = Array.isArray(files) ? files : [];
  const want = String(kitapcikTuru || '').trim().toUpperCase();
  if (want) {
    const hit = list.find((f) => String(f.kitapcikTuru || '').trim().toUpperCase() === want);
    if (hit) return hit;
    const loose = list.find((f) => String(f.name || '').toUpperCase().includes(want));
    if (loose) return loose;
  }
  return list[0] || null;
}

/** Sonuç satırı bu Edesis öğrencisine mi ait (API StudentId’yi yok sayarsa yedek süzgeç) */
export function resultRowBelongsToStudent(row, edesisStudentId) {
  const sid = normEdesisId(edesisStudentId);
  if (!sid) return false;
  const rowSid = pickStr(flattenEdesisRow(row), ['studentId', 'ogrenciId', 'ogrenci_id']);
  if (!rowSid) return true;
  return normEdesisId(rowSid) === sid;
}

/** Sonuç satırında gerçek değerlendirme var mı — atama kaydı tek başına tekrar giriş sayılmaz */
export function edesisResultLooksSubmitted(row) {
  if (!row || typeof row !== 'object') return false;
  const src = flattenEdesisRow(row);
  const scoreKeys = [
    'score',
    'toplamNet',
    'totalNet',
    'net',
    'genelNet',
    'correctCount',
    'wrongCount',
    'emptyCount',
    'correct',
    'wrong',
    'blank',
    'dogru',
    'yanlis',
    'bos'
  ];
  if (scoreKeys.some((k) => src[k] != null && String(src[k]).trim() !== '')) return true;
  const status = String(src.resultStatus || src.status || src.evaluationStatus || '').toLowerCase();
  return ['ready', 'completed', 'evaluated', 'published', 'success'].includes(status);
}

export function formatEdesisAvailableExamItem(examId, catalog, resultRow, meta = {}) {
  const submitted = edesisResultLooksSubmitted(resultRow);
  const draft = resultRow
    ? mapEdesisRowToExamDraft(resultRow, {
        studentId: meta.studentId || 'edesis-student',
        institutionId: meta.institutionId || null
      })
    : null;
  const name =
    (catalog && (catalog.name || catalog.examName || catalog.title)) ||
    draft?.examTitle ||
    (resultRow && (resultRow.examName || resultRow.sinavAdi || resultRow.name)) ||
    'Deneme';
  return {
    examId: String(examId),
    name,
    examDate: (catalog && (catalog.examDate || catalog.date)) || draft?.examDate || null,
    examType: (catalog && (catalog.examType || catalog.sinavTuru)) || draft?.examType || null,
    totalQuestions: catalog?.totalQuestions ?? null,
    studentCount: catalog?.studentCount ?? null,
    resultStatus: String((catalog && catalog.resultStatus) || (submitted ? 'Ready' : 'None')),
    hasStudentResult: submitted,
    studentNet: submitted ? draft?.totalNet ?? null : null,
    canTake: Boolean(examId) && !submitted,
    bookletPdfs: catalog ? collectEdesisBookletFiles(catalog) : []
  };
}

/**
 * Öğrenciye gösterilecek denemeler:
 * 1) GET /exams/results?StudentId= satırları (girilmiş / Edesis sonuç kaydı)
 * 2) Henüz sonuç yoksa: açık (None/Processing) katalog denemeleri —
 *    yalnızca öğrenci/şube ataması veya GET /exams?StudentId= süzülmüş liste.
 * Tarih recency ile kurum kataloğu dökülmez.
 */
export function buildStudentAvailableEdesisExamItems({
  catalogRows = [],
  resultRows = [],
  assignedCatalogRows = null,
  edesisStudentId,
  programKeys = new Set(),
  classroomId = '',
  studentId,
  institutionId,
  now = new Date()
} = {}) {
  const catalogById = new Map();
  for (const ex of catalogRows || []) {
    const id = pickEdesisCatalogExamId(ex);
    if (id) catalogById.set(id, ex);
  }
  for (const ex of assignedCatalogRows || []) {
    const id = pickEdesisCatalogExamId(ex);
    if (id && !catalogById.has(id)) catalogById.set(id, ex);
  }

  const resultByExam = new Map();
  for (const row of resultRows || []) {
    if (edesisStudentId && !resultRowBelongsToStudent(row, edesisStudentId)) continue;
    const examId = pickEdesisResultExamId(row);
    if (examId && !resultByExam.has(examId)) resultByExam.set(examId, row);
  }

  const items = [];
  const seen = new Set();
  const push = (examId, catalog, resultRow) => {
    if (!examId || seen.has(examId)) return;
    seen.add(examId);
    items.push(
      formatEdesisAvailableExamItem(examId, catalog, resultRow, {
        studentId,
        institutionId
      })
    );
  };

  for (const [examId, resultRow] of resultByExam) {
    push(examId, catalogById.get(examId) || null, resultRow);
  }

  const keys = programKeys instanceof Set ? programKeys : new Set(programKeys || []);
  const assignedOnly = Array.isArray(assignedCatalogRows);
  const offerRows = assignedOnly ? assignedCatalogRows : catalogRows || [];
  const scope = {
    edesisStudentId,
    classroomId,
    programKeys: keys,
    assignedCatalogOnly: assignedOnly
  };
  for (const ex of offerRows) {
    const examId = pickEdesisCatalogExamId(ex);
    if (!examId || seen.has(examId)) continue;
    if (!shouldOfferUntakenCatalogExam(ex, scope, now)) continue;
    push(examId, catalogById.get(examId) || ex, null);
  }

  items.sort((a, b) => String(b.examDate || '').localeCompare(String(a.examDate || '')));
  return filterEdesisExamsForStudentProgram(items, keys);
}

function looksLikeSubjectRow(s) {
  if (!s || typeof s !== 'object') return false;
  const name = pickStr(s, [
    'dersAdi',
    'name',
    'subject',
    'ders',
    'lessonName',
    'branchName',
    'bransAdi',
    'lesson',
    'branch'
  ]);
  const hasCounts =
    s.net != null ||
    s.Net != null ||
    s.correct != null ||
    s.dogru != null ||
    s.dogruSayisi != null ||
    s.wrong != null ||
    s.yanlis != null ||
    s.yanlisSayisi != null ||
    s.blank != null ||
    s.bos != null ||
    s.bosSayisi != null ||
    s.emptyCount != null;
  return Boolean(name || hasCounts);
}

function deepCollectSubjectLikeObjects(obj, depth = 0) {
  if (depth > 7 || obj == null) return [];
  if (Array.isArray(obj)) {
    if (obj.length && looksLikeSubjectRow(obj[0])) return obj;
    for (const item of obj) {
      const found = deepCollectSubjectLikeObjects(item, depth + 1);
      if (found.length) return found;
    }
    return [];
  }
  if (typeof obj === 'object') {
    for (const v of Object.values(obj)) {
      if (Array.isArray(v) && v.length && looksLikeSubjectRow(v[0])) return v;
    }
    for (const v of Object.values(obj)) {
      const found = deepCollectSubjectLikeObjects(v, depth + 1);
      if (found.length) return found;
    }
  }
  return [];
}

/** Edesis satırından ders listesi — iç içe alanları da tarar */
export function extractSubjectsFromEdesisRow(row) {
  const source = flattenEdesisRow(row);
  const directKeys = [
    'dersler',
    'subjects',
    'branches',
    'lessonResults',
    'dersSonuclari',
    'subjectResults',
    'examSubjectResults',
    'sinavSonucDersler',
    'ogrenciSinavSonucDersleri',
    'detayliSonuclar',
    'detaySonuclar',
    'lessons',
    'lessonDetails',
    'bransSonuclari',
    'examBranches',
    'branchResults'
  ];
  for (const key of directKeys) {
    const arr = source?.[key];
    if (Array.isArray(arr) && arr.length && looksLikeSubjectRow(arr[0])) return arr;
  }
  for (const wrap of [
    'result',
    'sinavSonucu',
    'data',
    'details',
    'ogrenciSinavSonucu',
    'examResult',
    'studentResult',
    'report',
    'reportData'
  ]) {
    const nested = source?.[wrap];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const inner = extractSubjectsFromEdesisRow(nested);
      if (inner.length) return inner;
    }
  }
  return deepCollectSubjectLikeObjects(source);
}

export function rowSubjectDetailScore(row) {
  const subs = extractSubjectsFromEdesisRow(row).map(mapSubjectEntry);
  let score = subs.length;
  for (const s of subs) score += (s.topics?.length ?? 0) * 3;
  if (score <= 1 && subs[0]) {
    const s0 = subs[0];
    if (s0.correct + s0.wrong + s0.blank > 0) score += 1;
  }
  return score;
}

function mergeEdesisResultRows(primary, secondary) {
  if (!secondary) return primary;
  let merged =
    rowSubjectDetailScore(secondary) > rowSubjectDetailScore(primary)
      ? { ...primary, ...secondary }
      : { ...secondary, ...primary };
  if (subjectTopicCount(secondary) > subjectTopicCount(merged)) {
    merged = { ...merged, ...secondary };
    for (const key of SUBJECT_ARRAY_KEYS) {
      if (Array.isArray(secondary[key]) && secondary[key].length) merged[key] = secondary[key];
    }
  }
  return merged;
}

function edesisResultKey(row) {
  const flat = flattenEdesisRow(row);
  const examId = pickStr(flat, ['examId', 'sinavId', 'sinav_id']);
  const studentId = pickStr(flat, ['studentId', 'ogrenciId', 'ogrenci_id']);
  if (!examId || !studentId) return null;
  return `${normEdesisId(examId)}:${normEdesisId(studentId)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Toplu sonuçta ders/konu yoksa PDF rehber adım 4: GET /exams/results?StudentId=
 * ve GET /analytics/reports/student/{id} ile zenginleştir.
 */
export async function enrichEdesisRowsWithSubjectDetails(rows, cfgOverride = {}, options = {}) {
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  const maxStudents = Number(process.env.EDESIS_ENRICH_MAX_STUDENTS || options.maxStudents || 80);
  const dateRange = defaultDateRangeQuery();

  const byKey = new Map();
  for (const row of rows) {
    const key = edesisResultKey(row);
    if (!key) continue;
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeEdesisResultRows(existing, row) : row);
  }
  if (!byKey.size) return { rows, enrichedCount: 0, studentQueries: 0, analyticsQueries: 0 };

  const needsEnrich = [...byKey.values()].filter((r) => needsTopicEnrichment(r));
  const studentIds = [
    ...new Set(
      needsEnrich
        .map((r) => pickStr(flattenEdesisRow(r), ['studentId', 'ogrenciId', 'ogrenci_id']))
        .filter(Boolean)
        .map(normEdesisId)
    )
  ].slice(0, maxStudents);

  let enrichedCount = 0;
  let studentQueries = 0;
  let analyticsQueries = 0;

  for (const sid of studentIds) {
    studentQueries += 1;
    let detailRows = [];
    for (const param of [{ StudentId: sid }, { studentId: sid }]) {
      const page = await fetchAllPaged(cfg, V1_PATHS.examResults, {
        ...dateRange,
        ...EXAM_DETAIL_QUERY,
        ...param
      });
      if (page.rows?.length) {
        detailRows = page.rows;
        break;
      }
    }
    for (const detailRow of detailRows) {
      const key = findEnrichmentKeyForDetailRow(byKey, detailRow);
      if (!key) continue;
      const before = rowSubjectDetailScore(byKey.get(key));
      const merged = mergeEdesisResultRows(byKey.get(key), detailRow);
      if (rowSubjectDetailScore(merged) > before || subjectTopicCount(merged) > subjectTopicCount(byKey.get(key))) {
        byKey.set(key, merged);
        enrichedCount += 1;
      }
    }
    await sleep(120);
  }

  // Hâlâ konu kırılımı yok → analytics/reports/student/{id}
  const stillPoor = [...byKey.values()].filter((r) => needsTopicEnrichment(r));
  const analyticsStudentIds = [
    ...new Set(
      stillPoor
        .map((r) => pickStr(flattenEdesisRow(r), ['studentId', 'ogrenciId', 'ogrenci_id']))
        .filter(Boolean)
        .map(normEdesisId)
    )
  ].slice(0, Math.min(25, maxStudents));

  for (const sid of analyticsStudentIds) {
    analyticsQueries += 1;
    const r = await fetchEdesisJson(cfg, V1_PATHS.analyticsStudent(sid));
    if (!isReachableEdesisResponse(r)) {
      await sleep(120);
      continue;
    }
    const analyticsRows = unwrapList(r.json);
    const candidates = analyticsRows.length ? analyticsRows : [r.json];
    for (const item of candidates) {
      if (!item || typeof item !== 'object') continue;
      const examId = pickStr(item, ['examId', 'sinavId', 'sinav_id', 'exam_id']);
      const key = examId ? `${normEdesisId(examId)}:${normEdesisId(sid)}` : null;
      if (key && byKey.has(key)) {
        const before = rowSubjectDetailScore(byKey.get(key));
        const merged = mergeEdesisResultRows(byKey.get(key), { ...item, studentId: sid });
        if (rowSubjectDetailScore(merged) > before || subjectTopicCount(merged) > subjectTopicCount(byKey.get(key))) {
          byKey.set(key, merged);
          enrichedCount += 1;
        }
        continue;
      }
      // analytics listesi examId içermeyebilir — tüm eşleşen öğrenci satırlarına konu ekle
      for (const [k, base] of byKey.entries()) {
        if (!k.endsWith(`:${normEdesisId(sid)}`)) continue;
        const before = rowSubjectDetailScore(base);
        const merged = mergeEdesisResultRows(base, { ...item, studentId: sid });
        if (rowSubjectDetailScore(merged) > before || subjectTopicCount(merged) > subjectTopicCount(base)) {
          byKey.set(k, merged);
          enrichedCount += 1;
        }
      }
    }
    await sleep(120);
  }

  const mergedList = rows.map((row) => {
    const key = edesisResultKey(row);
    return key && byKey.has(key) ? byKey.get(key) : row;
  });
  const extras = [...byKey.values()].filter((r) => !mergedList.some((m) => edesisResultKey(m) === edesisResultKey(r)));
  return {
    rows: [...mergedList, ...extras],
    enrichedCount,
    studentQueries,
    analyticsQueries
  };
}

export async function fetchEdesisDefaultTermId(cfgOverride = {}) {
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  const r = await fetchEdesisJson(cfg, V1_PATHS.terms);
  if (!isReachableEdesisResponse(r)) return null;
  const terms = unwrapList(r.json);
  const def = terms.find((t) => t?.isDefault === true) || terms[0];
  return def?.id ?? def?.termId ?? null;
}

function extractReportUrl(json) {
  if (!json || typeof json !== 'object') return null;
  const direct = pickStr(json, [
    'reportUrl',
    'pdfUrl',
    'downloadUrl',
    'url',
    'signedUrl',
    'pdfSignedUrl',
    'fileUrl'
  ]);
  if (direct && /^https?:\/\//i.test(direct)) return direct;
  if (direct && direct.startsWith('//')) return `https:${direct}`;
  if (Array.isArray(json.items)) {
    for (const it of json.items) {
      const u = extractReportUrl(it);
      if (u) return u;
    }
  }
  if (json.result && typeof json.result === 'object') {
    const u = extractReportUrl(json.result);
    if (u) return u;
  }
  if (Array.isArray(json.reports)) {
    for (const it of json.reports) {
      const u = pickStr(it, ['reportUrl', 'url', 'pdfUrl', 'downloadUrl']);
      if (u && /^https?:\/\//i.test(u)) return u;
    }
  }
  return null;
}

function extractJobId(json) {
  if (!json || typeof json !== 'object') return null;
  return (
    pickStr(json, ['jobId', 'reportJobId']) ||
    pickStr(json.result || {}, ['jobId', 'reportJobId']) ||
    null
  );
}

export async function pollEdesisReportJob(cfg, jobId, { maxAttempts = 30, delayMs = 2000 } = {}) {
  const jid = String(jobId || '').trim();
  if (!jid) throw new Error('report_job_id_missing');

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const r = await fetchEdesisJson(cfg, V1_PATHS.reportJobStatus(jid));
    const payload = r.json && typeof r.json === 'object' ? r.json : {};
    const reportUrl = extractReportUrl(payload);
    const status = String(payload.status || payload.state || '').trim();

    if (reportUrl) {
      return { ...payload, status: status || 'Completed', reportUrl, jobId: jid };
    }
    if (['Failed', 'Error', 'Cancelled', 'Canceled'].includes(status)) {
      throw new Error(payload.message || payload.error || 'report_job_failed');
    }
    if (status === 'Completed' && !reportUrl) {
      throw new Error(payload.message || 'report_completed_without_url');
    }
    if (!r.ok && r.status !== 202 && r.status !== 404) {
      throw new Error(payload.error || payload.message || `job_status_${r.status}`);
    }
    await sleep(delayMs);
  }
  throw new Error('report_job_timeout');
}

/** POST /reports/exam-report — Edesis PDF karne (async job destekli) */
export async function generateEdesisExamReport(
  { examId, termId, studentIds, reportCodes = [102], forceNew = false },
  cfgOverride = {}
) {
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };

  let resolvedTermId = termId;
  if (resolvedTermId == null) resolvedTermId = await fetchEdesisDefaultTermId(localCfg);
  if (resolvedTermId == null) throw new Error('term_id_missing');

  const body = {
    examId: Number(examId) || examId,
    termId: Number(resolvedTermId) || resolvedTermId,
    studentIds: (studentIds || []).map((id) => Number(id) || id),
    reportCodes,
    forceNew: Boolean(forceNew)
  };

  const r = await fetchEdesisJson(localCfg, V1_PATHS.examReport, { method: 'POST', body });
  if (!r.ok) {
    throw new Error(r.json?.error || r.json?.message || `exam_report_${r.status}`);
  }

  let payload = r.json && typeof r.json === 'object' ? r.json : {};
  let reportUrl = extractReportUrl(payload);
  let jobId = extractJobId(payload);
  let status = String(payload.status || payload.state || '').trim();

  if (!reportUrl && jobId) {
    payload = await pollEdesisReportJob(localCfg, jobId);
    reportUrl = extractReportUrl(payload);
    status = String(payload.status || 'Completed');
    jobId = extractJobId(payload) || jobId;
  } else if (
    !reportUrl &&
    ['Pending', 'Processing', 'Queued', 'InProgress', 'Running'].includes(status) &&
    jobId
  ) {
    payload = await pollEdesisReportJob(localCfg, jobId);
    reportUrl = extractReportUrl(payload);
    status = String(payload.status || 'Completed');
  }

  return {
    status: reportUrl ? status || 'Completed' : status || 'Unknown',
    reportUrl: reportUrl || null,
    jobId: jobId || null,
    pollUrl: pickStr(payload, ['pollUrl']) || null,
    message: payload.message || (reportUrl ? 'Rapor hazır.' : 'reportUrl bulunamadı — admin paketi ve termId kontrol edin'),
    termId: resolvedTermId,
    raw: payload
  };
}

function flattenHataKarnesiCandidate(item) {
  if (!item || typeof item !== 'object') return item || {};
  const nested = item.ogrenciAnalizRapor;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return { ...item, ...nested };
  }
  return item;
}

function hataKarnesiHaystack(item) {
  const row = flattenHataKarnesiCandidate(item);
  return foldTrAscii(
    [
      row.reportType,
      row.raporTuru,
      row.fileName,
      row.analysisName,
      row.analizAdi,
      row.name,
      row.title,
      row.reportName,
      row.hataKarnesiAdi
    ]
      .filter((v) => v != null && String(v).trim())
      .join(' ')
  );
}

/** Hata kitapçığı (soru bankası derlemesi) — öğrenci hata karnesi PDF’si değildir */
export function isEdesisHataKitapcigiReport(item) {
  const blob = hataKarnesiHaystack(item);
  if (/hata.?kitapcig/.test(blob)) return true;
  if (/kitapcig/.test(blob) && !/hata.?karn/.test(blob)) return true;
  return false;
}

/**
 * Edesis hata karnesi = boş + yanlış soruların PDF’i.
 * Karne (102) ve hata kitapçığı hariç.
 */
export function isEdesisHataKarnesiReport(item) {
  if (!item || typeof item !== 'object') return false;
  if (isEdesisHataKitapcigiReport(item)) return false;
  const row = flattenHataKarnesiCandidate(item);
  if (row.isHataKarnesi === true || row.IsHataKarnesi === true) return true;
  const raporTuru = row.raporTuru ?? row.reportType ?? row.RaporTuru;
  const typeFold = foldTrAscii(String(raporTuru ?? ''));
  if (typeFold === 'hatakarnesi' || typeFold === 'hata_karnesi' || typeFold === 'hata-karnesi') return true;
  if ((raporTuru === 1 || raporTuru === '1') && ('isHataKarnesi' in row || row.ogrenciAnalizRapor || item.ogrenciAnalizRapor)) {
    return true;
  }
  const blob = hataKarnesiHaystack(row);
  if (/oncelikli.?konu|sinif.?analiz|kurum.?analiz|cevap.?anahtar/.test(blob)) return false;
  return /hata.?karn|hatakarnesi|bosvehatali|bos.?ve.?hatali|hatali.?soru|yanlis.?ve.?bos/.test(blob);
}

export function pickEdesisHataKarnesiReport(items, { examId, edesisStudentId } = {}) {
  const list = (Array.isArray(items) ? items : []).filter(isEdesisHataKarnesiReport);
  if (!list.length) return null;
  const exam = String(examId || '').trim();
  const sid = String(edesisStudentId || '').trim();
  const matchesExam = (it) => {
    const row = flattenHataKarnesiCandidate(it);
    const id = pickStr(row, ['examId', 'sinavId', 'sinav_id', 'exam_id']);
    return exam && id && String(id) === exam;
  };
  const matchesStudent = (it) => {
    if (!sid) return true;
    const row = flattenHataKarnesiCandidate(it);
    const id = pickStr(row, ['studentId', 'ogrenciId', 'ogrenci_id']);
    return !id || String(id) === sid;
  };
  const scoped = list.filter(matchesStudent);
  const pool = scoped.length ? scoped : list;
  const byExam = exam ? pool.filter(matchesExam) : [];
  const chosen = byExam.length ? byExam : pool;
  const sorted = chosen.slice().sort((a, b) => {
    const ta = Date.parse(flattenHataKarnesiCandidate(a).creationTime || a.tamamlanmaZamani || a.createdAt || a.processedTime || 0) || 0;
    const tb = Date.parse(flattenHataKarnesiCandidate(b).creationTime || b.tamamlanmaZamani || b.createdAt || b.processedTime || 0) || 0;
    return tb - ta;
  });
  return sorted[0] || null;
}

function collectEdesisAnalysisIds(items) {
  const ids = [];
  for (const it of items || []) {
    const row = flattenHataKarnesiCandidate(it);
    const id = pickStr(row, ['analysisId', 'analizId', 'AnalizId']);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function unwrapAbpPayload(json) {
  if (!json || typeof json !== 'object') return json;
  if (json.result && typeof json.result === 'object') return json.result;
  return json;
}

function fileDtoFromJson(json) {
  const payload = unwrapAbpPayload(json);
  if (!payload || typeof payload !== 'object') return null;
  const fileName = pickStr(payload, ['fileName', 'FileName']);
  const fileToken = pickStr(payload, ['fileToken', 'FileToken', 'token']);
  const fileType = pickStr(payload, ['fileType', 'FileType']) || 'application/pdf';
  if (!fileToken) return null;
  return { fileName: fileName || 'hata-karnesi.pdf', fileToken, fileType };
}

async function tryDownloadEdesisFileDto(cfg, dto) {
  if (!dto?.fileToken) return null;
  const fileName = encodeURIComponent(dto.fileName || 'hata-karnesi.pdf');
  const token = encodeURIComponent(dto.fileToken);
  const fileType = encodeURIComponent(dto.fileType || 'application/pdf');
  const paths = [
    `/File/DownloadTempFile?fileToken=${token}&fileName=${fileName}&fileType=${fileType}`,
    `/api/File/DownloadTempFile?fileToken=${token}&fileName=${fileName}&fileType=${fileType}`,
    `/File/DownloadBinaryFile?fileToken=${token}`
  ];
  for (const path of paths) {
    try {
      const url = joinUrl(cfg.baseUrl, path);
      const got = await fetchEdesisUrlBuffer(url, cfg);
      if (got.ok && got.looksPdf) {
        return {
          ok: true,
          reportUrl: got.url,
          buf: got.buf,
          looksPdf: true,
          fileName: dto.fileName,
          source: 'file-dto'
        };
      }
    } catch {
      /* sonraki aday */
    }
  }
  return null;
}

async function tryGenerateEdesisHataKarnesiPdf(cfg, { edesisStudentId, analysisIds }) {
  const sid = String(edesisStudentId || '').trim();
  const ids = [...new Set((analysisIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  let abpReachable = true;

  try {
    const r = await fetchEdesisJson(
      cfg,
      `/api/services/app/OgrenciAnalizRapor/GetAnalizByOgrenciId?ogrenciId=${encodeURIComponent(sid)}`
    );
    if (r.status === 401 || r.status === 403) abpReachable = false;
    if (isReachableEdesisResponse(r)) {
      const items = unwrapList(r.json);
      const hataItems = items.filter(isEdesisHataKarnesiReport);
      for (const it of hataItems) {
        const row = flattenHataKarnesiCandidate(it);
        const url = extractReportUrl(row);
        if (url) {
          return { ok: true, reportUrl: url, buf: null, looksPdf: false, source: 'ogrenci-analiz-rapor', fileName: row.fileName || 'hata-karnesi.pdf' };
        }
        const dto = fileDtoFromJson(row) || (row.token ? { fileName: row.fileName || 'hata-karnesi.pdf', fileToken: row.token, fileType: 'application/pdf' } : null);
        const downloaded = dto ? await tryDownloadEdesisFileDto(cfg, dto) : null;
        if (downloaded) return { ...downloaded, source: 'ogrenci-analiz-rapor' };
        const hid = pickStr(row, ['analysisId', 'analizId', 'AnalizId']);
        if (hid) {
          const at = ids.indexOf(hid);
          if (at >= 0) ids.splice(at, 1);
          ids.unshift(hid);
        }
      }
      for (const it of items) {
        const id = pickStr(flattenHataKarnesiCandidate(it), ['analysisId', 'analizId', 'AnalizId']);
        if (id && !ids.includes(id)) ids.push(id);
      }
    }
  } catch {
    /* ABP uçları X-API-Key ile 401 olabilir */
  }

  if (!abpReachable) {
    return { ok: false, reportUrl: null, buf: null, looksPdf: false, source: null };
  }

  for (const analizId of ids.slice(0, 2)) {
    const qs = new URLSearchParams({
      AnalizId: String(analizId),
      OgrenciId: sid,
      IsHataKarnesi: 'true',
      SoruTuru: '3',
      RaporTuru: '3'
    });
    try {
      const r = await fetchEdesisJson(cfg, `/api/services/app/Analizs/GetAlnalizOlustur?${qs.toString()}`, {
        timeoutMs: 55000
      });
      if (!isReachableEdesisResponse(r) && !fileDtoFromJson(r.json)) continue;
      const dto = fileDtoFromJson(r.json);
      if (!dto) continue;
      const downloaded = await tryDownloadEdesisFileDto(cfg, dto);
      if (downloaded) {
        return { ...downloaded, source: 'analiz-olustur', analysisId: analizId };
      }
    } catch {
      /* sonraki analiz */
    }
  }
  return { ok: false, reportUrl: null, buf: null, looksPdf: false, source: null };
}

/**
 * Öğrenci hata karnesi PDF — boş ve yanlış sorular (hata kitapçığı / karne 102 değil).
 */
export async function loadEdesisHataKarnesiPdf({ examId, edesisStudentId }, cfgOverride = {}) {
  const sid = String(edesisStudentId || '').trim();
  const exam = String(examId || '').trim();
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (!sid) throw new Error('edesis_student_id_missing');
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };

  const reports = [];
  const analytics = await fetchEdesisJson(localCfg, V1_PATHS.analyticsStudent(sid));
  if (isReachableEdesisResponse(analytics)) {
    reports.push(...unwrapList(analytics.json));
  }

  const picked = pickEdesisHataKarnesiReport(reports, { examId: exam, edesisStudentId: sid });
  let reportUrl = picked ? extractReportUrl(flattenHataKarnesiCandidate(picked)) : null;
  let source = picked && reportUrl ? 'analytics' : null;
  let buf = null;
  let fileName = picked ? pickStr(flattenHataKarnesiCandidate(picked), ['fileName', 'analysisName', 'analizAdi']) : '';

  if (reportUrl) {
    try {
      const got = await fetchEdesisUrlBuffer(reportUrl, localCfg);
      if (got.ok && got.looksPdf) {
        buf = got.buf;
        reportUrl = got.url || reportUrl;
      }
    } catch {
      /* imzalı URL tarayıcıda açılabilir */
    }
  }

  if (!buf) {
    const analysisIds = collectEdesisAnalysisIds(picked ? [picked, ...reports] : reports);
    const generated = await tryGenerateEdesisHataKarnesiPdf(localCfg, {
      edesisStudentId: sid,
      analysisIds
    });
    if (generated.buf || generated.reportUrl) {
      return {
        ok: true,
        reportUrl: generated.reportUrl || reportUrl,
        buf: generated.buf || buf,
        looksPdf: Boolean(generated.buf && looksLikePdfBuffer(generated.buf)),
        source: generated.source || source,
        fileName: generated.fileName || fileName || 'hata-karnesi.pdf',
        analysisId: generated.analysisId || picked?.analysisId || null,
        reportType: picked?.reportType || picked?.raporTuru || 'HataKarnesi',
        message: 'Hata karnesi PDF hazır'
      };
    }
  }

  const ok = Boolean(reportUrl || (buf && looksLikePdfBuffer(buf)));
  return {
    ok,
    reportUrl: reportUrl || null,
    buf,
    looksPdf: Boolean(buf && looksLikePdfBuffer(buf)),
    source,
    fileName: fileName || 'hata-karnesi.pdf',
    analysisId: picked?.analysisId || picked?.analizId || null,
    reportType: picked?.reportType || picked?.raporTuru || null,
    message: ok
      ? 'Hata karnesi PDF hazır'
      : 'Edesis hata karnesi PDF bulunamadı (hata kitapçığı değil; boş ve yanlış soru karnesi). Analiz Edesis’te üretilmiş olmalı.',
    hint: ok
      ? null
      : 'Edesis panelinde öğrencinin hata karnesini oluşturun. Bu, hata kitapçığı değildir.'
  };
}

function mapTopicEntry(t) {
  return {
    name: pickStr(t, ['konuAdi', 'name', 'topic', 'konu', 'unitName', 'kazanimAdi']) || 'Konu',
    net: num(t.net ?? t.Net ?? t.toplamNet),
    correct: num(t.correct ?? t.dogru ?? t.dogruSayisi),
    wrong: num(t.wrong ?? t.yanlis ?? t.yanlisSayisi),
    blank: num(t.blank ?? t.bos ?? t.bosSayisi)
  };
}

function mapSubjectEntry(s) {
  const name =
    pickStr(s, ['dersAdi', 'name', 'subject', 'ders', 'lessonName', 'branchName', 'bransAdi']) || 'Genel';
  const rawTopics =
    s.konular ||
    s.topics ||
    s.konuDetaylari ||
    s.konuDetaylariList ||
    s.units ||
    s.kazanimlar ||
    s.topicResults ||
    s.konuSonuclari ||
    s.uniteSonuclari ||
    s.kazanimSonuclari;
  let topics;
  if (Array.isArray(rawTopics) && rawTopics.length) {
    topics = rawTopics.map(mapTopicEntry).filter((t) => t.name);
  }
  return {
    name,
    net: num(s.net ?? s.Net ?? s.toplamNet ?? s.genelNet),
    correct: num(s.correct ?? s.dogru ?? s.dogruSayisi),
    wrong: num(s.wrong ?? s.yanlis ?? s.yanlisSayisi),
    blank: num(s.blank ?? s.bos ?? s.bosSayisi),
    topics: topics?.length ? topics : undefined
  };
}

/** v1 + legacy JSON import alanları */
export function mapEdesisRowToExamDraft(row, { studentId, institutionId }) {
  const source = flattenEdesisRow(row);
  const examId = pickStr(source, ['examId', 'sinavId', 'sinav_id']);
  const examName = pickStr(source, ['examName', 'sinavAdi', 'sinav_adi', 'name', 'title']) || 'TYT';
  const rawDate =
    pickStr(source, ['examDate', 'sinavTarihi', 'sinav_tarihi', 'date', 'tarih']) ||
    new Date().toISOString();
  const examDate = rawDate.slice(0, 10);

  const correct = num(source.correctCount ?? source.correct ?? source.dogru);
  const wrong = num(source.wrongCount ?? source.wrong ?? source.yanlis);
  const blank = num(source.emptyCount ?? source.blank ?? source.bos);
  const totalNet = num(
    source.score ?? source.toplamNet ?? source.totalNet ?? source.net ?? source.genelNet,
    correct - wrong / 4
  );

  let subjects = extractSubjectsFromEdesisRow(source).map(mapSubjectEntry);
  if (!subjects.length) {
    const legacyKonular = source.konular;
    if (Array.isArray(legacyKonular) && legacyKonular.length && looksLikeSubjectRow(legacyKonular[0])) {
      subjects = legacyKonular.map(mapSubjectEntry);
    }
  }
  if (!subjects.length && (correct + wrong + blank > 0 || totalNet !== 0)) {
    subjects = [{ name: examName, net: totalNet, correct, wrong, blank }];
  }

  const examType = normalizeExamType(
    pickStr(source, ['examType', 'sinavTuru', 'tur', 'tip']) || examName
  );

  const id = examId
    ? `edesis-${examId}-${studentId}`
    : `edesis-${studentId}-${examDate}-${examType}`.replace(/\s+/g, '_');

  const edesisStudentId = pickStr(source, ['studentId', 'ogrenciId', 'ogrenci_id']);

  return {
    id,
    studentId,
    examType,
    examDate,
    source: 'edesis',
    totalNet,
    subjects,
    examTitle: examName !== examType ? examName : undefined,
    edesisExamId: examId || undefined,
    edesisStudentId: edesisStudentId || undefined,
    notes: `Edesis v1${examId ? ` exam #${examId}` : ''}`,
    createdAt: new Date().toISOString(),
    institutionId
  };
}

/** Tek sınav — öğrenci satırını bul (ders/konu detayı için) */
export async function fetchEdesisExamDetailForStudent(examId, edesisStudentId, cfgOverride = {}) {
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');
  if (!examId) throw new Error('examId_required');

  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };
  const sid = normEdesisId(edesisStudentId);
  const baseParams = { MaxResultCount: 1000, ...EXAM_DETAIL_QUERY };
  const queries = sid
    ? [
        buildQuery({ ...baseParams, StudentId: sid }),
        buildQuery({ ...baseParams, studentId: sid }),
        buildQuery(baseParams)
      ]
    : [buildQuery(baseParams)];

  for (const qs of queries) {
    const r = await fetchEdesisJson(localCfg, `${V1_PATHS.examResultsByExam(examId)}${qs}`);
    if (!isReachableEdesisResponse(r)) continue;
    const rows = unwrapList(r.json);
    if (!rows.length) continue;
    if (sid) {
      const match = rows.find((row) => {
        const k = studentMatchKeysFromEdesisRow(row);
        return normEdesisId(k.edesisStudentId) === sid;
      });
      if (match) return { row: match, path: V1_PATHS.examResultsByExam(examId), fetchMode: 'v1:exam-results-by-id' };
    }
    if (rows.length === 1) return { row: rows[0], path: V1_PATHS.examResultsByExam(examId), fetchMode: 'v1:exam-results-by-id' };
  }

  if (sid) {
    const dateRange = defaultDateRangeQuery();
    for (const param of [{ StudentId: sid }, { studentId: sid }]) {
      const page = await fetchAllPaged(localCfg, V1_PATHS.examResults, {
        ...dateRange,
        ...EXAM_DETAIL_QUERY,
        ...param
      });
      const match = (page.rows || []).find((row) => {
        const flat = flattenEdesisRow(row);
        const eid = pickStr(flat, ['examId', 'sinavId', 'sinav_id']);
        return examIdsMatch(eid, examId);
      });
      if (match) {
        return { row: match, path: V1_PATHS.examResults, fetchMode: 'v1:exams/results-by-student' };
      }
    }
  }

  return { row: null, path: V1_PATHS.examResultsByExam(examId), fetchMode: 'v1:exam-results-by-id' };
}

function normalizeExamType(raw) {
  const s = String(raw || '')
    .toUpperCase()
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'I');
  if (s.includes('LGS')) return 'LGS';
  if (s.includes('YOS')) return 'YOS';
  if (s.includes('AYT')) return 'AYT';
  if (s.includes('TYT')) return 'TYT';
  if (s.includes('EA')) return 'YKS-EA';
  if (s.includes('SAY')) return 'YKS-SAY';
  const m = s.match(/\b([3-7])\b/);
  if (m) return m[1];
  return 'TYT';
}

export function studentMatchKeysFromEdesisRow(row) {
  const r = row?.ogrenci && typeof row.ogrenci === 'object' ? { ...row, ...row.ogrenci } : row || {};
  const ad = pickStr(r, ['firstName', 'adi', 'ad', 'ogrenciAd']);
  const soyad = pickStr(r, ['lastName', 'soyadi', 'soyad', 'ogrenciSoyad']);
  let name = pickStr(r, ['studentName', 'ogrenciAdi', 'ogrenci_adi', 'adSoyad', 'name']);
  if (!name && (ad || soyad)) name = `${ad} ${soyad}`.trim();

  return {
    edesisStudentId: pickStr(r, ['studentId', 'ogrenciId', 'ogrenci_id', 'id']),
    email: normalizeEmail(pickStr(r, ['email', 'ePosta', 'eposta', 'mail'])),
    phone: pickStr(r, ['phone', 'telefon', 'gsm']).replace(/\D/g, ''),
    parentPhone: pickStr(r, ['parentPhone', 'veliTelefon']).replace(/\D/g, ''),
    tc: pickStr(r, ['tcNo', 'tcKimlik', 'tc']),
    schoolNo: pickStr(r, ['studentNumber', 'okulNo', 'ogrenciNo']),
    name
  };
}

/** JSON import / legacy sarmalayıcılar */
export function flattenEdesisRows(json) {
  const list = unwrapList(json);
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    out.push(item);
  }
  return out;
}

export function normalizeEmail(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[\u200b\u00a0]/g, '')
    .replace(/\s+/g, '');
}

export function normalizePersonName(s) {
  return String(s || '')
    .trim()
    .toLocaleUpperCase('tr-TR')
    .toLocaleLowerCase('tr-TR')
    .replace(/[.\-_,']/g, ' ')
    .replace(/\s+/g, ' ');
}

export function nameLookupKeys(name) {
  const n = normalizePersonName(name);
  if (!n) return [];
  const tokens = n.split(' ').filter((t) => t.length > 1);
  const keys = new Set([n]);
  if (tokens.length >= 2) {
    keys.add([...tokens].sort().join(' '));
    keys.add(`${tokens[0]} ${tokens[tokens.length - 1]}`);
    keys.add(`${tokens[tokens.length - 1]} ${tokens[0]}`);
  }
  return [...keys];
}

export function rowHasStudentFields(row) {
  const k = studentMatchKeysFromEdesisRow(row);
  return Boolean(k.name || k.email || k.edesisStudentId);
}

function countRowsWithStudents(rows) {
  return rows.filter((r) => rowHasStudentFields(r)).length;
}

/** Bağlantı testi — GET /students?MaxResultCount=1 */
export async function probeEdesisApi() {
  const cfg = getEdesisConfig();
  if (!cfg.apiKey) {
    return { ok: false, error: 'EDESIS_API_KEY_missing', attempts: [] };
  }

  const probes = [
    { path: `${V1_PATHS.students}${buildQuery({ MaxResultCount: 1 })}`, label: 'students' },
    { path: `${V1_PATHS.exams}${buildQuery({ MaxResultCount: 1 })}`, label: 'exams' },
    {
      path: `${V1_PATHS.examResults}${buildQuery({ MaxResultCount: 1, ...defaultDateRangeQuery() })}`,
      label: 'exam_results'
    }
  ];

  const attempts = [];
  let best = null;

  for (const p of probes) {
    const r = await fetchEdesisJson({ ...cfg, baseUrl: cfg.baseUrl }, p.path);
    const rows = isReachableEdesisResponse(r) ? unwrapList(r.json) : [];
    const entry = {
      baseUrl: cfg.baseUrl,
      path: p.path,
      label: p.label,
      status: r.status,
      httpOk: r.ok,
      parseOk: isReachableEdesisResponse(r),
      contentType: r.contentType,
      rawPreview: r.rawPreview,
      rowCount: rows.length,
      totalCount: r.json?.totalCount ?? null,
      apiError: r.json?.error || null
    };
    attempts.push(entry);
    if (isReachableEdesisResponse(r) && (!best || rows.length > best.rowCount)) {
      best = { ...entry, rowCount: rows.length };
    }
    if (isAuthConnectedResponse(r) && !best) {
      best = { ...entry, rowCount: rows.length, connectedOnly: true };
    }
  }

  const authFail = attempts.some((a) => a.status === 401);
  const forbidden = attempts.some((a) => a.status === 403);
  const html404 = attempts.some((a) => a.rawPreview && looksLikeHtml(a.rawPreview));

  if (!best) {
    return {
      ok: false,
      error: authFail ? 'auth_failed' : forbidden ? 'scope_forbidden' : html404 ? 'endpoint_404_html' : 'no_working_endpoint',
      hint: authFail
        ? '401: EDESIS_API_KEY geçersiz — Edesis panelden yeni key alın'
        : forbidden
          ? '403: API key scope yetersiz — exams veya student_dashboard paketi gerekli'
          : html404
            ? EDESIS_HTML404_HELP
            : 'v1 endpoint yanıt vermedi — EDESIS_API_BASE_URL domain olmalı (path olmadan)',
      attempts,
      apiVersion: 'v1'
    };
  }

  const reachable = best.parseOk !== false;
  return {
    ok: reachable,
    connected: true,
    apiVersion: 'v1',
    baseUrl: cfg.baseUrl,
    path: best.path,
    rowCount: best.rowCount ?? 0,
    hasData: (best.rowCount ?? 0) > 0,
    warning:
      !reachable
        ? EDESIS_HTML404_HELP
        : (best.rowCount ?? 0) === 0
          ? 'API v1 bağlantısı OK — sınav sonucu henüz yok veya tarih aralığında kayıt yok'
          : null,
    authMode: cfg.authMode,
    attempts
  };
}

/** Eski endpoint taraması — debug */
export async function scanEdesisEndpoints(cfg) {
  return probeEdesisApi();
}

/**
 * v1 akış: GET /exams/results (sayfalı) → gerekirse /exams + /exams/{id}/results
 */
export async function fetchEdesisExamList(cfgOverride = {}) {
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');

  const baseUrl = cfg.baseUrl || cfg.bases[0];
  const localCfg = { ...cfg, baseUrl };
  const dateRange = defaultDateRangeQuery();

  // 1) Toplu sınav sonuçları (rehber adım 4)
  const bulk = await fetchAllPaged(localCfg, V1_PATHS.examResults, { ...dateRange, ...EXAM_DETAIL_QUERY });
  if (bulk.error && bulk.response) {
    const r = bulk.response;
    if (isEdesisHtml404(r)) {
      return emptyResult(cfg, V1_PATHS.examResults, EDESIS_HTML404_HELP, r);
    }
    if (r.status === 403) {
      return emptyResult(
        cfg,
        V1_PATHS.examResults,
        '403: API key scope — exams veya student_dashboard paketi gerekli (exam_results:read)',
        r
      );
    }
  }

  let rows = bulk.rows || [];
  let fetchMode = 'v1:exams/results';
  let path = V1_PATHS.examResults;

  // 2) Boşsa: sınav listesi + sınav bazlı sonuç
  if (!rows.length) {
    const examsPage = await fetchAllPaged(localCfg, V1_PATHS.exams, {});
    const exams = examsPage.rows || [];
    if (exams.length) {
      fetchMode = 'v1:exams+results';
      path = V1_PATHS.exams;
      const merged = [];
      const limit = Math.min(exams.length, 30); // rate limit
      for (let i = 0; i < limit; i++) {
        const examId = exams[i]?.id;
        if (examId == null) continue;
        const r = await fetchEdesisJson(
          localCfg,
          `${V1_PATHS.examResultsByExam(examId)}${buildQuery({ MaxResultCount: 1000, ...EXAM_DETAIL_QUERY })}`
        );
        if (!isReachableEdesisResponse(r)) continue;
        merged.push(...unwrapList(r.json));
      }
      rows = merged;
    }
  }

  const withStudent = countRowsWithStudents(rows);

  // 3) Ders/konu detayı — öğrenci bazlı sonuç + analytics (PDF v1.2 adım 4 + 6.8)
  let enrichStats = { enrichedCount: 0, studentQueries: 0, analyticsQueries: 0 };
  if (rows.length && withStudent > 0) {
    const enriched = await enrichEdesisRowsWithSubjectDetails(rows, localCfg);
    rows = enriched.rows;
    enrichStats = enriched;
    if (enriched.enrichedCount > 0) {
      fetchMode = `${fetchMode}+student-detail`;
    }
  }

  const subjectSample = rows[0] ? mapEdesisRowToExamDraft(rows[0], { studentId: 'sample', institutionId: null }) : null;

  return {
    rows,
    baseUrl,
    path,
    fetchMode,
    httpStatus: 200,
    jsonShape: rows.length ? { type: 'array', length: rows.length } : { type: 'empty' },
    rowsWithStudentFields: withStudent,
    sampleRowKeys: rows[0] ? Object.keys(rows[0]).slice(0, 25) : [],
    sampleSubjectCount: subjectSample?.subjects?.length ?? 0,
    sampleTopicCount: (subjectSample?.subjects || []).reduce((n, s) => n + (s.topics?.length ?? 0), 0),
    enrichedCount: enrichStats.enrichedCount,
    enrichStudentQueries: enrichStats.studentQueries,
    enrichAnalyticsQueries: enrichStats.analyticsQueries,
    apiHint:
      rows.length === 0
        ? 'Edesis v1 bağlantısı OK ama sonuç yok — sınav yapıldı mı? Tarih aralığı 2 yıl; key scope: exams'
        : withStudent === 0
          ? 'Sonuç geldi ama öğrenci alanı yok — studentId/studentName bekleniyor'
          : null,
    apiVersion: 'v1'
  };
}

function emptyResult(cfg, path, apiHint, response) {
  return {
    rows: [],
    baseUrl: cfg.baseUrl,
    path,
    fetchMode: 'error',
    httpStatus: response?.status ?? null,
    jsonShape: response ? describeEdesisJson(response.json) : null,
    rawPreview: response?.rawPreview ?? null,
    contentType: response?.contentType ?? null,
    parseOk: false,
    rowsWithStudentFields: 0,
    sampleRowKeys: [],
    apiHint,
    diagnosis: apiHint,
    apiVersion: 'v1'
  };
}

/** GET /grades — sınıf seviyeleri */
export async function fetchEdesisGradesList(cfgOverride = {}) {
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };
  const bulk = await fetchAllPaged(localCfg, V1_PATHS.grades, {});
  return { rows: bulk.rows || [], totalCount: bulk.totalCount ?? bulk.rows?.length ?? 0 };
}

/** GET /departments — bölümler (TYT, Sayısal vb.) */
export async function fetchEdesisDepartmentsList(cfgOverride = {}) {
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };
  const bulk = await fetchAllPaged(localCfg, V1_PATHS.departments, {});
  return { rows: bulk.rows || [], totalCount: bulk.totalCount ?? bulk.rows?.length ?? 0 };
}

/** GET /classrooms — şube listesi */
export async function fetchEdesisClassroomsList(cfgOverride = {}) {
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };
  const bulk = await fetchAllPaged(localCfg, V1_PATHS.classrooms, {});
  return { rows: bulk.rows || [], totalCount: bulk.totalCount ?? bulk.rows?.length ?? 0 };
}

export async function postEdesisResource(path, body, cfgOverride = {}) {
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };
  const r = await fetchEdesisJson(localCfg, path, { method: 'POST', body });
  if (!r.ok) {
    throw new Error(r.json?.error || r.json?.message || `edesis_post_${r.status}`);
  }
  return r.json;
}

export async function createEdesisClassroom(body, cfgOverride = {}) {
  return postEdesisResource(V1_PATHS.classrooms, body, cfgOverride);
}

export async function createEdesisStudent(body, cfgOverride = {}) {
  return postEdesisResource(V1_PATHS.students, body, cfgOverride);
}

export async function createEdesisParent(body, cfgOverride = {}) {
  return postEdesisResource(V1_PATHS.parents, body, cfgOverride);
}

function pickStudentListFilters(filters = {}) {
  const q = {};
  const src = filters && typeof filters === 'object' ? filters : {};
  if (src.TermId != null && src.TermId !== '') q.TermId = src.TermId;
  if (src.StudentState) q.StudentState = src.StudentState;
  if (src.ClassroomId != null && src.ClassroomId !== '') q.ClassroomId = src.ClassroomId;
  if (src.IsActive != null && src.IsActive !== '') q.IsActive = src.IsActive;
  if (src.ModifiedAfter) q.ModifiedAfter = src.ModifiedAfter;
  if (src.Filter) q.Filter = src.Filter;
  return q;
}

function toEdesisInt(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function normalizeEdesisStructureRow(row) {
  const r = row && typeof row === 'object' ? row : {};
  return {
    kitapcikTuru: String(r.kitapcikTuru || r.booklet || 'A').trim() || 'A',
    lessonId: toEdesisInt(r.lessonId),
    lessonName: String(r.lessonName || r.dersAdi || r.name || '').trim(),
    dersGrupId: toEdesisInt(r.dersGrupId),
    questionCount: Number(r.questionCount) || 0
  };
}

export function groupEdesisStructureByBooklet(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const key = String(row.kitapcikTuru || 'A');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return [...map.entries()].map(([kitapcikTuru, lessons]) => ({ kitapcikTuru, lessons }));
}

function normalizeIngestLessonAnswer(item) {
  const lessonId = toEdesisInt(item?.lessonId);
  const dersGrupId = toEdesisInt(item?.dersGrupId);
  const cevaplar = String(item?.cevaplar ?? '');
  return { lessonId, dersGrupId, cevaplar };
}

function normalizeIngestResultRow(row) {
  const out = {
    kitapcikTuru: String(row?.kitapcikTuru || '').trim(),
    dersCevaplari: Array.isArray(row?.dersCevaplari) ? row.dersCevaplari.map(normalizeIngestLessonAnswer) : []
  };
  const kitapcikTuruSay = String(row?.kitapcikTuruSay || '').trim();
  if (kitapcikTuruSay) out.kitapcikTuruSay = kitapcikTuruSay;
  const ogrenciId = toEdesisInt(row?.ogrenciId ?? row?.studentId);
  const okulNumarasi = toEdesisInt(row?.okulNumarasi);
  const tcNo = toEdesisInt(row?.tcNo);
  if (ogrenciId != null) out.ogrenciId = ogrenciId;
  if (okulNumarasi != null) out.okulNumarasi = okulNumarasi;
  if (tcNo != null) out.tcNo = tcNo;
  return out;
}

/** GET /students — kurum öğrenci listesi (v1.4 sunucu filtreleri) */
export async function fetchEdesisStudentsList(cfgOverride = {}, filters = {}) {
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };
  const query = pickStudentListFilters(filters);
  const bulk = await fetchAllPaged(localCfg, V1_PATHS.students, query);
  return {
    rows: bulk.rows || [],
    totalCount: bulk.totalCount ?? bulk.rows?.length ?? 0,
    httpStatus: bulk.response?.status ?? null,
    error: bulk.error || null,
    filters: query
  };
}

/** GET /students Filter ile tek öğrenci (tam liste taramaz) */
export async function fetchEdesisStudentByOgrenciId(edesisStudentId, cfgOverride = {}) {
  const sid = String(edesisStudentId || '').trim();
  if (!sid) return null;
  const listed = await fetchEdesisStudentsList(cfgOverride, { Filter: sid });
  const hit = (listed.rows || []).find((row) => {
    const r = flattenEdesisRow(row);
    const id = pickStr(r, ['id', 'studentId', 'ogrenciId']);
    return id === sid;
  });
  if (!hit) return null;
  const r = flattenEdesisRow(hit);
  return {
    id: pickStr(r, ['id', 'studentId', 'ogrenciId']),
    gradeName: pickStr(r, ['gradeName', 'sinifAdi', 'grade']),
    className: pickStr(r, ['className', 'classroomName', 'subeAdi', 'sube']),
    classroomId: pickStr(r, ['classroomId', 'sinifId'])
  };
}

/** GET /terms — akademik dönemler */
export async function fetchEdesisTermsList(cfgOverride = {}) {
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };
  const bulk = await fetchAllPaged(localCfg, V1_PATHS.terms, {});
  return {
    rows: bulk.rows || [],
    totalCount: bulk.totalCount ?? bulk.rows?.length ?? 0,
    httpStatus: bulk.response?.status ?? null,
    error: bulk.error || null
  };
}

/** GET /exams — sınav kataloğu (resultsUpdatedAfter artımlı senkron) */
export async function fetchEdesisExamsCatalog(cfgOverride = {}, query = {}) {
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };
  const q = {};
  if (query.Filter) q.Filter = query.Filter;
  if (query.resultsUpdatedAfter) q.resultsUpdatedAfter = query.resultsUpdatedAfter;
  if (query.StudentId) q.StudentId = query.StudentId;
  if (query.studentId) q.studentId = query.studentId;
  if (query.ClassroomId) q.ClassroomId = query.ClassroomId;
  const bulk = await fetchAllPaged(localCfg, V1_PATHS.exams, q);
  return {
    rows: bulk.rows || [],
    totalCount: bulk.totalCount ?? bulk.rows?.length ?? 0,
    httpStatus: bulk.response?.status ?? null,
    error: bulk.error || null
  };
}

/** GET /exams/results?StudentId= — tek öğrenci sonuçları */
export async function fetchEdesisStudentResults(edesisStudentId, cfgOverride = {}, options = {}) {
  const sid = String(edesisStudentId || '').trim();
  if (!sid) throw new Error('edesis_student_id_required');
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };
  const enrichSubjects = options.enrichSubjects !== false;
  const dateRange = defaultDateRangeQuery();
  const bulk = await fetchAllPaged(localCfg, V1_PATHS.examResults, {
    StudentId: sid,
    ...dateRange,
    ...(enrichSubjects ? EXAM_DETAIL_QUERY : {})
  });
  let rows = (bulk.rows || []).filter((row) => resultRowBelongsToStudent(row, sid));
  if (rows.length && enrichSubjects) {
    const enriched = await enrichEdesisRowsWithSubjectDetails(rows, localCfg, { maxStudents: 25 });
    rows = enriched.rows;
  }
  return {
    rows,
    totalCount: rows.length,
    httpStatus: bulk.response?.status ?? null,
    fetchMode: 'v1:exams/results?StudentId',
    error: bulk.error || null
  };
}

/** GET /exams/{examId}/structure — kitapçık × ders (ingest öncesi) */
export async function fetchEdesisExamStructure(examId, cfgOverride = {}) {
  const id = String(examId || '').trim();
  if (!id) throw new Error('examId_required');
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };
  const r = await fetchEdesisJson(localCfg, V1_PATHS.examStructure(id));
  if (!isReachableEdesisResponse(r)) {
    return {
      rows: [],
      booklets: [],
      httpStatus: r.status,
      error: r.json?.error || r.json?.message || `structure_${r.status}`
    };
  }
  const rows = unwrapList(r.json).map(normalizeEdesisStructureRow);
  let bookletPdfs = collectEdesisBookletFiles(r.json);
  let examMeta = pickExamMetaFromJson(r.json);
  try {
    const probed = await probeEdesisExamBookletSources(id, localCfg);
    examMeta = { ...examMeta, ...probed.examMeta };
    bookletPdfs = dedupeBookletFiles([...bookletPdfs, ...probed.files]);
  } catch {
    /* kitapçık PDF yoksa yapı yine döner */
  }
  const examFamily = detectEdesisExamFamily(examMeta.title, examMeta.examType);
  const ui = edesisOpticalUi(examFamily);
  return {
    rows,
    booklets: groupEdesisStructureByBooklet(rows),
    bookletPdfs,
    examFamily,
    bookletMode: ui.bookletMode,
    choiceCount: ui.choiceCount,
    remainingSeconds: examMeta.remainingSeconds || 0,
    examTitle: examMeta.title || '',
    examType: examMeta.examType || '',
    httpStatus: r.status,
    error: null
  };
}

function responseLooksLikePdf(r) {
  const ct = String(r?.contentType || '').toLowerCase();
  if (ct.includes('pdf')) return true;
  const preview = String(r?.rawPreview || r?.text || '');
  return preview.includes('%PDF-');
}

async function probeEdesisExamBookletSources(examId, localCfg) {
  const id = String(examId || '').trim();
  const paths = [
    V1_PATHS.examById(id),
    V1_PATHS.examBooklets(id),
    V1_PATHS.examFiles(id),
    V1_PATHS.examPdf(id),
    `${V1_PATHS.examPdf(id)}?kitapcikTuru=A`,
    `${V1_PATHS.examPdf(id)}?kitapcikTuru=B`
  ];
  const collected = [];
  let examMeta = {};
  for (const path of paths) {
    const r = await fetchEdesisJson(localCfg, path);
    if (path === V1_PATHS.examById(id) && isReachableEdesisResponse(r)) {
      examMeta = pickExamMetaFromJson(r.json);
    }
    if (responseLooksLikePdf(r) && r.url) {
      collected.push({ url: r.url, kitapcikTuru: '', name: 'Sınav PDF' });
      continue;
    }
    if (!isReachableEdesisResponse(r)) continue;
    collected.push(...collectEdesisBookletFiles(r.json));
  }
  return { files: dedupeBookletFiles(collected), examMeta };
}

/** Sınav kitapçık PDF’leri — GET /exams/{id} ve kitapçık uçları */
export async function fetchEdesisExamBookletPdfs(examId, cfgOverride = {}) {
  const id = String(examId || '').trim();
  if (!id) return [];
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };
  const probed = await probeEdesisExamBookletSources(id, localCfg);
  return probed.files;
}

export async function fetchEdesisUrlBuffer(fileUrl, cfgOverride = {}) {
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  const url = resolveEdesisFileUrl(fileUrl, cfg);
  if (!url) throw new Error('pdf_url_missing');
  const headers = buildHeaders(cfg, { forGet: true });
  headers.Accept = 'application/pdf,application/octet-stream,*/*';
  const res = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(45000) });
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') || '';
  return {
    ok: res.ok,
    status: res.status,
    contentType,
    buf,
    url,
    looksPdf: looksLikePdfBuffer(buf)
  };
}

/** Kitapçık PDF’sini Edesis’ten indir (öğrenci paneli proxy’si) */
export async function loadEdesisExamBookletPdf(examId, kitapcikTuru, cfgOverride = {}) {
  const id = String(examId || '').trim();
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (!id) return { ok: false, status: 400, files: [], file: null, buf: null, looksPdf: false, url: '' };
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };
  const files = await fetchEdesisExamBookletPdfs(id, localCfg);
  const file = pickEdesisBookletFile(files, kitapcikTuru);
  const kt = String(kitapcikTuru || '').trim();
  const tryUrls = [];
  if (file?.url) tryUrls.push(file.url);
  for (const f of files || []) {
    if (f?.url) tryUrls.push(f.url);
  }
  if (kt) tryUrls.push(joinUrl(localCfg.baseUrl, `${V1_PATHS.examPdf(id)}?kitapcikTuru=${encodeURIComponent(kt)}`));
  tryUrls.push(joinUrl(localCfg.baseUrl, V1_PATHS.examPdf(id)));
  tryUrls.push(joinUrl(localCfg.baseUrl, V1_PATHS.examFiles(id)));
  tryUrls.push(joinUrl(localCfg.baseUrl, V1_PATHS.examBooklets(id)));
  tryUrls.push(joinUrl(localCfg.baseUrl, V1_PATHS.examById(id)));

  const seen = new Set();
  for (const raw of tryUrls) {
    const url = resolveEdesisFileUrl(raw, localCfg);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    try {
      const got = await fetchEdesisUrlBuffer(url, localCfg);
      if (got.ok && got.looksPdf) {
        return { ok: true, files, file, buf: got.buf, contentType: got.contentType, url: got.url, looksPdf: true, status: got.status };
      }
      // JSON yanıtında gömülü PDF url varsa topla ve dene
      if (got.ok && got.contentType.includes('json')) {
        try {
          const json = JSON.parse(got.buf.toString('utf8'));
          for (const nested of collectEdesisBookletFiles(json)) {
            const nestedUrl = resolveEdesisFileUrl(nested.url, localCfg);
            if (!nestedUrl || seen.has(nestedUrl)) continue;
            seen.add(nestedUrl);
            const nestedGot = await fetchEdesisUrlBuffer(nestedUrl, localCfg);
            if (nestedGot.ok && nestedGot.looksPdf) {
              return {
                ok: true,
                files: dedupeBookletFiles([...files, nested]),
                file: nested,
                buf: nestedGot.buf,
                contentType: nestedGot.contentType,
                url: nestedGot.url,
                looksPdf: true,
                status: nestedGot.status
              };
            }
          }
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* sonraki aday */
    }
  }
  return {
    ok: false,
    status: 404,
    files,
    file,
    buf: null,
    looksPdf: false,
    url: file?.url ? resolveEdesisFileUrl(file.url, localCfg) : '',
    contentType: ''
  };
}

/** GET /exams/{examId}/subjects — konu kırılımı (düz dizi) */
export async function fetchEdesisExamSubjects(examId, cfgOverride = {}) {
  const id = String(examId || '').trim();
  if (!id) throw new Error('examId_required');
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };
  const r = await fetchEdesisJson(localCfg, V1_PATHS.examSubjects(id));
  if (!isReachableEdesisResponse(r)) {
    return { rows: [], httpStatus: r.status, error: r.json?.error || `subjects_${r.status}` };
  }
  return { rows: unwrapList(r.json), httpStatus: r.status, error: null };
}

/** GET /exams/{examId}/results/lessons — öğrenci × ders (max 100/sayfa) */
export async function fetchEdesisExamResultsLessons(examId, { studentId } = {}, cfgOverride = {}) {
  const id = String(examId || '').trim();
  if (!id) throw new Error('examId_required');
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };
  const query = {};
  if (studentId) query.studentId = studentId;
  const bulk = await fetchAllPaged(localCfg, V1_PATHS.examResultsLessons(id), query, {
    pageSize: BREAKDOWN_PAGE_SIZE
  });
  return {
    rows: bulk.rows || [],
    totalCount: bulk.totalCount ?? bulk.rows?.length ?? 0,
    httpStatus: bulk.response?.status ?? null,
    error: bulk.error || null
  };
}

/** GET /exams/{examId}/results/subjects — öğrenci × konu (max 100/sayfa) */
export async function fetchEdesisExamResultsSubjects(examId, { studentId } = {}, cfgOverride = {}) {
  const id = String(examId || '').trim();
  if (!id) throw new Error('examId_required');
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };
  const query = {};
  if (studentId) query.studentId = studentId;
  const bulk = await fetchAllPaged(localCfg, V1_PATHS.examResultsSubjects(id), query, {
    pageSize: BREAKDOWN_PAGE_SIZE
  });
  return {
    rows: bulk.rows || [],
    totalCount: bulk.totalCount ?? bulk.rows?.length ?? 0,
    httpStatus: bulk.response?.status ?? null,
    error: bulk.error || null
  };
}

/**
 * POST /exams/{examId}/results — ham optik ingest.
 * replace GÖVDE alanıdır; query string yok sayılır.
 * 202 = kabul (jobId); 409 = mevcut sonuç; 422 = hiçbir satır kabul edilmedi.
 */
export async function submitEdesisExamResults(examId, payload = {}, cfgOverride = {}) {
  const id = String(examId || '').trim();
  if (!id) throw new Error('examId_required');
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };

  const results = Array.isArray(payload.results) ? payload.results.map(normalizeIngestResultRow) : [];
  const body = {
    replace: Boolean(payload.replace),
    results
  };

  const r = await fetchEdesisJson(localCfg, V1_PATHS.examResultsByExam(id), { method: 'POST', body });
  const json = r.json && typeof r.json === 'object' && !Array.isArray(r.json) ? r.json : {};
  const accepted = Number(json.accepted) || 0;
  const rejected = Array.isArray(json.rejected) ? json.rejected : [];
  const jobId = json.jobId || null;
  const statusUrl = json.statusUrl || (jobId ? `${V1_PATHS.examResultsStatus(id)}?jobId=${encodeURIComponent(jobId)}` : null);

  const out = {
    ok: r.status === 202 || (r.ok && accepted > 0 && jobId),
    httpStatus: r.status,
    accepted,
    rejected,
    jobId,
    statusUrl,
    message: json.message || json.error || null,
    conflict: r.status === 409,
    raw: json
  };

  if (r.status === 202) {
    out.ok = true;
    out.message = out.message || 'Değerlendirme başlatıldı.';
  } else if (r.status === 409) {
    out.ok = false;
    out.message =
      out.message ||
      'Bu öğrencinin bu sınavda mevcut sonucu var. Gövdeye replace:true koyarak üzerine yazın (query ?replace=true yok sayılır).';
  } else if (r.status === 422) {
    out.ok = false;
    out.message = out.message || 'Kabul edilen öğrenci sonucu yok.';
  } else if (r.status === 403) {
    out.ok = false;
    out.message = out.message || "exam_results:write scope gerekli (admin paketi veya custom key)";
  } else if (!r.ok && r.status !== 202) {
    out.ok = false;
    out.message = out.message || `ingest_${r.status}`;
  }
  return out;
}

/** GET /exams/{examId}/results/status?jobId= — geçersiz jobId 200 + state NotFound */
export async function fetchEdesisIngestJobStatus(examId, jobId, cfgOverride = {}) {
  const id = String(examId || '').trim();
  const jid = String(jobId || '').trim();
  if (!id) throw new Error('examId_required');
  if (!jid) throw new Error('jobId_required');
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };
  const r = await fetchEdesisJson(localCfg, `${V1_PATHS.examResultsStatus(id)}${buildQuery({ jobId: jid })}`);
  const json = r.json && typeof r.json === 'object' ? r.json : {};
  return {
    ok: r.ok,
    httpStatus: r.status,
    jobId: json.jobId || jid,
    state: json.state || json.status || null,
    message: json.message || json.error || null,
    raw: json
  };
}

export async function pollEdesisIngestJob(
  examId,
  jobId,
  { maxAttempts = 12, delayMs = 5000 } = {},
  cfgOverride = {}
) {
  let last = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    last = await fetchEdesisIngestJobStatus(examId, jobId, cfgOverride);
    const state = String(last.state || '');
    if (['Completed', 'Failed', 'NotFound'].includes(state)) return last;
    if (!last.ok && last.httpStatus !== 200) return last;
    await sleep(delayMs);
  }
  return last;
}

export const EDESIS_EMPTY_LIST_HELP = {
  tr: {
    title: 'Edesis v1.5 — sonuç gelmiyorsa',
    steps: [
      'Base URL: https://{kurum}.api.edesis.com (path EKLEMEYİN — /api/external/v1 kodda)',
      'Header: yalnızca X-API-Key (KurumKodu header GEREKMEZ)',
      'API key paketi: exams, student_dashboard veya full_read (exam_results:read scope)',
      'Ham cevap gönderimi: admin veya custom key + exam_results:write',
      'Endpoint: GET /api/external/v1/exams/results?StartDate=...&EndDate=...',
      'Öğrenci eşleme: studentId veya email — GET /api/external/v1/students ile id eşleştirin',
      'Destek: bilgi@sinavza.com'
    ]
  }
};
