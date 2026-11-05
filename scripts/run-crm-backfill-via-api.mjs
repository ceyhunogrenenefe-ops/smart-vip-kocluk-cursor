import fs from 'fs';

const envPath = process.argv[2];
const base = (process.argv[3] || 'https://smart-kocluk-ceyhu.vercel.app').replace(/\/$/, '');

for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  if (!line || line.startsWith('#')) continue;
  const eq = line.indexOf('=');
  if (eq <= 0) continue;
  const key = line.slice(0, eq).trim();
  let val = line.slice(eq + 1).trim();
  if (val.startsWith('"')) {
    try {
      val = JSON.parse(val);
    } catch {
      /* keep */
    }
  }
  if (!process.env[key]) process.env[key] = val;
}

const token =
  process.env.CRON_SECRET ||
  process.env.MEETING_CRON_SECRET ||
  process.env.COACH_WHATSAPP_CRON_SECRET ||
  '';
if (!token) {
  console.error('No cron secret in env file');
  process.exit(1);
}

let cursor = null;
let total = 0;
for (let round = 1; round <= 500; round += 1) {
  const url = new URL(`${base}/api/crm-website-orders`);
  url.searchParams.set('op', 'backfill');
  if (cursor) url.searchParams.set('cursor', cursor);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'backfill', cursor, source: 'all' }),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error('HTTP', res.status, text.slice(0, 500));
    process.exit(1);
  }
  if (!res.ok) {
    console.error('HTTP', res.status, data);
    process.exit(1);
  }
  total += Number(data.synced || 0);
  console.log(
    JSON.stringify({
      round,
      phase: data.phase,
      synced: data.synced,
      done: data.done,
    })
  );
  if (data.done) break;
  cursor = data.next_cursor || null;
  if (!cursor) break;
}
console.log(JSON.stringify({ ok: true, total_synced: total }));
