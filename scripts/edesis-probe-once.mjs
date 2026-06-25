import { fileURLToPath } from 'url';
import path from 'path';
import { probeEdesisApi, fetchEdesisExamList, getEdesisConfig } from '../api/_lib/edesis-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.join(__dirname, '..'));

const cfg = getEdesisConfig();console.log('CONFIG:', {
  hasKey: Boolean(cfg.apiKey),
  keyLen: cfg.apiKey ? cfg.apiKey.length : 0,
  keyPrefix: cfg.apiKey ? `${cfg.apiKey.slice(0, 8)}…` : null,
  baseUrl: cfg.baseUrl,
  institutionCode: cfg.institutionCode,
  authMode: cfg.authMode,
  resultsPath: cfg.resultsPath || '(auto)',
  examsPath: cfg.examsPath || '(auto)'
});

if (!cfg.apiKey) {
  console.log('\nSONUC: EDESES_API_KEY tanimli degil.');
  console.log('PowerShell: .\\edesis-probe.ps1  veya  $env:EDESIS_API_KEY="..."; npm run edesis:probe');
  process.exit(1);
}
const probe = await probeEdesisApi();
console.log('\nPROBE:', JSON.stringify({
  ok: probe.ok,
  error: probe.error,
  hint: probe.hint,
  baseUrl: probe.baseUrl,
  path: probe.path,
  rowCount: probe.rowCount,
  hasData: probe.hasData,
  warning: probe.warning,
  firstAttempt: probe.attempts?.[0] || null
}, null, 2));

const fetch = await fetchEdesisExamList();
console.log('\nFETCH:', JSON.stringify({
  rowCount: fetch.rows.length,
  rowsWithStudentFields: fetch.rowsWithStudentFields,
  fetchMode: fetch.fetchMode,
  httpStatus: fetch.httpStatus,
  path: fetch.path,
  apiHint: fetch.apiHint,
  rawPreview: fetch.rawPreview,
  contentType: fetch.contentType,
  parseOk: fetch.parseOk,
  sampleRowKeys: fetch.sampleRowKeys,
  firstRow: fetch.rows[0] || null
}, null, 2));
