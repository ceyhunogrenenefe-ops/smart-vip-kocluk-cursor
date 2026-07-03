import fs from 'fs';

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv('.env.vercel.runtime');

const secret =
  process.env.MEETING_CRON_SECRET?.trim() ||
  process.env.CRON_SECRET?.trim() ||
  process.env.COACH_WHATSAPP_CRON_SECRET?.trim();

if (!secret) {
  console.error('Cron secret bulunamadi');
  process.exit(1);
}

const mode = process.argv[2] || 'preview';
const body =
  mode === 'execute'
    ? JSON.stringify({ execute: true, cutoff: '2026-07-01' })
    : JSON.stringify({ dryRun: true, cutoff: '2026-07-01' });

const res = await fetch('https://www.dersonlinevipkocluk.com/api/cleanup-pre-july-sessions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${secret}`,
    'Content-Type': 'application/json'
  },
  body
});

const j = await res.json().catch(() => ({}));
console.log(JSON.stringify({ status: res.status, ...j }, null, 2));
process.exit(res.ok ? 0 : 1);
