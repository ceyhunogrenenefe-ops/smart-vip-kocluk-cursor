import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRANSCRIPTS_ROOT = path.join(
  process.env.USERPROFILE || '',
  '.cursor',
  'projects',
  'c-Users-ceyhu-Downloads-student-coaching-system-12',
  'agent-transcripts'
);

const keywords = [
  'weeklyPlanner',
  'WeeklyPlanner',
  'weekly-planner',
  'whatsapp-center',
  'WhatsAppMerkezi',
  'planner-daily-log',
  'coach-weekly-goals',
  'screenTimeApi',
  'student-screen-time',
  'sync-weekly-entry-planner',
  'planner-slot-conflict',
];

/** path -> { contents, transcriptFile } last wins */
const writes = new Map();

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walk(p);
    else if (name.name.endsWith('.jsonl')) {
      let lines;
      try {
        lines = fs.readFileSync(p, 'utf8').split(/\n/).filter(Boolean);
      } catch {
        continue;
      }
      for (const line of lines) {
        let o;
        try {
          o = JSON.parse(line);
        } catch {
          continue;
        }
        const msg = o.message?.content;
        if (!Array.isArray(msg)) continue;
        for (const part of msg) {
          if (part.type !== 'tool_use') continue;
          const toolName = part.name || part.tool;
          if (toolName !== 'Write') continue;
          const inp = part.input || {};
          const fp = inp.path;
          if (!fp || typeof inp.contents !== 'string') continue;
          const norm = fp.replace(/\\/g, '/');
          if (!keywords.some((k) => norm.includes(k))) continue;
          writes.set(norm, { contents: inp.contents, transcriptFile: p });
        }
      }
    }
  }
}

walk(TRANSCRIPTS_ROOT);
console.log('Found Write snapshots:', writes.size);
for (const fp of writes.keys()) console.log(' ', fp);

const outRoot = path.resolve(__dirname, '..');
let written = 0;
for (const [fp, { contents }] of writes) {
  const norm = fp.replace(/\\/g, '/');
  const n = norm.toLowerCase();
  const folderMarker = 'student-coaching-system (12)/';
  const mi = n.indexOf(folderMarker);
  const idx2 = n.indexOf('/handlers/');
  const idx3 = n.indexOf('/api/');
  let rel;
  if (mi >= 0) rel = norm.slice(mi + folderMarker.length);
  else if (idx2 >= 0) rel = norm.slice(idx2 + 1);
  else if (idx3 >= 0) rel = norm.slice(idx3 + 1);
  else rel = path.basename(norm);

  const dest = path.join(outRoot, rel.replace(/\//g, path.sep));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, contents, 'utf8');
  written++;
  console.log('Wrote', rel);
}
console.log('\nDone, wrote', written, 'files under', outRoot);
