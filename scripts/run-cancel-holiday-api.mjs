import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k] && v) process.env[k] = v;
  }
}

for (const f of ['.env.vercel.holiday-tmp', '.env.vercel.pull', '.env.vercel.prod']) {
  loadDotEnv(path.join(root, f));
}

function loadSecret() {
  const want = ['MEETING_CRON_SECRET', 'CRON_SECRET', 'COACH_WHATSAPP_CRON_SECRET'];
  for (const k of want) {
    const v = String(process.env[k] || '').trim();
    if (v.length > 8) return { name: k, value: v };
  }
  const envPath = path.join(root, '.env.vercel.holiday-tmp');
  if (!fs.existsSync(envPath)) return null;
  const map = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i <= 0) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    map[line.slice(0, i).trim()] = v;
  }
  for (const k of want) {
    if (map[k] && map[k].length > 8) return { name: k, value: map[k] };
  }
  return null;
}

const arg = process.argv[2] || 'dryRun';
const restore = arg.startsWith('restore');
const execute = arg.endsWith('execute') || arg === 'execute';

const secret = loadSecret();
if (!secret) {
  console.error('Cron secret gerekli. Önce: npx vercel env pull .env.vercel.holiday-tmp --environment=production --yes');
  process.exit(1);
}

const body = { restore, ...(execute ? { execute: true } : { dryRun: true }) };
console.log('mode=' + JSON.stringify(body));

const res = await fetch('https://www.dersonlinevipkocluk.com/api/cancel-holiday-group-sessions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${secret.value}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(body)
});
const text = await res.text();
console.log('status=' + res.status);
console.log(text);
