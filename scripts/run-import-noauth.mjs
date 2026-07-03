import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'import-students-preview.json'), 'utf8'));
const apiBase = 'https://www.dersonlinevipkocluk.com';

const res = await fetch(`${apiBase}/api/users/bulk-import`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ rows })
});

const text = await res.text();
console.log('status', res.status);
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text.slice(0, 2000));
}
