/**
 * Edesis API keşif — swagger + bilinen path'ler + canlı istek
 * Kullanım: node scripts/edesis-discover.mjs
 * Env: EDESIS_API_KEY, EDESIS_API_BASE_URL, EDESIS_INSTITUTION_CODE, EDESIS_AUTH_MODE
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

for (const f of ['.env.edesis.live', '.env.local', '.env']) {
  try {
    dotenv.config({ path: path.join(root, f) });
  } catch {
    /* ignore */
  }
}

const apiKey = String(process.env.EDESIS_API_KEY || '').trim();
const institutionCode = String(process.env.EDESIS_INSTITUTION_CODE || 'onlinevipdershane').trim();
const baseUrl = String(process.env.EDESIS_API_BASE_URL || 'https://onlinevipdershane.api.edesis.com')
  .trim()
  .replace(/\/+$/, '');
const authMode = String(process.env.EDESIS_AUTH_MODE || 'x-api-key').trim().toLowerCase();

if (!apiKey) {
  console.error('EDESIS_API_KEY missing — set env or use .env.edesis.live');
  process.exit(1);
}

function headers() {
  const h = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    KurumKodu: institutionCode,
    'X-Institution-Code': institutionCode
  };
  if (authMode === 'bearer') h.Authorization = `Bearer ${apiKey}`;
  else h['X-API-Key'] = apiKey;
  return h;
}

async function tryGet(pathStr, extraQuery = '') {
  let url = `${baseUrl}${pathStr.startsWith('/') ? pathStr : `/${pathStr}`}`;
  const sep = url.includes('?') ? '&' : '?';
  if (!url.toLowerCase().includes('kurum') && institutionCode) {
    url += `${sep}kurumKodu=${encodeURIComponent(institutionCode)}`;
  }
  if (extraQuery) url += (url.includes('?') ? '&' : '?') + extraQuery.replace(/^\?|^&/, '');

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: headers(),
      signal: AbortSignal.timeout(20000)
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { _raw: text?.slice(0, 200) };
    }
    const err = json?.error || json?.unAuthorizedRequest;
    const listLen = countRows(json);
    return {
      path: pathStr,
      status: res.status,
      ok: res.ok && !err,
      apiError: err ? String(err).slice(0, 120) : null,
      listLen,
      shape: describe(json),
      sampleKeys: sampleKeys(json)
    };
  } catch (e) {
    return { path: pathStr, ok: false, error: e?.message || String(e) };
  }
}

function describe(json) {
  if (json == null) return 'null';
  if (Array.isArray(json)) return `array[${json.length}]`;
  if (typeof json !== 'object') return typeof json;
  const parts = [];
  for (const [k, v] of Object.entries(json).slice(0, 8)) {
    if (Array.isArray(v)) parts.push(`${k}:array[${v.length}]`);
    else if (v && typeof v === 'object') parts.push(`${k}:object`);
    else parts.push(`${k}:${typeof v}`);
  }
  return `{${parts.join(', ')}}`;
}

function unwrap(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  for (const k of [
    'items',
    'result',
    'data',
    'sinavlar',
    'sinavs',
    'sinavSonuclari',
    'SinavSonuclari',
    'liste',
    'records',
    'rows'
  ]) {
    const v = json[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') {
      const n = unwrap(v);
      if (n.length) return n;
    }
  }
  if (json.result && typeof json.result === 'object') {
    const n = unwrap(json.result);
    if (n.length) return n;
  }
  return [];
}

function countRows(json) {
  return unwrap(json).length;
}

function sampleKeys(json) {
  const rows = unwrap(json);
  if (rows[0] && typeof rows[0] === 'object') return Object.keys(rows[0]).slice(0, 15);
  if (json && typeof json === 'object' && !Array.isArray(json)) return Object.keys(json).slice(0, 15);
  return [];
}

function pathsFromSwagger() {
  const swaggerPath = path.join(__dirname, 'edesis-swagger.json');
  try {
    const raw = readFileSync(swaggerPath, 'utf8');
    const spec = JSON.parse(raw);
    const paths = Object.keys(spec.paths || {});
    const interesting = paths.filter((p) => {
      const low = p.toLowerCase();
      return (
        low.includes('external') ||
        low.includes('apikey') ||
        (low.includes('sinav') &&
          (low.includes('getall') ||
            low.includes('sonuc') ||
            low.includes('ogrenci') ||
            low.includes('rapor') ||
            low.includes('karne')))
      );
    });
    return [...new Set(interesting)].slice(0, 60);
  } catch {
    return [];
  }
}

const MANUAL_PATHS = [
  '/api/external/sinav-sonuclari',
  '/api/external/sinavsonuclari',
  '/api/external/sinavs',
  '/api/external/sinavlar',
  '/api/external/ogrenciler',
  '/api/external/ogrenci-sinav-sonuclari',
  '/api/external/deneme-sonuclari',
  '/api/external/exam-results',
  '/api/ExternalApi/SinavSonuclari',
  '/api/ExternalApi/Sinavs',
  '/api/services/app/OgrenciSinavs/GetOgrenciBySinavId',
  '/api/services/app/OgrenciSinavs/GetStudentLstWithGrade',
  '/api/services/app/OgrenciAnalizSinavs/GetAnalizSinavList',
  '/api/services/app/Sinavs/GetAll',
  '/api/services/app/Sinavs/GetAllForExternal',
  '/api/services/app/ApiKey/GetUsageStats'
];

const QUERY_VARIANTS = [
  '',
  'MaxResultCount=5000&SkipCount=0',
  'MaxResultCount=5000&SkipCount=0&includeAll=true',
  'MaxResultCount=5000&SkipCount=0&paylasilan=true',
  'MaxResultCount=5000&SkipCount=0&externalOnly=true',
  'MaxResultCount=5000&SkipCount=0&durum=tamamlandi'
];

console.log('BASE:', baseUrl);
console.log('INST:', institutionCode);
console.log('AUTH:', authMode);
console.log('KEY len:', apiKey.length);

const swaggerPaths = pathsFromSwagger();
console.log('\nSwagger interesting paths:', swaggerPaths.length);

const allPaths = [...new Set([...MANUAL_PATHS, ...swaggerPaths])];
const results = [];

for (const p of allPaths) {
  let best = null;
  for (const q of QUERY_VARIANTS) {
    const r = await tryGet(p, q);
    if (!best || (r.listLen || 0) > (best.listLen || 0)) best = { ...r, query: q || '(default)' };
    if (r.ok && (r.listLen || 0) > 0) break;
  }
  results.push(best);
}

const withData = results.filter((r) => r.ok && (r.listLen || 0) > 0).sort((a, b) => b.listLen - a.listLen);
const reachable = results.filter((r) => r.ok).sort((a, b) => (b.listLen || 0) - (a.listLen || 0));
const errors401 = results.filter((r) => r.status === 401 || r.status === 403);

console.log('\n=== WITH DATA ===');
for (const r of withData.slice(0, 15)) {
  console.log(JSON.stringify(r));
}

console.log('\n=== REACHABLE (top 20) ===');
for (const r of reachable.slice(0, 20)) {
  console.log(
    `${r.path} | status=${r.status} rows=${r.listLen || 0} | ${r.shape} | keys=${(r.sampleKeys || []).join(',')}`
  );
}

console.log('\n=== AUTH ERRORS ===', errors401.length);
for (const r of errors401.slice(0, 5)) {
  console.log(JSON.stringify({ path: r.path, status: r.status, apiError: r.apiError }));
}

if (!withData.length) {
  console.log('\nDIAGNOSIS: API key works but no endpoint returned rows.');
  console.log('Next: Edesis panel — External API sınav paylaşımı veya scope (ApiKey paketi).');
}
