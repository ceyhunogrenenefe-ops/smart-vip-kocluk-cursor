import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'https://www.dersonlinevipkocluk.com';
const ALI = 'c93d4093-cd44-46ab-86e4-dc4f27443f2f';
const INST = '73323d75-eea1-4552-8bba-d50555423589';

const env = fs.readFileSync(path.join(__dirname, '..', '.env.probe.ali'), 'utf8');
const m = env.match(/^APP_JWT_SECRET="([^"]+)"/m) || env.match(/^APP_JWT_SECRET=([^\n]+)/m);
if (!m?.[1]) {
  console.error('APP_JWT_SECRET missing');
  process.exit(1);
}
const secret = m[1].trim();

const b64url = (input) =>
  Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const now = Math.floor(Date.now() / 1000);
const body = {
  sub: ALI,
  role: 'teacher',
  institution_id: INST,
  coach_id: null,
  student_id: null,
  iat: now,
  exp: now + 3600
};
const unsigned = `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(JSON.stringify(body))}`;
const sig = crypto
  .createHmac('sha256', secret)
  .update(unsigned)
  .digest('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/g, '');
const token = `${unsigned}.${sig}`;
const h = { Authorization: `Bearer ${token}` };

for (const path of [
  '/api/students',
  '/api/teacher-scope',
  `/api/class-live-lessons?scope=classes&institution_id=${INST}`,
  `/api/class-live-lessons?scope=slots&institution_id=${INST}`
]) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const j = await r.json().catch(() => ({}));
  let summary;
  if (path.includes('teacher-scope')) {
    summary = {
      classes: j.data?.classes?.length,
      students: j.data?.students?.length,
      classIds: j.data?.classIds?.length
    };
  } else {
    summary = Array.isArray(j.data) ? j.data.length : j;
  }
  console.log(path.split('?')[0], 'status', r.status, JSON.stringify(summary));
}
