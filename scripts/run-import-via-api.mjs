import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const XLSX = require('../student-coaching-system/node_modules/xlsx');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\n/)) {
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

loadDotEnv(path.join(__dirname, '..', '.env.vercel.prod'));

const b64url = (input) =>
  Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

function signAuthToken(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + 3600 };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(body))}`;
  const signature = crypto.createHmac('sha256', secret).update(unsigned).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `${unsigned}.${signature}`;
}

const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'import-students-preview.json'), 'utf8'));
const secret = process.env.APP_JWT_SECRET;
if (!secret || secret.length < 8) {
  console.error('APP_JWT_SECRET missing');
  process.exit(1);
}

const token = signAuthToken({ sub: 'bulk-import-script', role: 'super_admin', institution_id: null }, secret);
const apiBase = process.env.APP_PUBLIC_URL || 'https://www.dersonlinevipkocluk.com';

const res = await fetch(`${apiBase}/api/users/bulk-import`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ rows })
});

const json = await res.json().catch(() => ({}));
console.log(res.status, JSON.stringify(json, null, 2));
