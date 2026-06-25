import { readFileSync, writeFileSync } from 'fs';
import {
  fetchEdesisExamList,
  fetchEdesisJson,
  getEdesisConfig,
  extractSubjectsFromEdesisRow,
  mapEdesisRowToExamDraft
} from '../api/_lib/edesis-client.js';

for (const line of readFileSync('.env.edesis.prod', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (!m || process.env[m[1]]) continue;
  let val = m[2].trim();
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  process.env[m[1]] = val;
}

const cfg = getEdesisConfig();
if (!cfg.apiKey) {
  console.error('No EDESIS_API_KEY');
  process.exit(1);
}

const fetch = await fetchEdesisExamList();
const rows = fetch.rows.slice(0, 5);
const out = {
  rowCount: fetch.rows.length,
  sampleRowKeys: fetch.sampleRowKeys,
  samples: rows.map((row) => {
    const subjects = extractSubjectsFromEdesisRow(row);
    const draft = mapEdesisRowToExamDraft(row, { studentId: 'probe-student', institutionId: null });
    return {
      keys: Object.keys(row).slice(0, 40),
      nestedKeys: Object.fromEntries(
        Object.entries(row)
          .filter(([, v]) => v && typeof v === 'object')
          .slice(0, 15)
          .map(([k, v]) => [k, Array.isArray(v) ? `array[${v.length}]` : Object.keys(v).slice(0, 12)])
      ),
      subjectArrayLen: subjects.length,
      mappedSubjects: draft.subjects,
      topicCount: draft.subjects.reduce((n, s) => n + (s.topics?.length ?? 0), 0),
      examId: row.examId ?? row.sinavId,
      studentId: row.studentId ?? row.ogrenciId
    };
  })
};

// Try per-exam endpoint for first row with examId
const first = fetch.rows.find((r) => r.examId || r.sinavId);
if (first) {
  const examId = first.examId || first.sinavId;
  const sid = first.studentId || first.ogrenciId;
  const r = await fetchEdesisJson(cfg, `/api/external/v1/exams/${examId}/results?MaxResultCount=5`);
  const detailRows = r.json?.items || (Array.isArray(r.json) ? r.json : []);
  out.perExamProbe = {
    status: r.status,
    keys: r.json && typeof r.json === 'object' ? Object.keys(r.json) : null,
    rowCount: detailRows.length,
    firstDetailKeys: detailRows[0] ? Object.keys(detailRows[0]).slice(0, 40) : [],
    firstDetailSubjects: detailRows[0]
      ? mapEdesisRowToExamDraft(detailRows[0], { studentId: 'x', institutionId: null }).subjects
      : []
  };
}

// Probe guessed v1 paths
const extraPaths = [
  '/api/external/v1/exams/results?MaxResultCount=2&IncludeDetails=true',
  '/api/external/v1/exams/results?MaxResultCount=2&includeSubjectDetails=true',
  '/api/external/v1/exams/results?MaxResultCount=2&includeTopics=true'
];
out.extraProbes = [];
for (const p of extraPaths) {
  const r = await fetchEdesisJson(cfg, p);
  const items = r.json?.items || [];
  const row = items[0];
  out.extraProbes.push({
    path: p,
    status: r.status,
    subjectLen: row ? extractSubjectsFromEdesisRow(row).length : 0,
    keys: row ? Object.keys(row).slice(0, 25) : []
  });
}

writeFileSync('scripts/edesis-shape-probe.json', JSON.stringify(out, null, 2));
console.log('Wrote scripts/edesis-shape-probe.json');
console.log(JSON.stringify(out, null, 2).slice(0, 8000));
