/**
 * Edesis External API v1.2 — https://{domain}/api/external/v1
 * Auth: X-API-Key header only (key is tenant-scoped; no KurumKodu).
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

const PAGE_SIZE = 1000; // PDF max
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
    apiVersion: 'v1',
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

export async function fetchEdesisJson(cfg, path, { method = 'GET', body } = {}) {
  const url = joinUrl(cfg.baseUrl, path);
  const init = {
    method,
    headers: buildHeaders(cfg, { forGet: method === 'GET' }),
    signal: AbortSignal.timeout(30000)
  };
  if (body !== undefined && method !== 'GET') {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const res = await fetch(url, init);
  const text = await res.text();
  const contentType = res.headers.get('content-type') || '';
  const parsed = parseEdesisResponseText(text);
  const json = parsed.parseOk ? parsed.json : { _raw: parsed.rawPreview, _invalidBody: parsed.invalidBody };

  return {
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

/** v1 sayfalı liste — MaxResultCount max 1000 */
async function fetchAllPaged(cfg, path, query = {}) {
  const items = [];
  let skip = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = buildQuery({
      ...query,
      MaxResultCount: PAGE_SIZE,
      SkipCount: skip
    });
    const r = await fetchEdesisJson(cfg, `${path}${qs}`);
    if (r.status === 429) {
      const err = new Error('edesis_rate_limit');
      err.retryAfter = 10;
      throw err;
    }
    if (!isReachableEdesisResponse(r)) {
      if (page === 0) return { rows: [], response: r, error: r.json?.error || 'fetch_failed' };
      break;
    }
    const batch = unwrapList(r.json);
    items.push(...batch);
    const total = Number(r.json?.totalCount);
    if (!batch.length || batch.length < PAGE_SIZE) break;
    if (Number.isFinite(total) && items.length >= total) break;
    skip += batch.length;
  }
  return { rows: items, response: null, error: null };
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

async function pollEdesisReportJob(cfg, jobId, { maxAttempts = 30, delayMs = 2000 } = {}) {
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

/** GET /students — kurum öğrenci listesi */
export async function fetchEdesisStudentsList(cfgOverride = {}) {
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };
  const bulk = await fetchAllPaged(localCfg, V1_PATHS.students, {});
  return {
    rows: bulk.rows || [],
    totalCount: bulk.totalCount ?? bulk.rows?.length ?? 0,
    httpStatus: bulk.response?.status ?? null,
    error: bulk.error || null
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

/** GET /exams — sınav kataloğu */
export async function fetchEdesisExamsCatalog(cfgOverride = {}) {
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };
  const bulk = await fetchAllPaged(localCfg, V1_PATHS.exams, {});
  return {
    rows: bulk.rows || [],
    totalCount: bulk.totalCount ?? bulk.rows?.length ?? 0,
    httpStatus: bulk.response?.status ?? null,
    error: bulk.error || null
  };
}

/** GET /exams/results?StudentId= — tek öğrenci sonuçları */
export async function fetchEdesisStudentResults(edesisStudentId, cfgOverride = {}) {
  const sid = String(edesisStudentId || '').trim();
  if (!sid) throw new Error('edesis_student_id_required');
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };
  const dateRange = defaultDateRangeQuery();
  const bulk = await fetchAllPaged(localCfg, V1_PATHS.examResults, {
    StudentId: sid,
    ...dateRange,
    ...EXAM_DETAIL_QUERY
  });
  let rows = bulk.rows || [];
  if (rows.length) {
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

export const EDESIS_EMPTY_LIST_HELP = {
  tr: {
    title: 'Edesis v1 — sonuç gelmiyorsa',
    steps: [
      'Base URL: https://{kurum}.api.edesis.com (path EKLEMEYİN — /api/external/v1 kodda)',
      'Header: yalnızca X-API-Key (KurumKodu header GEREKMEZ)',
      'API key paketi: exams, student_dashboard veya full_read (exam_results:read scope)',
      'Endpoint: GET /api/external/v1/exams/results?StartDate=...&EndDate=...',
      'Öğrenci eşleme: studentId veya email — GET /api/external/v1/students ile id eşleştirin',
      'Destek: bilgi@sinavza.com'
    ]
  }
};
