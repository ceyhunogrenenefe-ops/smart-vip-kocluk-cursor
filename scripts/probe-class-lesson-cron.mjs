import fs from 'node:fs';
import path from 'node:path';

const envPath = path.join(process.cwd(), '.env.deploy.tmp');
const envText = fs.readFileSync(envPath, 'utf8');
const secretMatch = envText.match(/MEETING_CRON_SECRET="([^"]+)"/);
const secret = secretMatch?.[1] || '';
if (!secret) {
  console.error('MEETING_CRON_SECRET missing');
  process.exit(1);
}

const url = 'https://www.dersonlinevipkocluk.com/api/cron/class-lesson-reminders';
const res = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
const body = await res.text();
console.log('status', res.status);
try {
  console.log(JSON.stringify(JSON.parse(body), null, 2));
} catch {
  console.log(body);
}
