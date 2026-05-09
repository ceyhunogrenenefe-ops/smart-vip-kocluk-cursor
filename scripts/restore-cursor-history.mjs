import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, '..');
// APPDATA is already ...\AppData\Roaming on Windows
const HISTORY_ROOT = path.join(
  process.env.APPDATA || '',
  'Cursor',
  'User',
  'History'
);

const WORKSPACE_MARKER = '/Downloads/student-coaching-system%20%2812%29/';
const WORKSPACE_MARKER_PLAIN = 'student-coaching-system (12)';

function decodeResourceUri(resource) {
  if (!resource || !resource.startsWith('file:///')) return null;
  try {
    return fileURLToPath(resource);
  } catch {
    return null;
  }
}

function isOurWorkspace(absPath) {
  if (!absPath) return false;
  const n = absPath.replace(/\\/g, '/').toLowerCase();
  return n.includes('downloads/student-coaching-system (12)/');
}

function walkEntriesJson(dir, out) {
  if (!fs.existsSync(dir)) return;
  const names = fs.readdirSync(dir, { withFileTypes: true });
  for (const n of names) {
    const p = path.join(dir, n.name);
    if (n.isDirectory()) walkEntriesJson(p, out);
    else if (n.name === 'entries.json') out.push(p);
  }
}

const entriesFiles = [];
walkEntriesJson(HISTORY_ROOT, entriesFiles);

let restored = 0;
let skipped = 0;
let errors = 0;

for (const entriesPath of entriesFiles) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(entriesPath, 'utf8'));
  } catch {
    continue;
  }
  if (!data.resource || !Array.isArray(data.entries) || data.entries.length === 0)
    continue;
  const raw = String(data.resource);
  if (
    !raw.includes(WORKSPACE_MARKER) &&
    !raw.includes(encodeURIComponent(WORKSPACE_MARKER_PLAIN))
  ) {
    if (!raw.includes(WORKSPACE_MARKER_PLAIN.replace(/ /g, '%20'))) continue;
  }

  let targetPath = decodeResourceUri(raw);
  if (!targetPath || !isOurWorkspace(targetPath)) continue;

  const sorted = [...data.entries].sort(
    (a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)
  );
  const latest = sorted[0];
  if (!latest?.id) continue;

  const historyDir = path.dirname(entriesPath);
  const src = path.join(historyDir, latest.id);
  if (!fs.existsSync(src)) {
    skipped++;
    continue;
  }

  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(src, targetPath);
    restored++;
    console.log('OK', path.relative(WORKSPACE_ROOT, targetPath));
  } catch (e) {
    errors++;
    console.error('ERR', targetPath, e.message);
  }
}

console.log(`\nDone: restored=${restored} skipped_missing_src=${skipped} errors=${errors}`);
