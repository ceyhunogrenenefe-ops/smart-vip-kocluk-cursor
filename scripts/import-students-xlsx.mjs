/**
 * Excel'den toplu öğrenci içe aktarma (kullanıcı yönetimi ile aynı API mantığı).
 *
 * Kullanım:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... INSTITUTION_ID=... node scripts/import-students-xlsx.mjs "dosya1.xlsx" "dosya2.xlsx"
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('../student-coaching-system/node_modules/xlsx');
import { runBulkUserImport } from '../api/_lib/user-bulk-import.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';

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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadDotEnv(path.join(__dirname, '..', 'student-coaching-system', '.env.local'));
loadDotEnv(path.join(__dirname, '..', '.env.local'));
loadDotEnv(path.join(__dirname, '..', '.env.vercel.local'));
loadDotEnv(path.join(__dirname, '..', '.env.vercel.prod'));

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
  if (/(dogum tarihi|dogum|birthdate)/.test(n)) return 'birthDate';
  if (/\bsinifi\b|^sinif$|\bsinif\b|class\s*level|^grade$/.test(n) || /\bclass\b/.test(n)) return 'classLevel';
  if (/\bsubes\w*|^sube$|section|branch\b/.test(n) && !/\bsinif\b/.test(n)) return 'branch';
  if (/(ogrenci\s*(telefon|tel)|^tel\b|telefon\b)/.test(n)) return 'phone';
  if (/^rol/.test(n) || n === 'role') return 'role';
  if (/sifresi\s*\(?\s*tekrar|sifre\s*tekrar|password\s*confirm/.test(n.replace(/\s+/g, ' '))) return 'passwordConfirm';
  if (/^sifre$|^sifresi$|^password$/.test(n)) return 'password';
  return null;
}

function buildHeaderIndexMap(headerRow) {
  const map = new Map();
  const usedPasswordIdx = [];
  headerRow.forEach((hdr, colIdx) => {
    const key = headerToKey(cellValueToString(hdr));
    if (!key) return;
    if (key === 'password') {
      usedPasswordIdx.push(colIdx);
      if (!map.has('password')) map.set('password', colIdx);
      else if (!map.has('passwordConfirm')) map.set('passwordConfirm', colIdx);
      return;
    }
    if (!map.has(key)) map.set(key, colIdx);
  });
  if (usedPasswordIdx.length >= 2 && !map.has('passwordConfirm')) {
    map.set('password', usedPasswordIdx[0]);
    map.set('passwordConfirm', usedPasswordIdx[1]);
  }
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

function splitClassLevelAndBranch(classCell, branchCell) {
  let cls = cellValueToString(classCell).trim();
  let br = cellValueToString(branchCell).trim();
  const numGrab = cls.match(/(\d{1,2})/);
  cls = numGrab ? numGrab[1] : cls.replace(/\D/g, '');
  return { classLevel: cls.trim(), branch: br.trim() };
}

function splitFullName(nameRaw) {
  const parts = String(nameRaw || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || '', lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function parseGrid(grid, forceStudent = true) {
  if (!grid.length) return [];
  const colMap = buildHeaderIndexMap(grid[0]);
  const hasLastName = colMap.has('lastName');
  const rows = [];
  for (let i = 1; i < grid.length; i++) {
    const line = grid[i] || [];
    if (line.every((c) => !cellValueToString(c))) continue;
    const pick = (idx) => (idx == null || idx < 0 ? '' : cellValueToString(line[idx]));
    let firstName = pick(colMap.get('firstName'));
    let lastName = pick(colMap.get('lastName'));
    if (firstName && !lastName && !hasLastName) {
      const split = splitFullName(firstName);
      firstName = split.firstName;
      lastName = split.lastName;
    }
    const email = pick(colMap.get('email')).toLowerCase();
    const password = pick(colMap.get('password'));
    if (!firstName || !lastName || !email || !password) continue;
    const { classLevel, branch } = splitClassLevelAndBranch(
      colMap.has('classLevel') ? line[colMap.get('classLevel')] : '',
      colMap.has('branch') ? line[colMap.get('branch')] : ''
    );
    rows.push({
      rowNumber: i + 1,
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`.trim(),
      email,
      phone: normalizeImportedPhone(colMap.has('phone') ? line[colMap.get('phone')] : ''),
      birthDate: '',
      classLevel,
      branch,
      roles: forceStudent ? ['student'] : ['student'],
      password,
      parentName: pick(colMap.get('parentName')),
      parentPhone: normalizeImportedPhone(colMap.has('parentPhone') ? line[colMap.get('parentPhone')] : '')
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
  const fileArgs = process.argv.slice(2);
  const defaults = [
    path.join(process.env.USERPROFILE || '', 'Downloads', 'kullanici_yukleme_sablonu.xlsx'),
    path.join(process.env.USERPROFILE || '', 'Downloads', 'kullanici_yukleme_sablonu.xlsx 2.xlsx')
  ];
  const files = fileArgs.length ? fileArgs : defaults;

  const allRows = [];
  for (const f of files) {
    if (!fs.existsSync(f)) {
      console.warn('Atlanıyor (dosya yok):', f);
      continue;
    }
    const grid = readXlsx(f);
    const parsed = parseGrid(grid, true);
    console.log(path.basename(f), '→', parsed.length, 'öğrenci satırı');
    allRows.push(...parsed);
  }

  const byEmail = new Map();
  for (const r of allRows) {
    if (/@ornek\.com$/i.test(r.email)) continue;
    if (!byEmail.has(r.email)) byEmail.set(r.email, r);
  }
  const uniqueRows = [...byEmail.values()];
  console.log('Toplam (e-posta benzersiz):', uniqueRows.length);

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli (.env.local veya ortam değişkeni).');
    console.error('Önizleme JSON:', path.join(__dirname, 'import-students-preview.json'));
    fs.writeFileSync(path.join(__dirname, 'import-students-preview.json'), JSON.stringify(uniqueRows, null, 2));
    process.exit(1);
  }

  let institutionId = process.env.INSTITUTION_ID || process.env.DEFAULT_INSTITUTION_ID || null;
  if (!institutionId) {
    const { data: insts } = await supabaseAdmin.from('institutions').select('id,name').limit(5);
    institutionId = insts?.[0]?.id || null;
    if (insts?.length) console.log('Kurum:', insts.map((i) => `${i.name} (${i.id})`).join(', '));
  }
  const actor = {
    role: 'super_admin',
    sub: process.env.IMPORT_ACTOR_USER_ID || '00000000-0000-0000-0000-000000000001',
    institution_id: institutionId
  };

  const summary = await runBulkUserImport(actor, uniqueRows, institutionId);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
