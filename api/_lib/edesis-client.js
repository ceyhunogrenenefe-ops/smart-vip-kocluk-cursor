/**
 * Edesis External API — yapılandırılabilir base URL ve endpoint denemesi.
 * Resmi doküman yoksa `probe` ile çalışan yolu bulunur; `EDESIS_EXAMS_PATH` ile sabitlenebilir.
 */

const DEFAULT_BASES = [
  'https://onlinevipdershane.api.edesis.com',
  'https://onlinevipdershane.edesis.com',
  'https://www.api.edesis.com'
];

const DEFAULT_EXAM_PATHS = [
  '/api/external/sinavs',
  '/api/external/sinavlar',
  '/api/ExternalApi/Sinavs',
  '/api/ExternalApi/Sinavlar',
  '/api/sinav/sinavs',
  '/api/sinav/sinavlar',
  '/api/services/sinav/sinavs',
  '/api/v1/sinav/sinavs',
  '/sinav/sinavs'
];

const DEFAULT_RESULTS_PATHS = [
  '/api/external/sinav-sonuclari',
  '/api/external/sinavsonuclari',
  '/api/external/SinavSonuclari',
  '/api/external/sinav-sonuclari/liste',
  '/api/external/ogrenci-sinav-sonuclari',
  '/api/external/deneme-sonuclari',
  '/api/external/exam-results',
  '/api/external/v1/sinav-sonuclari',
  '/api/ExternalApi/SinavSonuclari',
  '/api/ExternalApi/OgrenciSinavSonuclari'
];

const EMPTY_LIST_QUERY_SUFFIXES = [
  '',
  '&includeAll=true',
  '&tumSinavlar=true',
  '&externalOnly=false',
  '&paylasilan=true',
  '&durum=tamamlandi'
];

const EXAM_DETAIL_PATH_TEMPLATES = [
  '/api/external/sinavs/{id}/sonuclar',
  '/api/external/sinavs/{id}/ogrenciler',
  '/api/external/sinavlar/{id}/sonuclar',
  '/api/ExternalApi/Sinavs/{id}/Sonuclar',
  '/api/sinav/sinavs/{id}/sonuclar'
];

export function getEdesisConfig() {
  const apiKey = String(process.env.EDESIS_API_KEY || '').trim();
  const institutionCode = String(
    process.env.EDESIS_INSTITUTION_CODE || 'onlinevipdershane'
  ).trim();
  const baseUrl = String(process.env.EDESIS_API_BASE_URL || '').trim().replace(/\/+$/, '');
  const examsPath = String(process.env.EDESIS_EXAMS_PATH || '').trim();
  const authMode = String(process.env.EDESIS_AUTH_MODE || 'apikey').trim().toLowerCase();
  const resultsPath = String(process.env.EDESIS_RESULTS_PATH || '').trim();

  const bases = baseUrl ? [baseUrl] : DEFAULT_BASES;

  return {
    apiKey,
    institutionCode,
    baseUrl: baseUrl || bases[0],
    bases,
    examsPath,
    resultsPath,
    authMode,
    examPaths: examsPath
      ? [examsPath.startsWith('/') ? examsPath : `/${examsPath}`]
      : DEFAULT_EXAM_PATHS,
    resultPaths: resultsPath
      ? [resultsPath.startsWith('/') ? resultsPath : `/${resultsPath}`]
      : DEFAULT_RESULTS_PATHS
  };
}

function buildHeaders(cfg) {
  const h = {
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };
  if (cfg.institutionCode) {
    h['KurumKodu'] = cfg.institutionCode;
    h['X-Institution-Code'] = cfg.institutionCode;
  }
  if (!cfg.apiKey) return h;

  if (cfg.authMode === 'bearer') {
    h.Authorization = `Bearer ${cfg.apiKey}`;
  } else if (cfg.authMode === 'x-api-key' || cfg.authMode === 'apikey') {
    /* Edesis External API: "X-API-Key header is required" */
    h['X-API-Key'] = cfg.apiKey;
  } else {
    h['X-API-Key'] = cfg.apiKey;
    h.ApiKey = cfg.apiKey;
  }
  return h;
}

function joinUrl(base, path) {
  const b = String(base || '').replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

export async function fetchEdesisJson(cfg, path, { method = 'GET', body } = {}) {
  const url = joinUrl(cfg.baseUrl, path);
  const init = {
    method,
    headers: buildHeaders(cfg),
    signal: AbortSignal.timeout(25000)
  };
  if (body !== undefined && method !== 'GET') {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const sep = url.includes('?') ? '&' : '?';
  const withInst =
    cfg.institutionCode && !url.toLowerCase().includes('kurum')
      ? `${url}${sep}kurumKodu=${encodeURIComponent(cfg.institutionCode)}`
      : url;

  const res = await fetch(withInst, init);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text?.slice(0, 500) };
  }
  return { ok: res.ok, status: res.status, url: withInst, json, text: text?.slice(0, 300) };
}

function isEdesisErrorBody(json) {
  return Boolean(json && typeof json === 'object' && (json.error || json.unAuthorizedRequest));
}

/** Tüm base + path kombinasyonlarını dener */
export async function scanEdesisEndpoints(cfg) {
  const paths = [...cfg.resultPaths, ...cfg.examPaths];
  const attempts = [];
  let best = null;
  let firstReachable = null;

  for (const base of cfg.bases) {
    const localCfg = { ...cfg, baseUrl: base };
    for (const path of paths) {
      try {
        const r = await fetchWithEmptyFallback(localCfg, path);
        const rows = flattenEdesisRows(r.json);
        const apiErr = isEdesisErrorBody(r.json);
        const entry = {
          baseUrl: base,
          path,
          status: r.status,
          httpOk: r.ok,
          apiError: apiErr ? String(r.json?.error || 'api_error') : null,
          rowCount: rows.length,
          jsonShape: describeEdesisJson(r.json),
          sample: rows[0] ?? (apiErr ? r.json : null)
        };
        attempts.push(entry);

        const reachable = r.ok && !apiErr;
        if (reachable && !firstReachable) {
          firstReachable = { baseUrl: base, path, rowCount: rows.length };
        }
        if (reachable && (!best || rows.length > best.rowCount)) {
          best = { baseUrl: base, path, rowCount: rows.length, jsonShape: entry.jsonShape };
        }
      } catch (e) {
        attempts.push({
          baseUrl: base,
          path,
          httpOk: false,
          error: e?.message || String(e)
        });
      }
    }
  }

  return { attempts, best, firstReachable };
}

/** Bağlantı testi — 200 + geçerli JSON yeterli (boş liste de OK) */
export async function probeEdesisApi() {
  const cfg = getEdesisConfig();
  if (!cfg.apiKey) {
    return { ok: false, error: 'EDESIS_API_KEY_missing', attempts: [] };
  }

  const { attempts, best, firstReachable } = await scanEdesisEndpoints(cfg);
  const hit = best || firstReachable;

  if (!hit) {
    return {
      ok: false,
      error: 'no_working_endpoint',
      hint: '401/403: EDESIS_API_KEY veya EDESIS_AUTH_MODE=x-api-key kontrol edin',
      attempts
    };
  }

  return {
    ok: true,
    connected: true,
    baseUrl: hit.baseUrl,
    path: hit.path,
    rowCount: hit.rowCount ?? 0,
    hasData: (hit.rowCount ?? 0) > 0,
    warning:
      (hit.rowCount ?? 0) === 0
        ? 'API bağlantısı çalışıyor ama liste boş — EDESIS_RESULTS_PATH veya JSON içe aktar'
        : null,
    authMode: cfg.authMode,
    institutionCode: cfg.institutionCode,
    attempts
  };
}

const LIST_KEYS = [
  'items',
  'data',
  'result',
  'sinavlar',
  'sinavs',
  'Sinavlar',
  'Sinavs',
  'exams',
  'liste',
  'Liste',
  'records',
  'rows',
  'values',
  'content',
  'ogrenciler',
  'sinavSonuclari',
  'SinavSonuclari',
  'sonuclar',
  'results'
];

function isRecordArray(arr) {
  return (
    Array.isArray(arr) &&
    arr.length > 0 &&
    arr.every((x) => x && typeof x === 'object' && !Array.isArray(x))
  );
}

/** JSON içindeki en büyük nesne dizisini bul (ABP / farklı sarmalayıcılar) */
function deepFindRecordArray(node, depth = 0) {
  if (!node || depth > 6) return [];
  if (isRecordArray(node)) return node;
  if (typeof node !== 'object') return [];

  let best = [];
  for (const v of Object.values(node)) {
    if (Array.isArray(v) && isRecordArray(v) && v.length > best.length) {
      best = v;
    }
  }
  if (best.length) return best;

  for (const v of Object.values(node)) {
    if (v && typeof v === 'object') {
      const found = deepFindRecordArray(v, depth + 1);
      if (found.length > best.length) best = found;
    }
  }
  return best;
}

function unwrapList(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;

  for (const k of LIST_KEYS) {
    const v = json[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') {
      const nested = unwrapList(v);
      if (nested.length) return nested;
    }
  }

  if (json.result != null && typeof json.result === 'object') {
    const fromResult = unwrapList(json.result);
    if (fromResult.length) return fromResult;
  }

  return deepFindRecordArray(json);
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
  return { type: 'object', keys, hint, unwrappedLength: unwrapList(json).length };
}

function pathWithPaging(path, extraQuery = '') {
  let p = path;
  if (!/MaxResultCount/i.test(p)) {
    const sep = p.includes('?') ? '&' : '?';
    p = `${p}${sep}MaxResultCount=5000&SkipCount=0`;
  }
  if (extraQuery) {
    p += extraQuery.startsWith('&') ? extraQuery : `&${extraQuery}`;
  }
  return p;
}

/** Boş [] dönünce alternatif query string dene */
async function fetchWithEmptyFallback(cfg, path) {
  let last = null;
  for (const suffix of EMPTY_LIST_QUERY_SUFFIXES) {
    const r = await fetchEdesisJson(cfg, pathWithPaging(path, suffix.replace(/^&/, '')));
    last = r;
    const rows = flattenEdesisRows(r.json);
    if (r.ok && !isEdesisErrorBody(r.json) && rows.length > 0) {
      return { ...r, usedQuery: suffix || '(varsayılan)' };
    }
  }
  return last;
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

/** Edesis kaydını uygulama ExamResult taslağına çevirir (esnek alan adları). */
export function mapEdesisRowToExamDraft(row, { studentId, institutionId }) {
  const edesisId = pickStr(row, ['id', 'sinavId', 'sinav_id', 'examId', 'guid']);
  const examName = pickStr(row, ['sinavAdi', 'sinav_adi', 'examName', 'name', 'title']) || 'TYT';
  const examDate =
    pickStr(row, ['sinavTarihi', 'sinav_tarihi', 'examDate', 'date', 'tarih']) ||
    new Date().toISOString().slice(0, 10);

  let subjects = [];
  const rawSubs = row.dersler || row.subjects || row.konular || row.branches;
  if (Array.isArray(rawSubs)) {
    subjects = rawSubs.map((s) => ({
      name: pickStr(s, ['dersAdi', 'name', 'subject', 'ders']) || 'Genel',
      net: num(s.net ?? s.Net ?? s.netSayisi),
      correct: num(s.dogru ?? s.correct ?? s.d),
      wrong: num(s.yanlis ?? s.wrong ?? s.y),
      blank: num(s.bos ?? s.blank ?? s.b)
    }));
  }

  const totalNet = num(
    row.toplamNet ?? row.totalNet ?? row.net ?? row.genelNet,
    subjects.reduce((a, s) => a + s.net, 0)
  );

  if (!subjects.length && totalNet > 0) {
    subjects = [
      {
        name: examName,
        net: totalNet,
        correct: num(row.dogru ?? row.correct),
        wrong: num(row.yanlis ?? row.wrong),
        blank: num(row.bos ?? row.blank)
      }
    ];
  }

  const examType = normalizeExamType(
    pickStr(row, ['sinavTuru', 'examType', 'tur', 'tip']) || examName
  );

  const id = edesisId
    ? `edesis-${edesisId}-${studentId}`
    : `edesis-${studentId}-${examDate}-${examType}`.replace(/\s+/g, '_');

  return {
    id,
    studentId,
    examType,
    examDate: examDate.slice(0, 10),
    source: 'edesis',
    totalNet,
    subjects,
    notes: `Edesis import${edesisId ? ` #${edesisId}` : ''}`,
    createdAt: new Date().toISOString(),
    institutionId
  };
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

function mergeOgrenciFields(row) {
  if (!row || typeof row !== 'object') return row || {};
  const nested = row.ogrenci || row.Ogrenci || row.student || row.katilimci || row.Katilimci;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return { ...row, ...nested };
  }
  return row;
}

export function studentMatchKeysFromEdesisRow(row) {
  const r = mergeOgrenciFields(row);
  const ad = pickStr(r, ['adi', 'ad', 'firstName', 'ogrenciAd', 'ogrenci_ad']);
  const soyad = pickStr(r, ['soyadi', 'soyad', 'lastName', 'ogrenciSoyad', 'ogrenci_soyad']);
  let name = pickStr(r, [
    'ogrenciAdi',
    'ogrenci_adi',
    'ogrenciAdSoyad',
    'adSoyad',
    'ad_soyad',
    'studentName',
    'name',
    'adiSoyadi',
    'adi_soyadi',
    'tamAd',
    'tam_ad',
    'ogrenciTamAdi'
  ]);
  if (!name && (ad || soyad)) name = `${ad} ${soyad}`.trim();

  return {
    edesisStudentId: pickStr(r, [
      'ogrenciId',
      'ogrenci_id',
      'ogrenciID',
      'studentId',
      'student_id',
      'kullaniciId',
      'kullanici_id',
      'userId'
    ]),
    email: normalizeEmail(
      pickStr(r, [
        'email',
        'ePosta',
        'eposta',
        'mail',
        'e_mail',
        'ogrenciEmail',
        'ogrenci_email',
        'studentEmail',
        'kullaniciEmail'
      ])
    ),
    phone: pickStr(r, [
      'telefon',
      'phone',
      'gsm',
      'cepTelefonu',
      'cep_telefonu',
      'ogrenciTelefon',
      'ogrenci_telefon'
    ]).replace(/\D/g, ''),
    parentPhone: pickStr(r, ['veliTelefon', 'veli_telefon', 'parentPhone', 'parent_phone']).replace(
      /\D/g,
      ''
    ),
    tc: pickStr(r, ['tcKimlik', 'tc_kimlik', 'tcNo', 'tc', 'tckn', 'kimlikNo']),
    schoolNo: pickStr(r, ['okulNo', 'okul_no', 'ogrenciNo', 'ogrenci_no', 'numara']),
    name
  };
}

/** Sınav listesi içinde gömülü öğrenci/sonuç dizilerini satıra çevirir */
export function flattenEdesisRows(json) {
  const list = unwrapList(json);
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const nestedKeys = [
      'ogrenciler',
      'Ogrenciler',
      'ogrenciListesi',
      'ogrenci_listesi',
      'sinavSonuclari',
      'SinavSonuclari',
      'sinav_sonuclari',
      'ogrenciSinavlari',
      'ogrenci_sinavlari',
      'sonuclar',
      'Sonuclar',
      'results',
      'ogrenciNetleri',
      'katilimcilar',
      'Katilimcilar',
      'katilimciListesi',
      'data'
    ];
    let expanded = false;
    for (const k of nestedKeys) {
      const nested = item[k];
      if (!Array.isArray(nested) || !nested.length) continue;
      expanded = true;
      const sinavId = pickStr(item, ['id', 'sinavId', 'sinav_id']);
      const sinavAdi = pickStr(item, ['sinavAdi', 'sinav_adi', 'name', 'title']);
      const sinavTarihi = pickStr(item, ['sinavTarihi', 'sinav_tarihi', 'date', 'tarih']);
      for (const sub of nested) {
        out.push({
          ...item,
          ...sub,
          sinavId: pickStr(sub, ['sinavId', 'sinav_id']) || sinavId,
          sinavAdi: pickStr(sub, ['sinavAdi', 'sinav_adi']) || sinavAdi,
          sinavTarihi: pickStr(sub, ['sinavTarihi', 'sinav_tarihi', 'tarih']) || sinavTarihi
        });
      }
    }
    if (!expanded) out.push(item);
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

/** "Ahmet Yılmaz" ve "Yılmaz Ahmet" aynı anahtara düşsün */
export function nameLookupKeys(name) {
  const n = normalizePersonName(name);
  if (!n) return [];
  const tokens = n.split(' ').filter((t) => t.length > 1);
  const keys = new Set([n]);
  if (tokens.length >= 2) {
    keys.add([...tokens].sort().join(' '));
    keys.add(`${tokens[0]} ${tokens[tokens.length - 1]}`);
    keys.add(`${tokens[tokens.length - 1]} ${tokens[0]}`);
    if (tokens.length >= 3) {
      keys.add(`${tokens[0]} ${tokens[tokens.length - 1]}`);
    }
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

async function tryFetchPaths(cfg, paths, label, { requireStudentFields = false } = {}) {
  let best = null;
  for (const path of paths) {
    try {
      const r = await fetchWithEmptyFallback(cfg, path);
      if (!r.ok) continue;
      const rows = flattenEdesisRows(r.json);
      if (!rows.length) continue;
      const withStudent = countRowsWithStudents(rows);
      if (requireStudentFields && withStudent === 0) {
        if (!best || rows.length > best.rows.length) {
          best = { rows, path, label, jsonShape: describeEdesisJson(r.json), withStudent: 0 };
        }
        continue;
      }
      return { rows, path, label, jsonShape: describeEdesisJson(r.json), withStudent };
    } catch {
      /* next */
    }
  }
  return best;
}

async function fetchExamDetailRows(cfg, examList, limit = 25) {
  const ids = [];
  for (const item of examList.slice(0, 80)) {
    const id = pickStr(item, ['id', 'sinavId', 'sinav_id', 'guid']);
    if (id && !ids.includes(id)) ids.push(id);
    if (ids.length >= limit) break;
  }

  const merged = [];
  for (const id of ids) {
    for (const tpl of EXAM_DETAIL_PATH_TEMPLATES) {
      const path = tpl.replace('{id}', encodeURIComponent(id));
      try {
        const r = await fetchEdesisJson(cfg, path);
        if (!r.ok) continue;
        const rows = flattenEdesisRows(r.json);
        if (rows.length && countRowsWithStudents(rows) > 0) {
          merged.push(...rows);
          break;
        }
      } catch {
        /* next */
      }
    }
  }
  return merged;
}

export async function fetchEdesisExamList(cfgOverride = {}) {
  const cfg = { ...getEdesisConfig(), ...cfgOverride };
  if (!cfg.apiKey) throw new Error('EDESIS_API_KEY_missing');

  let baseUrl = cfg.baseUrl || cfg.bases[0];
  let examsPath = cfg.examsPath;
  let rawJson = null;
  let httpStatus = null;
  let jsonShape = null;
  let fetchMode = 'exams';
  const localCfg = { ...cfg, baseUrl };

  /* 1) Önce sonuç endpoint'leri (öğrenci adı / net burada) */
  const resultsHit = await tryFetchPaths(localCfg, cfg.resultPaths, 'results', {
    requireStudentFields: true
  });
  if (resultsHit?.withStudent > 0) {
    return packFetchResult(resultsHit, baseUrl, resultsHit.path, `results:${resultsHit.path}`);
  }

  /* 2) Sınav listesi */
  if (cfg.examsPath && cfg.baseUrl) {
    const r = await fetchWithEmptyFallback(cfg, cfg.examsPath);
    httpStatus = r.status;
    baseUrl = cfg.baseUrl;
    examsPath = cfg.examsPath;
    if (!r.ok || isEdesisErrorBody(r.json)) {
      return {
        rows: [],
        baseUrl,
        path: examsPath,
        fetchMode: 'error',
        httpStatus: r.status,
        jsonShape: describeEdesisJson(r.json),
        rowsWithStudentFields: 0,
        sampleRowKeys: [],
        apiHint: String(r.json?.error || `HTTP ${r.status} — key veya path hatalı`)
      };
    }
    rawJson = r.json;
    jsonShape = describeEdesisJson(r.json);
  } else {
    const scan = await scanEdesisEndpoints(cfg);
    const hit = scan.best || scan.firstReachable;
    if (!hit) {
      return {
        rows: [],
        baseUrl: cfg.baseUrl,
        path: null,
        fetchMode: 'none',
        httpStatus: null,
        jsonShape: null,
        rowsWithStudentFields: 0,
        sampleRowKeys: [],
        apiHint: 'Edesis endpoint bulunamadı — Vercel EDESIS_API_KEY, EDESIS_API_BASE_URL, EDESIS_AUTH_MODE=x-api-key',
        probeAttempts: scan.attempts.slice(0, 8)
      };
    }
    baseUrl = hit.baseUrl;
    examsPath = hit.path;
    const r = await fetchEdesisJson(
      { ...cfg, baseUrl, examsPath: hit.path },
      pathWithPaging(hit.path)
    );
    httpStatus = r.status;
    if (!r.ok || isEdesisErrorBody(r.json)) {
      return {
        rows: [],
        baseUrl,
        path: examsPath,
        fetchMode: 'error',
        httpStatus: r.status,
        jsonShape: describeEdesisJson(r.json),
        rowsWithStudentFields: 0,
        sampleRowKeys: [],
        apiHint: String(r.json?.error || `HTTP ${r.status}`),
        probeAttempts: scan.attempts.slice(0, 8)
      };
    }
    rawJson = r.json;
    jsonShape = hit.jsonShape || describeEdesisJson(r.json);
  }

  const cfg2 = { ...cfg, baseUrl, examsPath };
  let rows = flattenEdesisRows(rawJson);
  const list = unwrapList(rawJson);
  fetchMode = 'exams';

  let withStudent = countRowsWithStudents(rows);
  if (rows.length && withStudent < Math.max(1, Math.floor(rows.length * 0.2))) {
    const altResults = await tryFetchPaths(cfg2, cfg.resultPaths, 'results');
    if (altResults?.rows?.length) {
      rows = altResults.rows;
      fetchMode = `results:${altResults.path}`;
      withStudent = countRowsWithStudents(rows);
      jsonShape = altResults.jsonShape || jsonShape;
    } else {
      const detailRows = await fetchExamDetailRows(cfg2, list.length ? list : rows);
      if (detailRows.length) {
        rows = detailRows;
        fetchMode = 'exam_details';
        withStudent = countRowsWithStudents(rows);
      }
    }
  }

  if (!rows.length) {
    const altExams = await tryFetchPaths(cfg2, cfg.examPaths, 'exams');
    if (altExams?.rows?.length) {
      rows = altExams.rows;
      examsPath = altExams.path;
      fetchMode = `alt_exams:${altExams.path}`;
      jsonShape = altExams.jsonShape || jsonShape;
      withStudent = countRowsWithStudents(rows);
    }
  }

  return {
    rows,
    baseUrl,
    path: examsPath,
    fetchMode,
    httpStatus,
    jsonShape,
    rowsWithStudentFields: countRowsWithStudents(rows),
    sampleRowKeys:
      rows[0] && typeof rows[0] === 'object'
        ? Object.keys(rows[0]).slice(0, 25)
        : [],
    apiHint:
      rows.length === 0
        ? 'Edesis API bağlantısı OK ama 0 kayıt. Panel: External Api paketinde sınav paylaşımı + Vercel EDESIS_RESULTS_PATH=/api/external/sinav-sonuclari — veya JSON içe aktar.'
        : withStudent === 0
          ? 'Sınav satırı var, öğrenci/net yok — EDESIS_RESULTS_PATH=/api/external/sinav-sonuclari'
          : null
  };
}

export const EDESIS_EMPTY_LIST_HELP = {
  tr: {
    title: 'Edesis boş liste döndürüyorsa',
    steps: [
      'Edesis panel → Ayarlar / External Api (veya Entegrasyon) → API key aktif ve kurum kodu onlinevipdershane',
      'Sınavlar listesinde ilgili denemelerde “External API / Dış paylaşım / Entegrasyon” kutusu varsa işaretleyin (her sınav için)',
      'Vercel: EDESIS_RESULTS_PATH=/api/external/sinav-sonuclari ve EDESIS_AUTH_MODE=x-api-key → Redeploy',
      'Edesis destek (bilgi@sinavza.com): “External API hangi path ile öğrenci sınav sonuçlarını döndürür?”',
      'Hemen veri için: Edesis sınav sonuç Excel/JSON export → Smart Koçluk Ayarlar → JSON içe aktar'
    ]
  }
};

function packFetchResult(hit, baseUrl, path, fetchMode) {
  const rows = hit.rows;
  return {
    rows,
    baseUrl,
    path,
    fetchMode,
    httpStatus: 200,
    jsonShape: hit.jsonShape,
    rowsWithStudentFields: hit.withStudent ?? countRowsWithStudents(rows),
    sampleRowKeys:
      rows[0] && typeof rows[0] === 'object'
        ? Object.keys(rows[0]).slice(0, 25)
        : [],
    apiHint: null
  };
}
