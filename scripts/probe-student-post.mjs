import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const base = 'https://www.dersonlinevipkocluk.com';

const usersRes = await fetch(`${base}/api/users`);
const instId = (await usersRes.json()).data?.[0]?.institution_id;

const row = {
  name: 'Ömer Arslan',
  email: 'omeraslan@gmail.com',
  password: '152535',
  class_level: '6',
  parent_name: 'Seval Arslan',
  parent_phone: '05063008466',
  institution_id: instId
};

const res = await fetch(`${base}/api/students`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(row)
});
console.log(res.status, (await res.text()).slice(0, 500));
