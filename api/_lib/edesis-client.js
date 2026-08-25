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
  const abpUser = String(process.env.EDESIS_ABP_USER || process.env.EDESIS_ABP_USERNAME || '').trim();
  const abpPassword = String(process.env.EDESIS_ABP_PASSWORD || '').trim();
  const abpBearer = String(process.env.EDESIS_ABP_BEARER || process.env.EDESIS_ABP_TOKEN || '').trim();

  const bases = baseUrl ? [baseUrl] : DEFAULT_BASES;

  return {
    apiKey,
    institutionCode,
    baseUrl: baseUrl || bases[0],
    bases,
    authMode,
    apiVersion: 'v1.5',
    legacyResultsPath: legacyResults || null,
    legacyExamsPath: legacyExams || null,
    abpUser,
    abpPassword,
    abpBearer
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

/** ABP App Service çağrıları — X-API-Key ile 403; Bearer (TokenAuth) gerekir */
function buildAbpHeaders(cfg, abpAccessToken, { forGet = false } = {}) {
  const h = { Accept: 'application/json' };
  if (!forGet) h['Content-Type'] = 'application/json';
  const token = String(abpAccessToken || cfg.abpBearer || '').trim();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

let abpTokenCache = { token: '', expiresAt: 0, status: 'unknown', error: null };

export function getEdesisAbpAuthStatus() {
  return {
    configured: Boolean(
      String(process.env.EDESIS_ABP_BEARER || process.env.EDESIS_ABP_TOKEN || '').trim() ||
        (String(process.env.EDESIS_ABP_USER || process.env.EDESIS_ABP_USERNAME || '').trim() &&
          String(process.env.EDESIS_ABP_PASSWORD || '').trim())
    ),
    cacheStatus: abpTokenCache.status,
    cacheError: abpTokenCache.error,
    hasCachedToken: Boolean(abpTokenCache.token && abpTokenCache.expiresAt > Date.now())
  };
}

/**
 * ID’siz AP (GetOgrenciSinavIds vb.) için ABP oturumu.
 * Kanıt: GetSinavForView X-API-Key → 403; TokenAuth + Bearer gerekir.
 */
export async function resolveEdesisAbpAccessToken(cfgOverride = {}) {
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (cfg.abpBearer) {
    abpTokenCache = { token: cfg.abpBearer, expiresAt: Date.now() + 55 * 60_000, status: 'env_bearer', error: null };
    return { token: cfg.abpBearer, status: 'env_bearer', error: null };
  }
  if (abpTokenCache.token && abpTokenCache.expiresAt > Date.now() + 30_000) {
    return { token: abpTokenCache.token, status: abpTokenCache.status, error: null };
  }
  if (!cfg.abpUser || !cfg.abpPassword) {
    // Panel şifresi yoksa External API key’i Bearer dene (bazı kiracıda App Service açılır)
    if (cfg.apiKey) {
      abpTokenCache = {
        token: cfg.apiKey,
        expiresAt: Date.now() + 10 * 60_000,
        status: 'api_key_bearer',
        error: null
      };
      return { token: cfg.apiKey, status: 'api_key_bearer', error: null };
    }
    abpTokenCache = {
      token: '',
      expiresAt: 0,
      status: 'missing_credentials',
      error: 'EDESIS_ABP_USER + EDESIS_ABP_PASSWORD (veya EDESIS_ABP_BEARER) tanımlayın'
    };
    return { token: '', status: 'missing_credentials', error: abpTokenCache.error };
  }

  const base = cfg.baseUrl || cfg.bases[0];
  try {
    const res = await fetch(joinUrl(base, '/api/TokenAuth/Authenticate'), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userNameOrEmailAddress: cfg.abpUser,
        password: cfg.abpPassword,
        rememberClient: true
      }),
      signal: AbortSignal.timeout(20000)
    });
    const json = await res.json().catch(() => ({}));
    const body = json?.result && typeof json.result === 'object' ? json.result : json;
    const token = String(body?.accessToken || '').trim();
    if (!res.ok || !token) {
      const err =
        json?.error?.message ||
        body?.error?.message ||
        `TokenAuth HTTP ${res.status}`;
      abpTokenCache = { token: '', expiresAt: 0, status: 'auth_failed', error: String(err).slice(0, 200) };
      return { token: '', status: 'auth_failed', error: abpTokenCache.error };
    }
    const ttlSec = Number(body?.expireInSeconds) || 3600;
    abpTokenCache = {
      token,
      expiresAt: Date.now() + Math.max(60, ttlSec - 60) * 1000,
      status: 'authenticated',
      error: null
    };
    return { token, status: 'authenticated', error: null };
  } catch (e) {
    abpTokenCache = {
      token: '',
      expiresAt: 0,
      status: 'auth_error',
      error: e instanceof Error ? e.message : String(e)
    };
    return { token: '', status: 'auth_error', error: abpTokenCache.error };
  }
}

async function fetchEdesisAbpJson(cfg, path, { method = 'GET', body, timeoutMs = 30000 } = {}) {
  const auth = await resolveEdesisAbpAccessToken(cfg);
  if (!auth.token) {
    return {
      ok: false,
      status: 401,
      url: joinUrl(cfg.baseUrl || cfg.bases[0], path),
      json: { error: auth.error || 'abp_auth_missing', abpStatus: auth.status },
      parseOk: true,
      contentType: 'application/json',
      rawPreview: String(auth.error || auth.status).slice(0, 200),
      text: '',
      abpAuth: auth
    };
  }
  const url = joinUrl(cfg.baseUrl || cfg.bases[0], path);
  const init = {
    method,
    headers: buildAbpHeaders(cfg, auth.token, { forGet: method === 'GET' }),
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
  return {
    ok: res.ok,
    status: res.status,
    url,
    json,
    parseOk: parsed.parseOk,
    contentType,
    rawPreview: parsed.rawPreview,
    text: stripResponseText(text)?.slice(0, 300),
    abpAuth: auth
  };
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
    // Edesis bazen MaxResultCount=1000 isterken ~995 döner; totalCount 1971 olsa bile
    // batch.length < pageSize ile kırılıp ikinci sayfa kaçıyordu.
    if (!batch.length) break;
    if (Number.isFinite(total) && items.length >= total) break;
    if (!Number.isFinite(total) && batch.length < pageSize) break;
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
  return pickStrCi(r, ['id', 'examId', 'sinavId', 'sinav_id']) || pickStr(r, ['id', 'examId', 'sinavId', 'sinav_id']);
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
  // Tür/ad çıkarılamıyorsa program engeli koyma (atanmış yeni denemeler sık böyle)
  if (!examKeys.size) return true;
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

export function filterEdesisExamsForStudentProgram(items, programKeys, opts = {}) {
  const list = Array.isArray(items) ? items : [];
  let keys = programKeys instanceof Set ? new Set(programKeys) : new Set(programKeys || []);
  if (!keys.size) keys = majorityEdesisProgramKeys(list);
  if (!keys.size) return list;
  const keepSubmitted = Boolean(opts.keepSubmitted);
  const keepTakeable = Boolean(opts.keepTakeable);
  return list.filter((item) => {
    if (keepSubmitted && item?.hasStudentResult) return true;
    if (keepTakeable && item?.canTake) return true;
    return edesisCatalogExamMatchesProgram(
      { examType: item.examType, name: item.name || item.examName || item.examTitle },
      keys
    );
  });
}

const OPEN_CATALOG_WINDOW_DAYS = 21;

export function isOpenEdesisCatalogExam(exam) {
  const status = String(exam?.resultStatus || exam?.status || 'None').trim();
  // Closed only — Ready = kurumda sonuç var; atanmış öğrenci hâlâ girebilir (Edesis Online gibi)
  if (/^(closed|cancelled|canceled|archived|deleted|inactive)$/i.test(status)) return false;
  return true;
}

function getPropCi(obj, names) {
  if (!obj || typeof obj !== 'object') return undefined;
  const map = new Map(Object.entries(obj).map(([k, v]) => [String(k).toLowerCase(), v]));
  for (const n of names) {
    const hit = map.get(String(n).toLowerCase());
    if (hit !== undefined) return hit;
  }
  return undefined;
}

function collectEdesisIdList(obj, keys) {
  const out = [];
  for (const k of keys) {
    const v = getPropCi(obj, [k]);
    if (v == null || v === '') continue;
    if (Array.isArray(v)) {
      for (const it of v) {
        if (it != null && typeof it === 'object') {
          const id =
            pickStrCi(it, ['id', 'studentId', 'ogrenciId', 'classroomId', 'sinifId']) ||
            pickStr(it, ['id', 'studentId', 'ogrenciId', 'classroomId', 'sinifId']);
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

const EXPLICIT_ASSIGNED_STUDENT_KEYS = [
  'studentIds',
  'ogrenciIds',
  'assignedStudentIds',
  'ogrenciIdList',
  'studentIdList',
  'sinavOgrenciler',
  'examStudents',
  'ogrenciListesi',
  'assignedStudents'
];

const GENERIC_STUDENT_ROSTER_KEYS = ['students', 'ogrenciler'];

const CLASSROOM_ASSIGN_KEYS = [
  'classroomIds',
  'classRoomIds',
  'sinifIds',
  'classroomId',
  'classRoomId',
  'sinifId',
  'classId',
  'classIds',
  'subeIds',
  'sinifIdList'
];

/**
 * Katalog satırı bu öğrenciye atanmış mı?
 * true / false / null (alan yok, bilinmiyor)
 *
 * Öğrenci listesi varsa yalnızca o liste geçerlidir — classroomId tek başına
 * tüm şubeye yayılmaz (Edesis liste DTO’sunda şube alanı her denemede olabilir).
 */
export function catalogExamAssignedToStudent(exam, scope = {}) {
  const flat = flattenEdesisRow(exam);
  const nestedCandidates = [flat.exam, flat.sinav, flat.result, flat.data]
    .filter((x) => x && typeof x === 'object' && !Array.isArray(x))
    .map((x) => flattenEdesisRow(x));
  const sources = [flat, ...nestedCandidates];

  let allClasses = false;
  const explicitIds = [];
  const genericIds = [];
  const classroomIds = [];

  for (const src of sources) {
    const allFlag = getPropCi(src, ['isAllClasses', 'allClasses', 'tumSiniflar']);
    if (allFlag === true || allFlag === 'true' || allFlag === 1) {
      allClasses = true;
    }
    explicitIds.push(...collectEdesisIdList(src, EXPLICIT_ASSIGNED_STUDENT_KEYS));
    genericIds.push(...collectEdesisIdList(src, GENERIC_STUDENT_ROSTER_KEYS));
    classroomIds.push(...collectEdesisIdList(src, CLASSROOM_ASSIGN_KEYS));
  }

  const wantStudent = normEdesisId(scope.edesisStudentId);
  const studentIds = explicitIds.length ? explicitIds : genericIds;
  if (studentIds.length && wantStudent) {
    return studentIds.some((id) => normEdesisId(id) === wantStudent);
  }

  if (allClasses && !scope.requireStudentIdMatch) return true;

  const wantClass = normEdesisId(scope.classroomId);
  if (scope.allowClassroomOnly && classroomIds.length && wantClass) {
    return classroomIds.some((id) => normEdesisId(id) === wantClass);
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
    const t = Date.parse(getPropCi(flat, [k]));
    if (Number.isFinite(t) && t > best) best = t;
  }
  return best;
}

export function examOnlineFlag(exam) {
  const flat = flattenEdesisRow(exam) || {};
  const v = getPropCi(flat, [
    'isOnlineSinavForStudent',
    'isOnlineForStudent',
    'onlineSinavForStudent',
    'isOnlineExamForStudent'
  ]);
  if (v === true || v === 'true' || v === 1 || v === '1') return true;
  if (v === false || v === 'false' || v === 0 || v === '0') return false;
  return null;
}

/** StudentId kataloğunda online bayrağı kurum listesinden farklıysa bu öğrenciye tanımlı */
export function examAssignedViaOnlineFlag(exam, fullExam = null) {
  if (examOnlineFlag(exam) !== true) return false;
  if (!fullExam) return true;
  return examOnlineFlag(fullExam) !== true;
}

/** Edesis iç API — öğrenciye admin panelden tanımlı sınav ID listesi */
export function parseEdesisOgrenciSinavIdsResponse(json) {
  const body = json?.result && typeof json.result === 'object' ? json.result : json;
  const raw = body?.sinavId ?? body?.sinavIds ?? body?.SinavId ?? body?.SinavIds ?? [];
  const list = Array.isArray(raw) ? raw : raw != null && raw !== '' ? [raw] : [];
  return [...new Set(list.map((x) => String(x).trim()).filter(Boolean))];
}

/**
 * ID’siz App Service yanıtlarından sinavId çıkar:
 * - GetOgrenciSinavIds → { sinavId: number[] }
 * - OgrenciSinavListesi → AnalizSinavDto[] → sinavlar[].sinavId
 * - OgrenciSinavListesiByDonemIds → AnalizSinavDonemDto[] → donemSinavlar
 */
export function parseEdesisOgrenciSinavListesiResponse(json) {
  const fromIds = parseEdesisOgrenciSinavIdsResponse(json);
  if (fromIds.length) return fromIds;

  const root =
    json?.result != null && (Array.isArray(json.result) || typeof json.result === 'object')
      ? json.result
      : json;
  const buckets = [];
  if (Array.isArray(root)) buckets.push(...root);
  else if (root && typeof root === 'object') {
    for (const k of ['donemSinavlar', 'sinavlar', 'items', 'result', 'data']) {
      const v = root[k];
      if (Array.isArray(v)) buckets.push(...v);
    }
    buckets.push(root);
  }

  const out = [];
  const walk = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const it of node) walk(it);
      return;
    }
    if (typeof node !== 'object') return;
    const flat = flattenEdesisRow(node);
    const direct =
      pickStrCi(flat, ['sinavId', 'examId']) ||
      (flat.sinavId != null ? String(flat.sinavId) : '') ||
      (flat.SinavId != null ? String(flat.SinavId) : '');
    if (direct && /^\d+$/.test(String(direct).trim())) out.push(String(direct).trim());
    for (const k of ['sinavlar', 'donemSinavlar', 'items', 'exams']) {
      if (Array.isArray(flat[k])) walk(flat[k]);
    }
  };
  walk(buckets);
  return [...new Set(out.filter(Boolean))];
}

function extractSinavIdsFromSinavOgrenciRows(rows, sid) {
  const fromRows = [];
  for (const row of rows || []) {
    const flat = flattenEdesisRow(row);
    const nested = flattenEdesisRow(flat.sinavOgrenci || flat.SinavOgrenci || {});
    const rowSid =
      pickStrCi(nested, ['ogrenciId', 'studentId']) ||
      pickStrCi(flat, ['ogrenciId', 'studentId', 'ogrenciOkulNumarasi']);
    if (rowSid && normEdesisId(rowSid) !== sid && String(rowSid).trim() !== sid) {
      const hasOgrenci = Boolean(
        pickStrCi(nested, ['ogrenciId', 'studentId']) || pickStrCi(flat, ['ogrenciId', 'studentId'])
      );
      if (hasOgrenci) continue;
    }
    if (rowSid && normEdesisId(rowSid) !== sid) continue;
    const examId =
      pickStrCi(nested, ['sinavId', 'examId']) || pickStrCi(flat, ['sinavId', 'examId', 'id']);
    if (examId) fromRows.push(String(examId));
  }
  return [...new Set(fromRows)];
}

/**
 * Öğrenciye tanımlı sınav ID’leri — sınav ID bilmeden (ID’siz AP).
 * Tüm kaynaklar birleştirilir (Listesi analiz geçmişi olabilir; SinavOgrencies / GetOgrenciSinavIds
 * yeni online atamayı taşır). Short-circuit YOK.
 */
export async function fetchEdesisOgrenciAssignedSinavIdsDetailed(edesisStudentId, cfgOverride = {}) {
  const sid = normEdesisId(edesisStudentId);
  const empty = { ids: [], attempts: [], source: null };
  if (!sid) return empty;
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };
  const attempts = [];
  const numericSid = Number(sid);
  const sidBody = Number.isFinite(numericSid) ? numericSid : sid;
  const merged = new Set();

  const record = (label, path, status, ids, note = null) => {
    attempts.push({
      label,
      path,
      status: status ?? null,
      count: Array.isArray(ids) ? ids.length : 0,
      note
    });
  };

  const absorb = (ids) => {
    for (const id of ids || []) {
      const s = String(id || '').trim();
      if (s) merged.add(s);
    }
  };

  const tryGet = async (label, path, parseFn) => {
    try {
      const r = await fetchEdesisAbpJson(localCfg, path);
      if (r.status === 401 || r.status === 403) {
        record(label, path, r.status, [], r.json?.abpStatus || r.abpAuth?.status || 'auth_rejected');
        return;
      }
      if (!isReachableEdesisResponse(r)) {
        record(label, path, r.status, [], 'unreachable');
        return;
      }
      const ids = parseFn(r.json);
      record(label, path, r.status, ids);
      absorb(ids);
    } catch (e) {
      record(label, path, null, [], e instanceof Error ? e.message : 'error');
    }
  };

  const tryPost = async (label, path, body, parseFn) => {
    try {
      const r = await fetchEdesisAbpJson(localCfg, path, { method: 'POST', body });
      if (r.status === 401 || r.status === 403) {
        record(label, path, r.status, [], r.json?.abpStatus || r.abpAuth?.status || 'auth_rejected');
        return;
      }
      if (!isReachableEdesisResponse(r)) {
        record(label, path, r.status, [], 'unreachable');
        return;
      }
      const ids = parseFn(r.json);
      record(label, path, r.status, ids);
      absorb(ids);
    } catch (e) {
      record(label, path, null, [], e instanceof Error ? e.message : 'error');
    }
  };

  await tryGet(
    'GetOgrenciSinavIds',
    `/api/services/app/OgrenciSinavs/GetOgrenciSinavIds?ogrenciId=${encodeURIComponent(sid)}`,
    parseEdesisOgrenciSinavIdsResponse
  );
  await tryPost(
    'OgrenciSinavListesi',
    `/api/services/app/Sinavs/OgrenciSinavListesi`,
    [sidBody],
    parseEdesisOgrenciSinavListesiResponse
  );

  let donemIds = [];
  try {
    const terms = await fetchEdesisTermsList(localCfg);
    const items = terms?.rows || terms?.items || [];
    donemIds = items
      .filter((t) => t && (t.isDefault || /2026|2025|YAZ/i.test(String(t.name || ''))))
      .map((t) => Number(t.id))
      .filter((n) => Number.isFinite(n))
      .slice(0, 5);
  } catch {
    donemIds = [];
  }
  if (!donemIds.length) donemIds = [113, 142, 40];

  for (const donemId of donemIds) {
    await tryPost(
      `OgrenciSinavListesi?donemId=${donemId}`,
      `/api/services/app/Sinavs/OgrenciSinavListesi?donemId=${donemId}`,
      [sidBody],
      parseEdesisOgrenciSinavListesiResponse
    );
  }
  await tryPost(
    'OgrenciSinavListesiByDonemIds',
    `/api/services/app/Sinavs/OgrenciSinavListesiByDonemIds`,
    // Swagger şeması: ogrengiIds (yazım hatası Edesis tarafında)
    { ogrengiIds: [sidBody], ogrenciIds: [sidBody], donemIds },
    parseEdesisOgrenciSinavListesiResponse
  );

  {
    const path = `/api/services/app/SinavOgrencies/GetAll?Filter=${encodeURIComponent(sid)}&MaxResultCount=500`;
    try {
      const r = await fetchEdesisAbpJson(localCfg, path);
      if (r.status === 401 || r.status === 403) {
        record('SinavOgrencies.GetAll', path, r.status, [], r.json?.abpStatus || r.abpAuth?.status || 'auth_rejected');
      } else if (isReachableEdesisResponse(r)) {
        const fromSinavIds = parseEdesisOgrenciSinavIdsResponse(r.json);
        const fromRows = extractSinavIdsFromSinavOgrenciRows(unwrapList(r.json), sid);
        const ids = fromSinavIds.length ? fromSinavIds : fromRows;
        record('SinavOgrencies.GetAll', path, r.status, ids || []);
        absorb(ids);
      } else {
        record('SinavOgrencies.GetAll', path, r.status, [], 'unreachable');
      }
    } catch (e) {
      record('SinavOgrencies.GetAll', path, null, [], e instanceof Error ? e.message : 'error');
    }
  }

  // OgrenciId filtresi (Filter serbest metin bazen başka kayda kayar)
  {
    const path = `/api/services/app/SinavOgrencies/GetAll?OgrenciId=${encodeURIComponent(sid)}&MaxResultCount=500`;
    try {
      const r = await fetchEdesisAbpJson(localCfg, path);
      if (r.status === 401 || r.status === 403) {
        record('SinavOgrencies.GetAll.OgrenciId', path, r.status, [], r.json?.abpStatus || r.abpAuth?.status || 'auth_rejected');
      } else if (isReachableEdesisResponse(r)) {
        const fromRows = extractSinavIdsFromSinavOgrenciRows(unwrapList(r.json), sid);
        record('SinavOgrencies.GetAll.OgrenciId', path, r.status, fromRows);
        absorb(fromRows);
      } else {
        record('SinavOgrencies.GetAll.OgrenciId', path, r.status, [], 'unreachable');
      }
    } catch (e) {
      record('SinavOgrencies.GetAll.OgrenciId', path, null, [], e instanceof Error ? e.message : 'error');
    }
  }

  const ids = [...merged];
  const source = attempts.find((a) => a.count > 0)?.label || null;
  const abpAuth = getEdesisAbpAuthStatus();
  return { ids, attempts, source, abpAuth };
}

export async function fetchEdesisOgrenciAssignedSinavIds(edesisStudentId, cfgOverride = {}) {
  const detailed = await fetchEdesisOgrenciAssignedSinavIdsDetailed(edesisStudentId, cfgOverride);
  return detailed.ids;
}

/** GET /OgrenciSinavs/GetOgrenciBySinavId — sınava tanımlı öğrenci listesi */
export async function fetchEdesisExamRosterStudentIds(examId, cfgOverride = {}) {
  const id = String(examId || '').trim();
  if (!id) return null;
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };
  try {
    const r = await fetchEdesisAbpJson(
      localCfg,
      `/api/services/app/OgrenciSinavs/GetOgrenciBySinavId?sinavId=${encodeURIComponent(id)}`
    );
    if (r.status === 401 || r.status === 403) return null;
    if (!isReachableEdesisResponse(r)) return null;
    const rows = unwrapList(r.json);
    const ids = [];
    for (const row of rows) {
      const flat = flattenEdesisRow(row);
      const sid =
        pickStrCi(flat, ['id', 'ogrenciId', 'studentId']) ||
        pickStr(flat, ['id', 'ogrenciId', 'studentId']);
      if (sid) ids.push(normEdesisId(sid) || String(sid).trim());
    }
    return ids;
  } catch {
    return null;
  }
}

export function examRosterIncludesStudent(rosterIds, edesisStudentId) {
  const want = normEdesisId(edesisStudentId);
  if (!want || !Array.isArray(rosterIds)) return false;
  return rosterIds.some((id) => normEdesisId(id) === want || String(id).trim() === want);
}

/** GetOgrenciSinavIds çıktısını katalog satırlarına eşle (ogrenciIds alanı olmasa da) */
export function collectCatalogRowsForSinavIds(catalogRows = [], sinavIds = [], detailById = {}) {
  const want = new Set((sinavIds || []).map((id) => String(id).trim()).filter(Boolean));
  if (!want.size) return [];
  const byId = new Map();
  for (const ex of catalogRows || []) {
    const id = pickEdesisCatalogExamId(ex);
    if (id) byId.set(String(id), ex);
  }
  const out = [];
  for (const id of want) {
    if (byId.has(id)) {
      out.push(byId.get(id));
      continue;
    }
    const detail = detailById[id];
    if (detail && typeof detail === 'object') out.push({ id, ...detail });
  }
  return out;
}

/** GET /exams/{id}/results?StudentId= satırları bu öğrenciye mi ait (sıkı eşleşme) */
export function examResultRowsAssignStudent(rows, edesisStudentId) {
  const sid = normEdesisId(edesisStudentId);
  if (!sid || !Array.isArray(rows) || !rows.length) return false;
  const matched = rows.filter((row) => {
    const flat = flattenEdesisRow(row);
    const rowSid = pickStrCi(flat, ['studentId', 'ogrenciId', 'ogrenci_id']) || pickStr(flat, ['studentId', 'ogrenciId', 'ogrenci_id']);
    return rowSid && normEdesisId(rowSid) === sid;
  });
  return matched.length > 0;
}

export async function fetchEdesisExamAssignedToStudent(examId, edesisStudentId, cfgOverride = {}) {
  const id = String(examId || '').trim();
  const sid = normEdesisId(edesisStudentId);
  if (!id || !sid) return false;
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };
  const qs = buildQuery({ StudentId: sid, MaxResultCount: 50 });
  const r = await fetchEdesisJson(localCfg, `${V1_PATHS.examResultsByExam(id)}${qs}`);
  if (!isReachableEdesisResponse(r)) return false;
  return examResultRowsAssignStudent(unwrapList(r.json), sid);
}

export function isRecentOpenCatalogExam(exam, now = new Date(), windowDays = OPEN_CATALOG_WINDOW_DAYS) {
  const ms = catalogExamRecencyMs(exam);
  if (!ms) return false;
  const diffDays = (now.getTime() - ms) / 86400000;
  return diffDays <= windowDays;
}

function catalogRowExamId(row) {
  return pickEdesisCatalogExamId(row) || String(row?.id ?? row?.examId ?? row?.sinavId ?? '').trim();
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
  if (subsetOfFull && studentIds.length < fullIds.size) {
    // Program dökümü (ör. 40/50 LGS) kişisel atama değildir
    const cap = Math.max(5, Math.floor(fullIds.size * 0.35));
    return studentIds.length <= cap;
  }

  // Farklı şekil ama kısa kişisel liste (program dökümü değil)
  const cap = Math.max(5, Math.floor((fullIds.size || full.length) * 0.35));
  if (studentIds.length < full.length && studentIds.length <= cap) return true;
  return false;
}

/** GET /exams?StudentId= — kısa alt küme (≤20); program dökümü değil, kişisel liste gibi */
export function looksLikePersonalExamList(fullRows, studentRows, maxSize = 20) {
  const student = Array.isArray(studentRows) ? studentRows : [];
  if (!student.length || student.length > maxSize) return false;
  const fullIds = new Set((fullRows || []).map(catalogRowExamId).filter(Boolean));
  const studentIds = [...new Set(student.map(catalogRowExamId).filter(Boolean))];
  if (!studentIds.length) return false;
  if (!fullIds.size) return true;
  if (studentIds.length >= fullIds.size) return false;
  return studentIds.every((id) => fullIds.has(id));
}

/** Edesis öğrenci kataloğu kişisel atama listesi sayılabilir mi */
export function trustEdesisStudentCatalogList(fullRows, studentRows) {
  return (
    catalogLooksStudentFiltered(fullRows, studentRows) ||
    looksLikePersonalExamList(fullRows, studentRows)
  );
}

function examWindowStillOpen(exam, now = new Date()) {
  const flat = flattenEdesisRow(exam);
  const end = Date.parse(flat.endDate || flat.bitisTarihi || flat.EndDate || '');
  if (Number.isFinite(end) && end < now.getTime() - 86400000) return false;
  const start = Date.parse(flat.startDate || flat.baslamaTarihi || flat.StartDate || '');
  if (Number.isFinite(start) && start > now.getTime() + 86400000) return false;
  return true;
}

function catalogResultStatus(exam) {
  const flat = flattenEdesisRow(exam);
  return String(getPropCi(flat, ['resultStatus', 'status']) || 'None').trim();
}

/** Canlı katalog DTO (v1.5) alanları: id,name,examDate,examType,studentCount,resultStatus,createdAt — ogrenciIds YOK */
export function collectRecentUnpublishedProgramExams(
  catalogRows = [],
  { programKeys = new Set(), now = new Date(), windowDays = 45, excludeExamIds = [] } = {}
) {
  const keys = programKeys instanceof Set ? programKeys : new Set(programKeys || []);
  const excluded = new Set([...(excludeExamIds || [])].map((id) => String(id).trim()).filter(Boolean));
  const out = [];
  for (const ex of catalogRows || []) {
    if (!isOpenEdesisCatalogExam(ex) || !examWindowStillOpen(ex, now)) continue;
    const status = catalogResultStatus(ex);
    if (!/^none$/i.test(status)) continue;
    const id = pickEdesisCatalogExamId(ex);
    if (!id || excluded.has(String(id))) continue;
    // Atanmış denemede tür bilinmiyorsa geçirilir; katalog yedeğinde hayır —
    // MAARİF 80 gibi tanımsız tür LGS öğrencisine sızmasın.
    if (!keys.size) continue;
    const examKeys = inferEdesisExamProgramKeys({
      examType: ex?.examType || ex?.sinavTuru,
      examName: ex?.name || ex?.examName || ex?.title || ex?.examTitle
    });
    if (!examKeys.size) continue;
    let programHit = false;
    for (const k of examKeys) {
      if (keys.has(k)) programHit = true;
    }
    if (!programHit) continue;
    if (!isRecentOpenCatalogExam(ex, now, windowDays)) continue;
    out.push(ex);
  }
  return out;
}

export function mergeEdesisCatalogExamsById(...groups) {
  const map = new Map();
  for (const rows of groups) {
    for (const ex of rows || []) {
      const id = pickEdesisCatalogExamId(ex);
      if (id && !map.has(id)) map.set(id, ex);
    }
  }
  return [...map.values()];
}

/** Katalog satırlarında ogrenciIds / studentIds ile doğrudan atanmış denemeler */
export function collectExplicitlyAssignedCatalogRows(catalogRows, scope = {}) {
  const out = [];
  for (const ex of catalogRows || []) {
    if (catalogExamAssignedToStudent(ex, scope) === true) out.push(ex);
  }
  return out;
}

function collectOnlineFlagAssignedRows(fullCatalog, studentCatalogRows) {
  const fullById = new Map();
  for (const ex of fullCatalog || []) {
    const id = pickEdesisCatalogExamId(ex);
    if (id) fullById.set(id, ex);
  }
  const out = [];
  for (const row of studentCatalogRows || []) {
    const id = pickEdesisCatalogExamId(row);
    const full = id ? fullById.get(id) : null;
    if (full && examAssignedViaOnlineFlag(row, full)) out.push(full);
  }
  return out;
}

function studentCatalogLooksAssignedSubset(fullRows, personalRows) {
  const full = Array.isArray(fullRows) ? fullRows : [];
  const personal = Array.isArray(personalRows) ? personalRows : [];
  if (!personal.length) return false;
  if (trustEdesisStudentCatalogList(full, personal)) return true;
  if (looksLikePersonalExamList(full, personal, 40)) return true;
  const fullIds = new Set(full.map(catalogRowExamId).filter(Boolean));
  const personalIds = [...new Set(personal.map(catalogRowExamId).filter(Boolean))];
  if (!personalIds.length) return false;
  if (fullIds.size && personalIds.length >= fullIds.size) return false;
  if (fullIds.size && !personalIds.every((id) => fullIds.has(id))) return false;
  // Çok sayıda kişisel atama (Safiye gibi 50+ deneme) — alt küme ise güven
  return personalIds.length <= 250;
}

/** GET /exams?StudentId= satırını tam katalog kaydı + online bayrak ile birleştir */
export function mapStudentCatalogRowsToAssigned(fullCatalog, studentCatalogRows, edesisStudentId) {
  const fullById = new Map();
  for (const ex of fullCatalog || []) {
    const id = pickEdesisCatalogExamId(ex);
    if (id) fullById.set(id, ex);
  }
  const out = [];
  for (const row of studentCatalogRows || []) {
    const id = pickEdesisCatalogExamId(row);
    const full = id ? fullById.get(id) : null;
    if (full && examAssignedViaOnlineFlag(row, full)) {
      out.push(full);
      continue;
    }
    if (catalogExamAssignedToStudent(row, { edesisStudentId }) === true) {
      out.push(full || row);
      continue;
    }
    if (id) out.push(full || row);
  }
  return out;
}

/**
 * GET /exams?StudentId= / ClassroomId= yanıtı gerçekten süzülmüş mü, yoksa tüm katalog dump’ı mı?
 * Dump ise false — sonraki sorguya (ClassroomId) geçilmeli.
 */
export function catalogQueryLooksFiltered(fullRows, filteredRows) {
  const filtered = Array.isArray(filteredRows) ? filteredRows : [];
  if (!filtered.length) return false;
  const full = Array.isArray(fullRows) ? fullRows : [];
  if (!full.length) return filtered.length > 0 && filtered.length <= 250;
  const fullIds = new Set(full.map(catalogRowExamId).filter(Boolean));
  const filteredIds = [...new Set(filtered.map(catalogRowExamId).filter(Boolean))];
  if (!filteredIds.length) return false;
  if (filteredIds.length >= fullIds.size) {
    const same = filteredIds.every((id) => fullIds.has(id));
    if (same) {
      // Küçük katalogda ClassroomId tüm listeyi dönebilir; büyük dump’ı reddet
      return fullIds.size <= 20;
    }
  }
  return true;
}

/**
 * Öğrenciye atanmış açık denemeler — GET /exams?StudentId= (ve yedek ClassroomId).
 * v1.5 resmi parametre listesinde yok; kurum API’si destekliyorsa kişisel alt küme döner.
 * fullCatalogRows verilirse StudentId’nin tüm katalog dump’ı reddedilip ClassroomId denenir.
 */
export async function fetchEdesisExamsCatalogForStudent(
  edesisStudentId,
  cfgOverride = {},
  { classroomId = '', fullCatalogRows = null } = {}
) {
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };
  const sid = String(edesisStudentId || '').trim();
  const cid = String(classroomId || '').trim();
  const queries = [];
  if (sid) {
    queries.push({ StudentId: sid }, { studentId: sid });
  }
  if (cid) {
    queries.push({ ClassroomId: cid }, { classroomId: cid }, { SinifId: cid }, { sinifId: cid });
  }
  let last = { rows: [], httpStatus: null, query: null, error: null };
  for (const q of queries) {
    try {
      const bulk = await fetchAllPaged(localCfg, V1_PATHS.exams, q);
      last = {
        rows: bulk.rows || [],
        httpStatus: bulk.response?.status ?? null,
        query: q,
        error: bulk.error || null
      };
      if (!last.rows.length) continue;
      if (fullCatalogRows && !catalogQueryLooksFiltered(fullCatalogRows, last.rows)) {
        continue;
      }
      return last;
    } catch (e) {
      last.error = e?.message || String(e);
    }
  }
  return last;
}

/** Yalnızca ClassroomId / SinifId sorgusu — StudentId dump’ından bağımsız */
export async function fetchEdesisExamsCatalogForClassroom(classroomId, cfgOverride = {}, fullCatalogRows = null) {
  const cid = String(classroomId || '').trim();
  if (!cid) return { rows: [], httpStatus: null, query: null, error: null };
  return fetchEdesisExamsCatalogForStudent('', cfgOverride, {
    classroomId: cid,
    fullCatalogRows
  });
}

/**
 * ClassroomId kataloğu: şubeye tanımlanmış açık denemeler.
 * Başka öğrenciye özel kısıtlanmışsa (ogrenciIds başka ID) dahil etme.
 */
export function collectClassroomAssignedCatalogRows({
  fullCatalog = [],
  classroomCatalogRows = [],
  edesisStudentId = '',
  classroomId = ''
} = {}) {
  const classroom = Array.isArray(classroomCatalogRows) ? classroomCatalogRows : [];
  if (!classroom.length) return [];
  const full = Array.isArray(fullCatalog) ? fullCatalog : [];
  // Büyük kurum dump’ı (ClassroomId yok sayılmış) — şube ataması sayma
  if (full.length > 20 && !catalogQueryLooksFiltered(full, classroom)) return [];

  const fullById = new Map();
  for (const ex of full) {
    const id = pickEdesisCatalogExamId(ex);
    if (id) fullById.set(id, ex);
  }
  const scope = { edesisStudentId, classroomId, requireStudentIdMatch: true, allowClassroomOnly: true };
  const out = [];
  for (const row of classroom) {
    if (!isOpenEdesisCatalogExam(row)) continue;
    const id = pickEdesisCatalogExamId(row);
    const fullRow = id ? fullById.get(id) || row : row;
    if (catalogExamAssignedToStudent(fullRow, scope) === false) continue;
    if (catalogExamAssignedToStudent(row, scope) === false) continue;
    out.push(fullRow);
  }
  return out;
}

/**
 * Öğrenci Sınava gir listesi — yalnızca Edesis’te bu öğrenci ID’sine tanımlı denemeler.
 */
export function resolveAssignedCatalogRowsForStudent({
  catalogRows = [],
  studentCatalogRows = [],
  classroomCatalogRows = [],
  edesisStudentId = '',
  classroomId = '',
  programKeys = new Set(),
  requireStudentIdMatch = true
} = {}) {
  const scope = { edesisStudentId, classroomId, requireStudentIdMatch, programKeys };
  let assigned = collectExplicitlyAssignedCatalogRows(catalogRows, scope);

  const full = catalogRows || [];
  const personal = studentCatalogRows || [];
  if (personal.length && studentCatalogLooksAssignedSubset(full, personal)) {
    assigned = mergeEdesisCatalogExamsById(
      assigned,
      mapStudentCatalogRowsToAssigned(full, personal, edesisStudentId)
    );
  }
  assigned = mergeEdesisCatalogExamsById(assigned, collectOnlineFlagAssignedRows(full, personal));
  assigned = mergeEdesisCatalogExamsById(
    assigned,
    collectClassroomAssignedCatalogRows({
      fullCatalog: full,
      classroomCatalogRows,
      edesisStudentId,
      classroomId
    })
  );
  // Program/None yedeği YOK — canlıda YKS öğrencisine tüm açık TYT’yi döküyordu.
  // Gerçek atama: ogrenciIds / StudentId alt kümesi / sınıf / ABP GetOgrenciSinavIds.
  return assigned;
}

/** Tek sınav detayı — ogrenciIds çoğu zaman yalnızca burada gelir */
export async function fetchEdesisExamCatalogRowDetail(examId, cfgOverride = {}) {
  const id = String(examId || '').trim();
  if (!id) return null;
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };
  const tryBody = (r) => {
    if (!r || !r.json) return null;
    if (r.json?._invalidBody) return null;
    const body =
      r.json?.result && typeof r.json.result === 'object' && !Array.isArray(r.json.result)
        ? r.json.result
        : r.json;
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
    return null;
  };
  try {
    const r = await fetchEdesisJson(localCfg, V1_PATHS.examById(id));
    if (isReachableEdesisResponse(r)) {
      const body = tryBody(r);
      if (body) return body;
    }
  } catch {
    /* ABP yedek */
  }
  try {
    const r = await fetchEdesisAbpJson(
      localCfg,
      `/api/services/app/Sinavs/GetSinavForView?id=${encodeURIComponent(id)}`
    );
    if (r.status !== 401 && r.status !== 403 && isReachableEdesisResponse(r)) {
      const body = tryBody(r);
      if (body) {
        // GetSinavForViewDto: classRoomIds üstte, ogrenciIds çoğunlukla sinav altında
        const nested = body.sinav || body.Sinav || body.exam || null;
        if (nested && typeof nested === 'object') {
          return { ...nested, ...body, id: body.id || nested.id };
        }
        return body;
      }
    }
  } catch {
    /* yok */
  }
  // Edit DTO’da ogrenciIds / isAllClasses net gelir (View’da bazen yok)
  try {
    const r = await fetchEdesisAbpJson(
      localCfg,
      `/api/services/app/Sinavs/GetSinavForEdit?id=${encodeURIComponent(id)}`
    );
    if (r.status !== 401 && r.status !== 403 && isReachableEdesisResponse(r)) {
      const body = tryBody(r);
      if (body) {
        const nested = body.sinav || body.Sinav || body.exam || null;
        if (nested && typeof nested === 'object') {
          return { ...nested, ...body, id: nested.id || body.id || id };
        }
        return body;
      }
    }
  } catch {
    /* yok */
  }
  return null;
}

/**
 * Katalog listesinde ogrenciIds yoksa:
 * admin sinavId listesi (ID’siz AP) + sınıf kataloğu + detay + GetOgrenciBySinavId roster + results.
 */
export async function resolveAssignedCatalogRowsForStudentAsync(params, cfgOverride = {}) {
  const {
    catalogRows = [],
    studentCatalogRows = [],
    classroomCatalogRows = [],
    edesisStudentId = '',
    classroomId = '',
    programKeys = new Set()
  } = params || {};
  const scope = { edesisStudentId, classroomId, requireStudentIdMatch: true };
  let assigned = resolveAssignedCatalogRowsForStudent({
    catalogRows,
    studentCatalogRows,
    classroomCatalogRows,
    edesisStudentId,
    classroomId,
    programKeys,
    requireStudentIdMatch: true
  });

  const adminDetail = await fetchEdesisOgrenciAssignedSinavIdsDetailed(edesisStudentId, cfgOverride);
  const adminSinavIds = adminDetail.ids || [];
  if (adminSinavIds.length) {
    assigned = mergeEdesisCatalogExamsById(
      assigned,
      collectCatalogRowsForSinavIds(catalogRows, adminSinavIds)
    );
    const knownAfterAdmin = new Set(assigned.map((ex) => pickEdesisCatalogExamId(ex)).filter(Boolean));
    const missingAdminIds = adminSinavIds.filter((id) => !knownAfterAdmin.has(String(id)));
    for (let i = 0; i < missingAdminIds.length; i += 6) {
      const batch = missingAdminIds.slice(i, i + 6);
      const details = await Promise.all(
        batch.map((id) => fetchEdesisExamCatalogRowDetail(id, cfgOverride))
      );
      assigned = mergeEdesisCatalogExamsById(
        assigned,
        details
          .map((detail, idx) => (detail ? { id: batch[idx], ...detail } : null))
          .filter(Boolean)
      );
    }
  }

  let known = new Set(assigned.map((ex) => pickEdesisCatalogExamId(ex)).filter(Boolean));
  // Admin ID gelse bile yayınlanmamış (None) yeni atamaları kaçırma —
  // OgrenciSinavListesi çoğu zaman yalnızca sonuçlu analiz geçmişidir.
  const abpUnauthorized = (adminDetail.attempts || []).some(
    (a) => a?.status === 401 || a?.status === 403 || a?.error === 'unauthorized'
  );
  const abpStatus = adminDetail?.abpAuth || getEdesisAbpAuthStatus();
  const skipAbpRoster =
    abpUnauthorized ||
    abpStatus?.cacheStatus === 'missing_credentials' ||
    abpStatus?.cacheStatus === 'auth_failed' ||
    abpStatus?.cacheStatus === 'auth_error';

  const keys = programKeys instanceof Set ? programKeys : new Set(programKeys || []);
  const adminProbeIds = new Set(
    (adminSinavIds || []).map((id) => String(id).trim()).filter(Boolean)
  );
  const fromAdminNotKnown = (catalogRows || []).filter((ex) => {
    const id = pickEdesisCatalogExamId(ex);
    return id && adminProbeIds.has(String(id)) && !known.has(String(id));
  });
  const programMatchStrict = (ex) => {
    if (!keys.size) return true;
    const examKeys = inferEdesisExamProgramKeys({
      examType: ex?.examType || ex?.sinavTuru,
      examName: ex?.name || ex?.examName || ex?.title || ex?.examTitle
    });
    if (!examKeys.size) return false;
    for (const k of examKeys) if (keys.has(k)) return true;
    return false;
  };

  // Yeni online tanım: resultStatus=None — katalog dökümü değil, dar probe adayı
  const unpublishedCandidates = collectRecentUnpublishedProgramExams(catalogRows || [], {
    programKeys: keys,
    now: new Date(),
    windowDays: 45,
    excludeExamIds: [...known]
  });

  const recencyCandidates =
    adminSinavIds.length > 0
      ? [] // Admin listesi varken Ready dump’ına girme; yalnızca unpublished + eksik admin
      : sortCatalogExamsByRecencyDesc(catalogRows || [])
          .filter((ex) => {
            const id = pickEdesisCatalogExamId(ex);
            if (!id || known.has(id)) return false;
            if (!isOpenEdesisCatalogExam(ex) || !examWindowStillOpen(ex)) return false;
            if (!programMatchStrict(ex)) return false;
            const status = catalogResultStatus(ex);
            if (!/^(none|ready|processing|pending)$/i.test(status)) return false;
            const quick = catalogExamAssignedToStudent(ex, scope);
            return quick !== false;
          })
          .slice(0, 24);

  const seenCandidateIds = new Set();
  const candidates = [];
  for (const ex of [...fromAdminNotKnown, ...unpublishedCandidates, ...recencyCandidates]) {
    const id = pickEdesisCatalogExamId(ex);
    if (!id || seenCandidateIds.has(String(id)) || known.has(String(id))) continue;
    seenCandidateIds.add(String(id));
    candidates.push(ex);
  }

  if (!candidates.length) {
    return {
      rows: assigned,
      adminAssignment: adminDetail,
      probeSkipped: true,
      probeSkipReason: adminSinavIds.length ? 'admin_ids_no_unpublished' : 'no_candidates',
      probeCandidateCount: 0
    };
  }

  let rosterApiAlive = !skipAbpRoster;
  const detailScope = { ...scope, allowClassroomOnly: true };
  const probeOne = async (ex) => {
    const id = pickEdesisCatalogExamId(ex);
    if (!id) return null;
    const detail = await fetchEdesisExamCatalogRowDetail(id, cfgOverride);
    const merged = detail ? { ...ex, ...detail } : ex;
    if (catalogExamAssignedToStudent(merged, detailScope) === true) return ex;
    // Kurum geneli online tanım (isAllClasses) + program eşleşmesi — yalnızca probe adayında
    const allFlag = getPropCi(flattenEdesisRow(merged), ['isAllClasses', 'allClasses', 'tumSiniflar']);
    if (
      (allFlag === true || allFlag === 'true' || allFlag === 1) &&
      programMatchStrict(merged) &&
      /^none$/i.test(catalogResultStatus(merged))
    ) {
      return ex;
    }
    if (catalogExamAssignedToStudent(merged, detailScope) === false) return null;
    if (rosterApiAlive && !skipAbpRoster) {
      const roster = await fetchEdesisExamRosterStudentIds(id, cfgOverride);
      if (roster === null) {
        rosterApiAlive = false;
      } else if (examRosterIncludesStudent(roster, edesisStudentId)) {
        return ex;
      } else if (roster.length > 0) {
        // Roster dolu ve öğrenci yok → bu deneme atanmamış
        return null;
      }
    }
    try {
      if (await fetchEdesisExamAssignedToStudent(id, edesisStudentId, cfgOverride)) return ex;
    } catch {
      /* yoksay */
    }
    return null;
  };

  for (let i = 0; i < candidates.length; i += 6) {
    const batch = candidates.slice(i, i + 6);
    const found = await Promise.all(batch.map(probeOne));
    assigned = mergeEdesisCatalogExamsById(assigned, found.filter(Boolean));
    known = new Set(assigned.map((ex) => pickEdesisCatalogExamId(ex)).filter(Boolean));
  }

  return {
    rows: assigned,
    adminAssignment: adminDetail,
    probeSkipped: false,
    probeSkipReason: null,
    probeCandidateCount: candidates.length
  };
}

/**
 * Henüz sonucu olmayan katalog denemesi.
 * requireExplicitAssignment=true iken yalnızca ogrenciIds / StudentId kataloğu ile atanmışlar.
 */
export function shouldOfferUntakenCatalogExam(exam, scope = {}, now = new Date()) {
  if (!exam || !isOpenEdesisCatalogExam(exam)) return false;
  if (!examWindowStillOpen(exam, now)) return false;
  const keys = scope.programKeys instanceof Set ? scope.programKeys : new Set(scope.programKeys || []);
  const assigned = catalogExamAssignedToStudent(exam, scope);
  if (assigned === false) return false;

  if (scope.requireExplicitAssignment) {
    if (assigned === true) {
      // Atama varsa program süzgeci uygulama (Edesis ne tanımladıysa)
      return true;
    }
    if (scope.assignedCatalogOnly) {
      // Admin/ID listesinden gelen satır — program uymasa da göster
      return true;
    }
    return false;
  }

  if (assigned === true) return true;
  if (keys.size && !edesisCatalogExamMatchesProgram(exam, keys)) return false;
  if (scope.assignedCatalogOnly) return true;

  const status = catalogResultStatus(exam);
  const noneOrProcessing = /^(none|processing|pending|open)?$/i.test(status);
  if (noneOrProcessing) {
    if (!keys.size) return false;
    if (!catalogExamRecencyMs(exam)) return true;
    return isRecentOpenCatalogExam(exam, now, 400);
  }
  if (/^ready$/i.test(status)) {
    if (!keys.size) return false;
    return isRecentOpenCatalogExam(exam, now, 90);
  }
  if (!scope.allowRecencyFallback) return false;
  return isRecentOpenCatalogExam(exam, now, OPEN_CATALOG_WINDOW_DAYS);
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
  'cdnUrl',
  'dicertoryUrl'
];

const SKIP_BOOKLET_URL_KEYS = /reporturl|statusurl|karne|analytics|thumbnail|imageurl|logo|avatar/i;

/** Edesis JSON bazen PascalCase döner */
function pickStrCi(obj, keys) {
  if (!obj || typeof obj !== 'object') return '';
  const entries = Object.entries(obj);
  for (const want of keys) {
    const hit = entries.find(([k]) => String(k).toLowerCase() === String(want).toLowerCase());
    if (hit && hit[1] != null && String(hit[1]).trim()) return String(hit[1]).trim();
  }
  return '';
}

export function collectEdesisBookletFiles(json, out = [], seen = new Set()) {
  if (!json || typeof json !== 'object') return out;
  if (seen.has(json)) return out;
  seen.add(json);
  if (Array.isArray(json)) {
    for (const it of json) collectEdesisBookletFiles(it, out, seen);
    return dedupeBookletFiles(out);
  }

  const bookletName = pickStrCi(json, ['bookletName']);
  const kitapcikFromName = normalizeKitapcikCode(bookletName);
  const kitapcikTuru =
    pickStrCi(json, ['kitapcikTuru', 'booklet', 'bookletType', 'bookletCode', 'kitapcik']) ||
    (['A', 'B', 'C', 'D'].includes(kitapcikFromName) ? kitapcikFromName : '') ||
    '';
  const name =
    pickStrCi(json, ['bookletName', 'fileName', 'filename', 'name', 'title']) || 'Kitapçık PDF';
  const mime = pickStrCi(json, ['mimeType', 'contentType', 'fileType', 'content_type', 'mime']).toLowerCase();

  const dedicated = pickStrCi(json, BOOKLET_URL_KEYS);
  const generic = pickStrCi(json, ['url', 'href', 'link']);
  let url = coerceFileUrl(dedicated);
  if (!url && generic && looksLikeBookletFile({ url: generic, mime, name, kitapcikTuru })) {
    url = coerceFileUrl(generic);
  }
  // Dosya DTO: fileExtension + guidId (sınav kökündeki guidId sınav kimliğidir — yalnız dosya alanında al)
  if (!url) {
    const ext = pickStrCi(json, ['fileExtension', 'extension']).toLowerCase();
    const hasFileShape = Boolean(
      pickStrCi(json, ['fileUrl', 'fileName', 'filename', 'dicertoryUrl', 'fileExtension', 'extension'])
    );
    const guid = pickStrCi(json, ['guidId', 'fileGuid', 'fileGuidId', 'fileId']);
    if (hasFileShape && guid && (!ext || ext.includes('pdf') || ext === 'bin')) {
      url = coerceFileUrl(guid);
    }
  }
  if (url) {
    out.push({ url, kitapcikTuru, name });
  }

  for (const [k, v] of Object.entries(json)) {
    if (typeof v === 'string' && /booklet|kitapcik|pdf|denemeurl|sinavurl|denemepdf|sinavpdf|fileurl/i.test(k) && !SKIP_BOOKLET_URL_KEYS.test(k)) {
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

export function extractEdesisFileGuid(value) {
  const m = String(value || '').match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  );
  return m ? m[0] : '';
}

/** API host dosya vermez; tenant web + CDN dener */
export function listEdesisFileBases(cfg = {}) {
  const merged = { ...getEdesisConfig(), ...cfg };
  const api = String(merged.baseUrl || '').replace(/\/+$/, '');
  const tenantWeb = api.replace(/\.api\.edesis\.com$/i, '.edesis.com');
  const fromCfgBases = Array.isArray(merged.bases)
    ? merged.bases.map((b) => String(b || '').replace(/\/+$/, '')).filter(Boolean)
    : [];
  const raw = [
    String(process.env.EDESIS_FILE_BASE_URL || '').replace(/\/+$/, ''),
    String(process.env.EDESIS_CDN_BASE_URL || '').replace(/\/+$/, ''),
    tenantWeb && tenantWeb !== api ? tenantWeb : '',
    'https://cdn.edesis.com',
    'https://files.edesis.com',
    ...fromCfgBases.map((b) => b.replace(/\.api\.edesis\.com$/i, '.edesis.com')),
    ...fromCfgBases,
    api
  ];
  const out = [];
  const seen = new Set();
  for (const b of raw) {
    if (!b || seen.has(b)) continue;
    seen.add(b);
    out.push(b);
  }
  return out;
}

export function expandEdesisFileUrlCandidates(fileUrl, cfg = {}) {
  const coerced = coerceFileUrl(fileUrl);
  const raw = String(fileUrl || '').trim();
  const out = [];
  const push = (u) => {
    const s = String(u || '').trim();
    if (!s || out.includes(s)) return;
    out.push(s);
  };

  const absolute = /^https?:\/\//i.test(coerced) ? coerced : /^https?:\/\//i.test(raw) ? raw : '';
  // External API sınav uçları — path’teki UUID sınav kimliğidir, dosya GUID’i değil
  if (absolute && /\/api\/external\/v1\/exams\//i.test(absolute)) {
    push(absolute);
    return out;
  }

  if (absolute) push(absolute);

  const bases = listEdesisFileBases(cfg);
  if (coerced.startsWith('/')) {
    for (const b of bases) push(`${b}${coerced}`);
  }

  const looksLikeFileRef =
    /^\/files\//i.test(coerced) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(raw) ||
    /\/files\//i.test(raw) ||
    /\.pdf(\?|$)/i.test(raw);
  const guid = looksLikeFileRef ? extractEdesisFileGuid(raw) || extractEdesisFileGuid(coerced) : '';
  if (guid) {
    for (const b of bases) {
      push(`${b}/files/${guid}`);
      push(`${b}/files/${guid}.pdf`);
    }
  }
  return out;
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

/** Kitapçık harfini tek forma getir (A–D; 1–4 sayısal kod yedeği) */
export function normalizeKitapcikCode(v) {
  const s = String(v || '')
    .trim()
    .toUpperCase();
  if (!s) return '';
  const aliases = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' };
  return aliases[s] || s;
}

function kitapcikCodesMatch(a, b) {
  const left = normalizeKitapcikCode(a);
  const right = normalizeKitapcikCode(b);
  if (!left || !right) return false;
  return left === right;
}

/** Edesis rehber: A/B/C/D aynı ders yapısı — structure satırlarını tekilleştir */
export function canonicalEdesisStructureLessons(structure) {
  const rows = Array.isArray(structure?.rows) ? structure.rows : [];
  const booklets = Array.isArray(structure?.booklets) ? structure.booklets : [];
  const all = [...rows];
  for (const b of booklets) {
    if (Array.isArray(b.lessons)) all.push(...b.lessons);
  }
  const byKey = new Map();
  for (const lesson of all) {
    const key = `${lesson.lessonId}:${lesson.dersGrupId}`;
    if (!byKey.has(key)) byKey.set(key, lesson);
  }
  return [...byKey.values()];
}

export function pickEdesisBookletLessons(structure, kitapcikTuru) {
  const rows = Array.isArray(structure?.rows) ? structure.rows : [];
  const booklets = Array.isArray(structure?.booklets) ? structure.booklets : [];
  const want = normalizeKitapcikCode(kitapcikTuru);

  if (want) {
    const matchedRows = rows.filter((r) => kitapcikCodesMatch(r.kitapcikTuru, want));
    if (matchedRows.length) return matchedRows;
    const matchedBook = booklets.find((b) => kitapcikCodesMatch(b.kitapcikTuru, want));
    if (matchedBook?.lessons?.length) return matchedBook.lessons;
    // Paylaşımlı structure — kitapcikTuru yalnızca ingest’te kullanılır
    return canonicalEdesisStructureLessons(structure);
  }

  return canonicalEdesisStructureLessons(structure);
}

export function listEdesisBookletCodes(structure) {
  const codes = new Set();
  for (const c of structure?.answerKeyBookletCodes || []) {
    const n = normalizeKitapcikCode(c);
    if (['A', 'B', 'C', 'D'].includes(n)) codes.add(n);
  }
  for (const f of structure?.bookletPdfs || []) {
    const c = normalizeKitapcikCode(f.kitapcikTuru);
    if (c) codes.add(c);
    const fromName = normalizeKitapcikCode(f.name || f.bookletName || '');
    if (['A', 'B', 'C', 'D'].includes(fromName)) codes.add(fromName);
  }
  for (const b of structure?.booklets || []) {
    const c = normalizeKitapcikCode(b.kitapcikTuru);
    if (c) codes.add(c);
  }
  for (const r of structure?.rows || []) {
    const c = normalizeKitapcikCode(r.kitapcikTuru);
    if (c) codes.add(c);
  }
  const sorted = [...codes].filter((c) => ['A', 'B', 'C', 'D'].includes(c)).sort();
  if (sorted.length > 1) return sorted;
  if (structure?.rows?.length || structure?.booklets?.length) {
    return ['A', 'B', 'C', 'D'];
  }
  return sorted.length ? sorted : ['A', 'B', 'C', 'D'];
}

function extractBookletCodesFromBookletsEndpoint(json) {
  const list = unwrapList(json);
  const codes = new Set();
  for (const item of list) {
    const fromName = normalizeKitapcikCode(pickStrCi(item, ['bookletName', 'name']));
    if (['A', 'B', 'C', 'D'].includes(fromName)) codes.add(fromName);
    const kt = normalizeKitapcikCode(pickStrCi(item, ['kitapcikTuru', 'booklet', 'bookletType', 'bookletCode']));
    if (['A', 'B', 'C', 'D'].includes(kt)) codes.add(kt);
  }
  return [...codes].sort();
}

async function fetchEdesisDenemeAnswerKeyBooklets(denemeId, localCfg) {
  const id = String(denemeId || '').trim();
  if (!id || !/^\d+$/.test(id)) return [];
  try {
    const r = await fetchEdesisJson(
      localCfg,
      `/api/services/app/Denemes/GetDenemeCevapAnahtariLst?id=${encodeURIComponent(id)}`
    );
    if (!isReachableEdesisResponse(r)) return [];
    const json =
      r.json?.result && typeof r.json.result === 'object' && !Array.isArray(r.json.result)
        ? r.json.result
        : r.json;
    const kitapciklar = json?.kitapciklar || json?.Kitapciklar || [];
    if (!Array.isArray(kitapciklar)) return [];
    return [
      ...new Set(
        kitapciklar
          .map((k) => normalizeKitapcikCode(pickStrCi(k, ['kitapcikTuru']) || k?.kitapcikTuru))
          .filter((c) => ['A', 'B', 'C', 'D'].includes(c))
      )
    ].sort();
  } catch {
    return [];
  }
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
  const candidates = expandEdesisFileUrlCandidates(fileUrl, cfg);
  if (candidates.length) return candidates[0];
  const s = coerceFileUrl(fileUrl);
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return s.startsWith('/') ? s : `/${s}`;
}

function dedupeBookletFiles(files) {
  const seen = new Map();
  for (const f of files || []) {
    if (!f?.url) continue;
    const key = `${String(f.kitapcikTuru || '').toUpperCase()}|${f.url}`;
    const prev = seen.get(key);
    if (!prev) {
      seen.set(key, f);
      continue;
    }
    // Buffer’lı / token’lı adayı tercih et
    if ((!prev.buf && f.buf) || (!prev.fileToken && f.fileToken)) {
      seen.set(key, { ...prev, ...f });
    }
  }
  return [...seen.values()];
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
  const subjects = src.subjects || src.dersler || src.lessonResults || src.dersSonuclari;
  if (Array.isArray(subjects) && subjects.length > 0) return true;
  const status = String(src.resultStatus || src.status || src.evaluationStatus || '').toLowerCase();
  return ['ready', 'completed', 'evaluated', 'published', 'success', 'done', 'finished', 'processed'].includes(
    status
  );
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
 * Öğrenciye gösterilecek denemeler (v1.5 rehber):
 * 1) GET /exams/results?studentId= satırları (girilmiş)
 * 2) GET /exams kataloğu — programı uyan, kapanmamış, henüz girilmemiş
 *    (API’de öğrenci/şube atama filtresi yoktur)
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
  now = new Date(),
  allowRecencyFallback = false,
  requireExplicitAssignment = false
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
  const strictAssignment = Boolean(requireExplicitAssignment);
  const assignedOnly =
    strictAssignment || (Array.isArray(assignedCatalogRows) && assignedCatalogRows.length > 0);
  const offerRows = strictAssignment
    ? assignedCatalogRows || []
    : assignedOnly && Array.isArray(assignedCatalogRows)
      ? assignedCatalogRows
      : catalogRows || [];
  const scope = {
    edesisStudentId,
    classroomId,
    programKeys: keys,
    assignedCatalogOnly: assignedOnly,
    allowRecencyFallback: Boolean(allowRecencyFallback) && !assignedOnly && !strictAssignment,
    requireExplicitAssignment: strictAssignment,
    requireStudentIdMatch: strictAssignment
  };
  for (const ex of offerRows) {
    const examId = pickEdesisCatalogExamId(ex);
    if (!examId || seen.has(examId)) continue;
    if (!shouldOfferUntakenCatalogExam(ex, scope, now)) continue;
    push(examId, catalogById.get(examId) || ex, null);
  }

  items.sort((a, b) => String(b.examDate || '').localeCompare(String(a.examDate || '')));
  // Girilmiş sonuçlar program süzgecinden geçmesin (YKS öğrencisi + YÖS denemesi vb.)
  const filtered = filterEdesisExamsForStudentProgram(items, keys, {
    keepSubmitted: true,
    keepTakeable: true
  });
  // Program süzgeci tüm girilebilir denemeleri silmesin (tür alanı boş atanmışlar)
  if (!filtered.length && items.some((x) => x.canTake)) return items;
  return filtered;
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
  const kitapcikRaw =
    pickStrCi(r, ['kitapcikTuru', 'booklet', 'bookletType', 'bookletCode', 'kitapcik']) || 'A';
  return {
    kitapcikTuru: normalizeKitapcikCode(kitapcikRaw) || 'A',
    lessonId: toEdesisInt(pickStrCi(r, ['lessonId']) || r.lessonId),
    lessonName: String(pickStrCi(r, ['lessonName', 'dersAdi', 'name']) || r.lessonName || r.dersAdi || r.name || '').trim(),
    dersGrupId: toEdesisInt(pickStrCi(r, ['dersGrupId']) || r.dersGrupId),
    questionCount: Number(pickStrCi(r, ['questionCount']) || r.questionCount) || 0
  };
}

function rowLooksLikeStructureLesson(row) {
  if (!row || typeof row !== 'object') return false;
  return (
    row.lessonId != null ||
    row.questionCount != null ||
    Boolean(pickStrCi(row, ['lessonName', 'dersAdi', 'name']))
  );
}

/** GET /structure ve /booklets yanıtlarından ders satırları çıkar */
export function extractEdesisStructureRows(json) {
  const flat = unwrapList(json);
  const lessonRows = flat.filter(rowLooksLikeStructureLesson);
  if (lessonRows.length) return lessonRows.map(normalizeEdesisStructureRow);

  const root =
    json?.result && typeof json.result === 'object' && !Array.isArray(json.result) ? json.result : json;
  const bookletsArr = root?.booklets || root?.Booklets || [];
  if (Array.isArray(bookletsArr) && bookletsArr.length) {
    const rows = [];
    for (const booklet of bookletsArr) {
      const kt =
        normalizeKitapcikCode(
          pickStrCi(booklet, ['kitapcikTuru', 'booklet', 'bookletType', 'bookletCode', 'kitapcik'])
        ) || 'A';
      const nestedLessons = Array.isArray(booklet.lessons)
        ? booklet.lessons
        : Array.isArray(booklet.dersler)
          ? booklet.dersler
          : unwrapList(booklet);
      for (const lesson of nestedLessons) {
        if (!rowLooksLikeStructureLesson(lesson)) continue;
        const lessonKt =
          normalizeKitapcikCode(
            pickStrCi(lesson, ['kitapcikTuru', 'booklet', 'bookletType', 'bookletCode', 'kitapcik'])
          ) || kt;
        rows.push(normalizeEdesisStructureRow({ ...lesson, kitapcikTuru: lessonKt }));
      }
    }
    if (rows.length) return rows;
  }

  return flat.map(normalizeEdesisStructureRow);
}

function mergeEdesisStructureRows(primary = [], secondary = []) {
  const byKey = new Map();
  for (const row of [...primary, ...secondary]) {
    const kt = normalizeKitapcikCode(row.kitapcikTuru) || 'A';
    const key = `${kt}:${row.lessonId}:${row.dersGrupId}:${row.lessonName}`;
    if (!byKey.has(key)) byKey.set(key, { ...row, kitapcikTuru: kt });
  }
  return [...byKey.values()];
}

export function groupEdesisStructureByBooklet(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const key = normalizeKitapcikCode(row.kitapcikTuru) || 'A';
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

/** GET /students/{id} — v1.5 §7.1; yoksa Filter yedeği */
export async function fetchEdesisStudentByOgrenciId(edesisStudentId, cfgOverride = {}) {
  const sid = String(edesisStudentId || '').trim();
  if (!sid) return null;
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };

  const mapStudent = (row) => {
    if (!row || typeof row !== 'object') return null;
    const r = flattenEdesisRow(row);
    const id = pickStrCi(r, ['id', 'studentId', 'ogrenciId']) || pickStr(r, ['id', 'studentId', 'ogrenciId']);
    return {
      id: id || sid,
      gradeName: pickStrCi(r, ['gradeName', 'sinifAdi', 'grade']) || '',
      className: pickStrCi(r, ['className', 'classroomName', 'subeAdi', 'sube']) || '',
      classroomId: pickStrCi(r, ['classroomId', 'sinifId']) || ''
    };
  };

  try {
    const r = await fetchEdesisJson(localCfg, `${V1_PATHS.students}/${encodeURIComponent(sid)}`);
    if (r.status !== 204 && isReachableEdesisResponse(r) && r.json) {
      const body = r.json.result && typeof r.json.result === 'object' && !Array.isArray(r.json.result)
        ? r.json.result
        : r.json;
      const mapped = mapStudent(body);
      if (mapped && (mapped.gradeName || mapped.className || mapped.classroomId || mapped.id)) {
        return mapped;
      }
    }
  } catch {
    /* liste yedeği */
  }

  const listed = await fetchEdesisStudentsList(cfgOverride, { Filter: sid });
  const hit = (listed.rows || []).find((row) => {
    const r = flattenEdesisRow(row);
    const id = pickStrCi(r, ['id', 'studentId', 'ogrenciId']) || pickStr(r, ['id', 'studentId', 'ogrenciId']);
    return id === sid;
  });
  return hit ? mapStudent(hit) : null;
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

/** GET /exams — v1.5 §7.4: yalnızca Filter + resultsUpdatedAfter (StudentId/ClassroomId yok) */
const examsCatalogCache = new Map();
const EXAMS_CATALOG_TTL_MS = 90_000;

export async function fetchEdesisExamsCatalog(cfgOverride = {}, query = {}) {
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };
  const q = {};
  if (query.Filter) q.Filter = query.Filter;
  if (query.resultsUpdatedAfter) q.resultsUpdatedAfter = query.resultsUpdatedAfter;
  const cacheKey = `${localCfg.baseUrl}|${JSON.stringify(q)}`;
  const hit = examsCatalogCache.get(cacheKey);
  if (hit && Date.now() - hit.at < EXAMS_CATALOG_TTL_MS) {
    return { ...hit.value, cached: true };
  }
  const bulk = await fetchAllPaged(localCfg, V1_PATHS.exams, q);
  const value = {
    rows: bulk.rows || [],
    totalCount: bulk.totalCount ?? bulk.rows?.length ?? 0,
    httpStatus: bulk.response?.status ?? null,
    error: bulk.error || null,
    cached: false
  };
  examsCatalogCache.set(cacheKey, { at: Date.now(), value });
  return value;
}

/** GET /exams/results?studentId= — v1.5 §7.5 (StudentId parametresi /exams/{id}/results’ta YOK) */
export async function fetchEdesisStudentResults(edesisStudentId, cfgOverride = {}, options = {}) {
  const sid = String(edesisStudentId || '').trim();
  if (!sid) throw new Error('edesis_student_id_required');
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };
  const enrichSubjects = options.enrichSubjects !== false;
  const dateRange = defaultDateRangeQuery();
  const extra = enrichSubjects ? EXAM_DETAIL_QUERY : {};
  let bulk = await fetchAllPaged(localCfg, V1_PATHS.examResults, {
    studentId: sid,
    startDate: dateRange.StartDate,
    endDate: dateRange.EndDate,
    ...dateRange,
    ...extra
  });
  if (!(bulk.rows || []).length) {
    bulk = await fetchAllPaged(localCfg, V1_PATHS.examResults, {
      StudentId: sid,
      ...dateRange,
      ...extra
    });
  }
  let rows = (bulk.rows || []).filter((row) => resultRowBelongsToStudent(row, sid));
  if (rows.length && enrichSubjects) {
    const enriched = await enrichEdesisRowsWithSubjectDetails(rows, localCfg, { maxStudents: 25 });
    rows = enriched.rows;
  }
  return {
    rows,
    totalCount: rows.length,
    httpStatus: bulk.response?.status ?? null,
    fetchMode: 'v1:exams/results?studentId',
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
  let rows = extractEdesisStructureRows(r.json);
  let bookletPdfs = collectEdesisBookletFiles(r.json);
  let bookletEndpointCodes = [];
  try {
    const bookletsRes = await fetchEdesisJson(localCfg, V1_PATHS.examBooklets(id));
    if (isReachableEdesisResponse(bookletsRes)) {
      bookletEndpointCodes = extractBookletCodesFromBookletsEndpoint(bookletsRes.json);
      const bookletRows = extractEdesisStructureRows(bookletsRes.json);
      if (bookletRows.length) rows = mergeEdesisStructureRows(rows, bookletRows);
      bookletPdfs = dedupeBookletFiles([...bookletPdfs, ...collectEdesisBookletFiles(bookletsRes.json)]);
    }
  } catch {
    /* /booklets yoksa structure yeter */
  }
  let examMeta = pickExamMetaFromJson(r.json);
  let denemeId = pickDenemeIdFromJson(r.json);
  try {
    const probed = await probeEdesisExamBookletSources(id, localCfg);
    examMeta = { ...examMeta, ...probed.examMeta };
    bookletPdfs = dedupeBookletFiles([...bookletPdfs, ...probed.files]);
    if (probed.denemeId) denemeId = probed.denemeId;
  } catch {
    /* kitapçık PDF yoksa yapı yine döner */
  }
  let answerKeyBookletCodes = [];
  if (denemeId) {
    answerKeyBookletCodes = await fetchEdesisDenemeAnswerKeyBooklets(denemeId, localCfg);
  }
  if (!answerKeyBookletCodes.length && bookletEndpointCodes.length) {
    answerKeyBookletCodes = bookletEndpointCodes;
  }
  const examFamily = detectEdesisExamFamily(examMeta.title, examMeta.examType);
  const ui = edesisOpticalUi(examFamily);
  const resolvedPdfs = bookletPdfs.map((f) => ({
    ...f,
    url: resolveEdesisFileUrl(f.url, localCfg) || f.url
  }));
  const bookletsGrouped = groupEdesisStructureByBooklet(rows);
  const structureCtx = {
    rows,
    booklets: bookletsGrouped,
    bookletPdfs: resolvedPdfs,
    answerKeyBookletCodes
  };
  return {
    rows,
    booklets: bookletsGrouped,
    availableBookletCodes: listEdesisBookletCodes(structureCtx),
    answerKeyBookletCodes,
    denemeId: denemeId || null,
    bookletPdfs: resolvedPdfs,
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

function pickDenemeIdFromJson(json) {
  if (!json || typeof json !== 'object') return '';
  const flat =
    json.result && typeof json.result === 'object' && !Array.isArray(json.result)
      ? { ...json, ...json.result }
      : { ...json };
  if (flat.sinav && typeof flat.sinav === 'object') Object.assign(flat, flat.sinav);
  if (flat.deneme && typeof flat.deneme === 'object') {
    const nestedId = pickStrCi(flat.deneme, ['id', 'denemeId']);
    if (nestedId) return nestedId;
  }
  return pickStrCi(flat, ['denemeId', 'denemeRefId', 'refDenemeId']);
}

/** examId dışı UUID/URL string’lerini kitapçık adayı say */
export function harvestLooseBookletRefs(json, examId = '', out = [], seen = new Set(), depth = 0) {
  if (json == null || depth > 10) return dedupeBookletFiles(out);
  if (typeof json === 'string') {
    const s = json.trim();
    if (!s || s === String(examId)) return dedupeBookletFiles(out);
    const coerced = coerceFileUrl(s);
    if (coerced && !seen.has(coerced)) {
      seen.add(coerced);
      out.push({ url: coerced, kitapcikTuru: '', name: 'harvest' });
    }
    return dedupeBookletFiles(out);
  }
  if (typeof json !== 'object') return dedupeBookletFiles(out);
  if (seen.has(json)) return dedupeBookletFiles(out);
  if (!Array.isArray(json)) seen.add(json);
  if (Array.isArray(json)) {
    for (const it of json) harvestLooseBookletRefs(it, examId, out, seen, depth + 1);
    return dedupeBookletFiles(out);
  }
  for (const [k, v] of Object.entries(json)) {
    if (/^(id|examId|sinavId|studentId|ogrenciId|classroomId|termId|donemId)$/i.test(k)) continue;
    // Sınav guidId dosya değil
    if (/^guidId$/i.test(k) && String(v) && !/deneme|file|pdf|url|kitap/i.test(k)) continue;
    if (typeof v === 'string') {
      const s = v.trim();
      if (!s || s === String(examId)) continue;
      const interesting =
        /deneme|sinav|booklet|kitapcik|pdf|file|url|cdn|blob|storage|guid|token/i.test(k) ||
        /^https?:\/\//i.test(s) ||
        extractEdesisFileGuid(s);
      if (!interesting) continue;
      const coerced = coerceFileUrl(s) || (extractEdesisFileGuid(s) ? `/files/${extractEdesisFileGuid(s)}` : '');
      if (coerced && !seen.has(coerced)) {
        seen.add(coerced);
        out.push({ url: coerced, kitapcikTuru: '', name: k });
      }
    } else if (v && typeof v === 'object') {
      harvestLooseBookletRefs(v, examId, out, seen, depth + 1);
    }
  }
  return dedupeBookletFiles(out);
}

function shouldAttachEdesisApiKey(url) {
  const u = String(url || '').toLowerCase();
  if (!u) return true;
  if (u.includes('blob.core.windows.net')) return false;
  if (u.includes('amazonaws.com') || u.includes('cloudfront.net')) return false;
  // CDN /files çoğu zaman imzasız veya cookie ister; API key göndermek bozabilir
  if (/cdn\.edesis\.com|files\.edesis\.com/.test(u) && u.includes('/files/')) return false;
  if (/\.edesis\.com\/files\//.test(u) && !u.includes('.api.edesis.com')) return false;
  return true;
}

async function tryResolveGuidViaFileView(guid, localCfg) {
  const id = String(guid || '').trim();
  if (!id) return null;
  const path = `/api/services/app/Files/GetFileForByGuidView?id=${encodeURIComponent(id)}`;
  try {
    const r = await fetchEdesisJson(localCfg, path);
    if (!isReachableEdesisResponse(r)) return null;
    const files = collectEdesisBookletFiles(r.json);
    if (files[0]?.url) return files[0];
    const dto = fileDtoFromJson(r.json);
    if (dto) {
      const downloaded = await tryDownloadEdesisFileDto(localCfg, dto);
      if (downloaded?.looksPdf && downloaded.buf) {
        return {
          url: downloaded.reportUrl || path,
          kitapcikTuru: '',
          name: dto.fileName || 'Kitapçık PDF',
          buf: downloaded.buf,
          contentType: 'application/pdf'
        };
      }
    }
  } catch {
    /* ABP X-API-Key ile 401 olabilir */
  }
  return null;
}

async function tryDenemeSorulariPdf(denemeId, localCfg) {
  const id = String(denemeId || '').trim();
  if (!id || !/^\d+$/.test(id)) return null;
  const path = `/api/services/app/Denemes/GetDenemeSorulariPdf?id=${encodeURIComponent(id)}`;
  try {
    const r = await fetchEdesisJson(localCfg, path, { timeoutMs: 55000 });
    const dto = fileDtoFromJson(r.json);
    if (dto) {
      const downloaded = await tryDownloadEdesisFileDto(localCfg, dto);
      if (downloaded?.looksPdf && downloaded.buf) {
        return {
          url: downloaded.reportUrl || path,
          kitapcikTuru: '',
          name: dto.fileName || 'Deneme Soruları PDF',
          buf: downloaded.buf,
          contentType: 'application/pdf',
          source: 'deneme-sorulari-pdf'
        };
      }
    }
    const files = collectEdesisBookletFiles(r.json);
    if (files[0]?.url) return { ...files[0], source: 'deneme-sorulari-pdf-url' };
  } catch {
    /* ignore */
  }
  return null;
}

async function probeEdesisExamBookletSources(examId, localCfg) {
  const id = String(examId || '').trim();
  const jsonPaths = [
    V1_PATHS.examById(id),
    V1_PATHS.examBooklets(id),
    V1_PATHS.examFiles(id),
    `/api/services/app/Sinavs/GetSinavForView?id=${encodeURIComponent(id)}`
  ];
  const pdfPaths = [
    V1_PATHS.examPdf(id),
    `${V1_PATHS.examPdf(id)}?kitapcikTuru=A`,
    `${V1_PATHS.examPdf(id)}?kitapcikTuru=B`
  ];
  const collected = [];
  let examMeta = {};
  let denemeId = '';

  const jsonResults = await Promise.all(jsonPaths.map((path) => fetchEdesisJson(localCfg, path)));
  for (let i = 0; i < jsonPaths.length; i += 1) {
    const path = jsonPaths[i];
    const r = jsonResults[i];
    if (
      (path === V1_PATHS.examById(id) || path.includes('GetSinavForView')) &&
      isReachableEdesisResponse(r)
    ) {
      examMeta = { ...examMeta, ...pickExamMetaFromJson(r.json) };
      const did = pickDenemeIdFromJson(r.json);
      if (did) denemeId = did;
    }
    if (responseLooksLikePdf(r) && r.url) {
      collected.push({ url: r.url, kitapcikTuru: '', name: 'Sınav PDF' });
      continue;
    }
    if (!isReachableEdesisResponse(r)) continue;
    collected.push(...collectEdesisBookletFiles(r.json));
    // Bilinmeyen alan adlarında gömülü UUID / URL (YÖS denemeUrl bazen farklı key)
    if (path === V1_PATHS.examById(id) || path.includes('GetSinavForView')) {
      collected.push(...harvestLooseBookletRefs(r.json, id));
    }
  }

  // PDF uçlarını Accept: pdf ile paralel dene
  const pdfGot = await Promise.all(
    pdfPaths.map(async (path) => {
      try {
        return await fetchEdesisUrlBuffer(joinUrl(localCfg.baseUrl, path), localCfg);
      } catch {
        return null;
      }
    })
  );
  for (const got of pdfGot) {
    if (!got) continue;
    if (got.ok && got.looksPdf) {
      collected.push({ url: got.url, kitapcikTuru: '', name: 'Sınav PDF' });
    } else if (got.ok && /json/i.test(String(got.contentType || ''))) {
      try {
        const json = JSON.parse(got.buf.toString('utf8'));
        collected.push(...collectEdesisBookletFiles(json));
        const dto = fileDtoFromJson(json);
        if (dto?.fileToken) {
          collected.push({
            url: `file-token:${dto.fileToken}`,
            kitapcikTuru: '',
            name: dto.fileName || 'Kitapçık PDF',
            fileToken: dto.fileToken,
            fileName: dto.fileName,
            fileType: dto.fileType
          });
        }
      } catch {
        /* ignore */
      }
    }
  }

  if (denemeId) {
    try {
      const denemeView = await fetchEdesisJson(
        localCfg,
        `/api/services/app/Denemes/GetDenemeForView?id=${encodeURIComponent(denemeId)}`
      );
      if (isReachableEdesisResponse(denemeView)) {
        collected.push(...collectEdesisBookletFiles(denemeView.json));
      }
    } catch {
      /* ignore */
    }
    const soruPdf = await tryDenemeSorulariPdf(denemeId, localCfg);
    if (soruPdf?.buf) {
      collected.push({
        url: soruPdf.url,
        kitapcikTuru: '',
        name: soruPdf.name,
        buf: soruPdf.buf,
        contentType: soruPdf.contentType
      });
    } else if (soruPdf?.url) {
      collected.push({ url: soruPdf.url, kitapcikTuru: '', name: soruPdf.name || 'Deneme PDF' });
    }
  }

  // GUID → Files/GetFileForByGuidView (en fazla 3)
  const guids = [];
  for (const f of collected) {
    const guid = extractEdesisFileGuid(f.url);
    if (guid && !guids.includes(guid)) guids.push(guid);
  }
  for (const guid of guids.slice(0, 3)) {
    const resolved = await tryResolveGuidViaFileView(guid, localCfg);
    if (!resolved) continue;
    if (resolved.buf) {
      collected.push({
        url: resolved.url,
        kitapcikTuru: '',
        name: resolved.name || 'Kitapçık PDF',
        buf: resolved.buf,
        contentType: resolved.contentType
      });
    } else if (resolved.url) {
      collected.push({
        url: resolved.url,
        kitapcikTuru: '',
        name: resolved.name || 'Kitapçık PDF'
      });
    }
  }

  return {
    files: dedupeBookletFiles(collected),
    examMeta,
    denemeId: denemeId || null
  };
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
  // file-token:xxx → DownloadTempFile
  const raw = String(fileUrl || '').trim();
  if (raw.startsWith('file-token:')) {
    const token = raw.slice('file-token:'.length);
    const downloaded = await tryDownloadEdesisFileDto(cfg, {
      fileToken: token,
      fileName: 'kitapcik.pdf',
      fileType: 'application/pdf'
    });
    if (downloaded?.looksPdf) {
      return {
        ok: true,
        status: 200,
        contentType: 'application/pdf',
        buf: downloaded.buf,
        url: downloaded.reportUrl || raw,
        looksPdf: true
      };
    }
  }

  const candidates = expandEdesisFileUrlCandidates(fileUrl, cfg);
  if (!candidates.length) throw new Error('pdf_url_missing');

  let last = null;
  let lastJson = null;
  for (const url of candidates) {
    const withKey = shouldAttachEdesisApiKey(url);
    try {
      const row = await fetchEdesisBufferFollowingRedirects(url, cfg, { withApiKey: withKey });
      last = row;
      if (row.ok && row.looksPdf) return row;
      if (row.ok && /json/i.test(String(row.contentType || '')) && !lastJson) lastJson = row;
    } catch {
      /* sonraki */
    }
  }
  return lastJson || last || {
    ok: false,
    status: 404,
    contentType: '',
    buf: Buffer.alloc(0),
    url: candidates[0],
    looksPdf: false
  };
}

/** 302→CDN sırasında X-API-Key taşınmasın (CDN PDF’yi reddedebilir) */
async function fetchEdesisBufferFollowingRedirects(startUrl, cfg, { withApiKey = true, maxHops = 6 } = {}) {
  let url = String(startUrl || '').trim();
  let useKey = withApiKey;
  let last = null;
  for (let hop = 0; hop < maxHops; hop += 1) {
    if (!url) break;
    const headers = useKey
      ? buildHeaders(cfg, { forGet: true })
      : { Accept: 'application/pdf,application/octet-stream,*/*' };
    headers.Accept = 'application/pdf,application/octet-stream,*/*';
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(45000),
      redirect: 'manual'
    });
    const status = res.status;
    if ([301, 302, 303, 307, 308].includes(status)) {
      const loc = res.headers.get('location');
      // body’yi tüket
      try {
        await res.arrayBuffer();
      } catch {
        /* ignore */
      }
      if (!loc) {
        last = {
          ok: false,
          status,
          contentType: res.headers.get('content-type') || '',
          buf: Buffer.alloc(0),
          url,
          looksPdf: false
        };
        break;
      }
      url = new URL(loc, url).toString();
      // Cross-host / CDN: API key gönderme
      useKey = shouldAttachEdesisApiKey(url) && useKey && /api\.edesis\.com/i.test(url);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || '';
    const looksPdf = looksLikePdfBuffer(buf);
    last = {
      ok: res.ok,
      status,
      contentType,
      buf,
      url,
      looksPdf
    };
    return last;
  }
  return (
    last || {
      ok: false,
      status: 404,
      contentType: '',
      buf: Buffer.alloc(0),
      url: startUrl,
      looksPdf: false
    }
  );
}

async function tryConsumeBookletDownload(got, files, file, localCfg, seen) {
  if (got.ok && got.looksPdf) {
    return {
      ok: true,
      files,
      file,
      buf: got.buf,
      contentType: got.contentType,
      url: got.url,
      looksPdf: true,
      status: got.status
    };
  }
  if (!(got.ok && /json/i.test(String(got.contentType || '')))) return null;
  try {
    const json = JSON.parse(got.buf.toString('utf8'));
    const dto = fileDtoFromJson(json);
    if (dto) {
      const downloaded = await tryDownloadEdesisFileDto(localCfg, dto);
      if (downloaded?.looksPdf && downloaded.buf) {
        return {
          ok: true,
          files,
          file,
          buf: downloaded.buf,
          contentType: 'application/pdf',
          url: downloaded.reportUrl || got.url,
          looksPdf: true,
          status: 200
        };
      }
    }
    for (const nested of collectEdesisBookletFiles(json)) {
      const nestedKey = String(nested.url || '').trim();
      if (!nestedKey || seen.has(nestedKey)) continue;
      seen.add(nestedKey);
      const nestedGot = await fetchEdesisUrlBuffer(nestedKey, localCfg);
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
  return null;
}

/** Kitapçık PDF’sini Edesis’ten indir (öğrenci paneli proxy’si) */
export async function loadEdesisExamBookletPdf(examId, kitapcikTuru, cfgOverride = {}, options = {}) {
  const id = String(examId || '').trim();
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  const preferredFileUrl = String(options.preferredFileUrl || cfgOverride.preferredFileUrl || '').trim();
  if (!id) {
    return { ok: false, status: 400, files: [], file: null, buf: null, looksPdf: false, url: '', attempts: [] };
  }
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');
  const localCfg = { ...cfg, baseUrl: cfg.baseUrl || cfg.bases[0] };
  const probed = await probeEdesisExamBookletSources(id, localCfg);
  const files = probed.files || [];
  const attempts = [];

  // Probe sırasında buffer’ı hazır gelen aday (GetDenemeSorulariPdf / GuidView)
  for (const f of files) {
    if (f?.buf && looksLikePdfBuffer(f.buf)) {
      return {
        ok: true,
        files,
        file: f,
        buf: f.buf,
        contentType: f.contentType || 'application/pdf',
        url: f.url,
        looksPdf: true,
        status: 200,
        denemeId: probed.denemeId,
        attempts
      };
    }
    if (f?.fileToken) {
      const downloaded = await tryDownloadEdesisFileDto(localCfg, {
        fileToken: f.fileToken,
        fileName: f.fileName || 'kitapcik.pdf',
        fileType: f.fileType || 'application/pdf'
      });
      attempts.push({
        kind: 'file-token',
        ok: Boolean(downloaded?.looksPdf),
        url: f.name || 'token'
      });
      if (downloaded?.looksPdf && downloaded.buf) {
        return {
          ok: true,
          files,
          file: f,
          buf: downloaded.buf,
          contentType: 'application/pdf',
          url: downloaded.reportUrl || f.url,
          looksPdf: true,
          status: 200,
          denemeId: probed.denemeId,
          attempts
        };
      }
    }
  }

  const file = pickEdesisBookletFile(files, kitapcikTuru);
  const kt = String(kitapcikTuru || '').trim();
  const tryUrls = [];
  if (preferredFileUrl) tryUrls.push(preferredFileUrl);
  if (file?.url) tryUrls.push(file.url);
  for (const f of files || []) {
    if (f?.url) tryUrls.push(f.url);
  }
  if (kt) tryUrls.push(joinUrl(localCfg.baseUrl, `${V1_PATHS.examPdf(id)}?kitapcikTuru=${encodeURIComponent(kt)}`));
  tryUrls.push(joinUrl(localCfg.baseUrl, V1_PATHS.examPdf(id)));
  tryUrls.push(joinUrl(localCfg.baseUrl, V1_PATHS.examFiles(id)));
  tryUrls.push(joinUrl(localCfg.baseUrl, V1_PATHS.examBooklets(id)));
  tryUrls.push(joinUrl(localCfg.baseUrl, V1_PATHS.examById(id)));
  if (probed.denemeId) {
    tryUrls.push(
      joinUrl(
        localCfg.baseUrl,
        `/api/services/app/Denemes/GetDenemeSorulariPdf?id=${encodeURIComponent(probed.denemeId)}`
      )
    );
  }
  tryUrls.push(
    joinUrl(localCfg.baseUrl, `/api/services/app/Sinavs/GetSinavForView?id=${encodeURIComponent(id)}`)
  );

  const seen = new Set();
  const seenRaw = new Set();
  for (const raw of tryUrls) {
    const key = String(raw || '').trim();
    if (!key || seenRaw.has(key)) continue;
    seenRaw.add(key);
    try {
      const got = await fetchEdesisUrlBuffer(key, localCfg);
      attempts.push({
        url: got.url || key,
        status: got.status,
        ok: got.ok,
        looksPdf: got.looksPdf,
        contentType: String(got.contentType || '').slice(0, 80)
      });
      const hit = await tryConsumeBookletDownload(got, files, file, localCfg, seen);
      if (hit) return { ...hit, denemeId: probed.denemeId, attempts };
    } catch (e) {
      attempts.push({ url: key, ok: false, error: e?.message || String(e) });
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
    contentType: '',
    denemeId: probed.denemeId,
    attempts: attempts.slice(0, 40)
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
