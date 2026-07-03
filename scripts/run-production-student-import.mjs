/**
 * Excel öğrencilerini production API ile içe aktarır (POST /api/students).
 * Kullanım: node scripts/run-production-student-import.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const XLSX = require('../student-coaching-system/node_modules/xlsx');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const base = process.env.APP_PUBLIC_URL || 'https://www.dersonlinevipkocluk.com';

// import-students-xlsx.mjs ile aynı parse mantığı (kısaltılmış)
const turkishFold = (s) =>
  String(s || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ');

function cellValueToString(raw) {
  if (raw == null || raw === '') return '';
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10);
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (Number.isInteger(raw) || Math.abs(raw - Math.round(raw)) < 1e-9) return String(Math.round(raw));
    return String(raw).trim();
  }
  return String(raw).trim().replace(/\u00a0/g, ' ');
}

function headerToKey(h) {
  const n = turkishFold(h);
  if (!n) return null;
  if (/^(adi|ad|isim|name)$/.test(n)) return 'firstName';
  if (/^(soyadi|soyad|surname|lastname|last name)$/.test(n)) return 'lastName';
  if (/(e\s*[-]?\s*mail|eposta|email|^mail$)/.test(n.replace(/\s/g, ''))) return 'email';
  if (/(veli\s*(telefon|tel|gsm)|veli\s*cep|parent\s*(phone|tel))/.test(n)) return 'parentPhone';
  if (/(veli adi|veli ismi|ebeveyn adi|parent\s*name|^veli ad)/.test(n)) return 'parentName';
  if (/\bsinifi\b|^sinif$|\bsinif\b|class\s*level|^grade$/.test(n) || /\bclass\b/.test(n)) return 'classLevel';
  if (/^sifre$|^sifresi$|^password$/.test(n)) return 'password';
  return null;
}

function buildHeaderIndexMap(headerRow) {
  const map = new Map();
  headerRow.forEach((hdr, colIdx) => {
    const key = headerToKey(cellValueToString(hdr));
    if (key && !map.has(key)) map.set(key, colIdx);
  });
  return map;
}

function normalizeImportedPhone(raw) {
  const s = cellValueToString(raw).replace(/[\s()-]/g, '');
  let digits = s.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('90') && digits.length >= 11) digits = '0' + digits.slice(2);
  if (digits.length === 10 && digits.startsWith('5')) digits = '0' + digits;
  return digits;
}

function parseGrid(grid) {
  if (!grid.length) return [];
  const colMap = buildHeaderIndexMap(grid[0]);
  const rows = [];
  for (let i = 1; i < grid.length; i++) {
    const line = grid[i] || [];
    if (line.every((c) => !cellValueToString(c))) continue;
    const pick = (idx) => (idx == null || idx < 0 ? '' : cellValueToString(line[idx]));
    const firstName = pick(colMap.get('firstName'));
    const lastName = pick(colMap.get('lastName'));
    const email = pick(colMap.get('email')).toLowerCase();
    const password = pick(colMap.get('password'));
    if (!firstName || !lastName || !email || !password) continue;
    const clsRaw = pick(colMap.get('classLevel'));
    const classLevel = clsRaw.match(/(\d{1,2})/)?.[1] || clsRaw.replace(/\D/g, '') || '9';
    rows.push({
      rowNumber: i + 1,
      name: `${firstName} ${lastName}`.trim(),
      email,
      password,
      class_level: classLevel,
      parent_name: pick(colMap.get('parentName')) || null,
      parent_phone: normalizeImportedPhone(colMap.has('parentPhone') ? line[colMap.get('parentPhone')] : '') || null
    });
  }
  return rows;
}

function readXlsx(filePath) {
  const wb = XLSX.readFile(filePath);
  const sh = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });
}

async function main() {
  const files = [
    path.join(process.env.USERPROFILE || '', 'Downloads', 'kullanici_yukleme_sablonu.xlsx'),
    path.join(process.env.USERPROFILE || '', 'Downloads', 'kullanici_yukleme_sablonu.xlsx 2.xlsx')
  ];

  const allRows = [];
  for (const f of files) {
    if (!fs.existsSync(f)) {
      console.warn('Atlanıyor:', f);
      continue;
    }
    const parsed = parseGrid(readXlsx(f));
    console.log(path.basename(f), '→', parsed.length, 'satır');
    allRows.push(...parsed);
  }

  const byEmail = new Map();
  for (const r of allRows) {
    if (/@ornek\.com$/i.test(r.email)) continue;
    byEmail.set(r.email, r);
  }
  const rows = [...byEmail.values()];
  console.log('İçe aktarılacak benzersiz öğrenci:', rows.length);

  const usersRes = await fetch(`${base}/api/users`);
  const usersJson = await usersRes.json();
  const institutionId = usersJson.data?.[0]?.institution_id;
  if (!institutionId) {
    console.error('Kurum ID alınamadı');
    process.exit(1);
  }
  console.log('Kurum:', institutionId);

  const summary = { created: 0, merged: 0, failed: 0, errors: [] };

  for (const row of rows) {
    const payload = {
      name: row.name,
      email: row.email,
      password: row.password,
      class_level: row.class_level,
      parent_name: row.parent_name,
      parent_phone: row.parent_phone,
      institution_id: institutionId
    };
    try {
      const res = await fetch(`${base}/api/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = { error: text.slice(0, 200) };
      }
      if (res.ok) {
        if (json.merged_existing) summary.merged += 1;
        else summary.created += 1;
        console.log('OK', row.email, json.merged_existing ? '(güncellendi)' : '(yeni)');
      } else {
        summary.failed += 1;
        summary.errors.push({ email: row.email, status: res.status, message: json.error || text.slice(0, 120) });
        console.error('HATA', row.email, res.status, json.error || text.slice(0, 120));
      }
    } catch (e) {
      summary.failed += 1;
      summary.errors.push({ email: row.email, message: e.message });
      console.error('HATA', row.email, e.message);
    }
  }

  console.log('\nÖzet:', JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
