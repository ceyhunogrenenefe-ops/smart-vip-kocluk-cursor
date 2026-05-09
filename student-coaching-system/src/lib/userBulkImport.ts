// Türkçe: Kullanıcı toplu içe aktarma — şablon başlıkları ve Excel/CSV ayrıştırma
import * as XLSX from 'xlsx';
import type { UserRole } from '../types';

/** Şablonda ve yardım metninde kullanılan tam başlık sırası */
export const USER_IMPORT_TEMPLATE_HEADERS = [
  'Adı',
  'Soyadı',
  'E-mail adresi',
  'Telefon numarası',
  'Doğum tarihi',
  'Sınıfı',
  'Şubesi',
  'Rolü',
  'Şifresi',
  'Şifresi (tekrar)',
  'Veli adı',
  'Veli telefon numarası'
] as const;

export type UserImportTemplateHeader = (typeof USER_IMPORT_TEMPLATE_HEADERS)[number];

export type UserImportColumnKey =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'birthDate'
  | 'classLevel'
  | 'branch'
  | 'role'
  | 'password'
  | 'passwordConfirm'
  | 'parentName'
  | 'parentPhone';

export type ParsedUserImportRow = {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  birthDate: string;
  classLevel: string;
  branch: string;
  /** Bir veya birden fazla rol (örn. öğretmen + koç) */
  roles: UserRole[];
  password: string;
  passwordConfirm: string;
  parentName: string;
  parentPhone: string;
  rowNumber: number;
};

export const turkishFold = (s: string) =>
  s
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ');

/** İçe aktarma / tekrar yüklemede ad-soyad eşlemesi (boşluk ve Türkçe harf farkı tolere) */
export function normalizeImportedFullNameKey(s: string): string {
  return turkishFold(s).replace(/\s+/g, ' ').trim();
}

/** Başlık metnini alan anahtarına eşler; null = bilinmeyen */
function headerToKey(h: string): UserImportColumnKey | null {
  const n = turkishFold(h);
  if (!n) return null;
  if (/^(adi|ad|isim|name)$/.test(n)) return 'firstName';
  if (/^(soyadi|soyad|surname|lastname|last name)$/.test(n)) return 'lastName';
  if (/(e\s*[-]?\s*mail|eposta|email)/.test(n.replace(/\s/g, ''))) return 'email';

  // ÖNEMLİ: "Veli telefon" genel "telefon" deseninden önce kontrol edilmeli (aksi halde yanlış sütun eşlenir)
  if (
    /(veli\s*(telefon|tel|gsm)|veli\s*cep|ebeveyn\s*(telefon|tel)|parent\s*(phone|tel|gsm|mobile))/.test(n)
  ) {
    return 'parentPhone';
  }
  if (/(veli adi|veli ismi|veli\s+adi|ebeveyn adi|parent\s*name)/.test(n)) return 'parentName';

  if (/(dogum tarihi|dogumtarihi|dogum|birthdate|birthday|dtarihi)/.test(n)) return 'birthDate';

  // Sınıf / şube birleşik sütun
  if (
    /sinif\s*[-/]\s*sube|sinif\s*\|\s*sube|sinif\s+ve\s+sube|sinif\s*subesi|class\s*\/?\s*section/.test(
      n.replace(/\s+/g, ' ')
    )
  ) {
    return 'classLevel';
  }

  // Yalnızca şube (sınıfla karışmayacak başlıklar)
  if (
    /\bsubes\w*|^subeyi$|^sube$|^sube\s|section|branch\b|subekodu/.test(n) &&
    !(
      /\bsinifi\b|^sinifi$/.test(n) ||
      /\bs[iı]ni?f\b/.test(n.replace(/\s+/g, ' '))
    )
  )
    return 'branch';

  if (
    /\bsinifi\b|^sinifi$|^sinif$|\bsinif\b|sinif\s*no|sinifnumarasi|class\s*level|^grade$/.test(n) ||
    /\bclass\b/.test(n)
  )
    return 'classLevel';

  if (/(ogrenci\s*(telefon|tel|gsm|cep)|cep\s*telefon|mobile|^gsm|^tel\b|^\s*(telefon|tel)\s|telefon\b)/.test(n))
    return 'phone';

  if (/^rol/.test(n) || n === 'role') return 'role';
  if (
    /sifresi\s*\(?\s*tekrar|sifre\s*tekrar|sifre\s*dogrulama|password\s*confirm|confirm/.test(
      n.replace(/\s+/g, ' ')
    )
  )
    return 'passwordConfirm';
  if (/^sifre/.test(n) || /^password/.test(n)) return 'password';
  return null;
}

function parseRole(raw: string): UserRole | null {
  const t = turkishFold(raw).replace(/\s/g, '');
  if (!t) return null;
  if (['ogrenci', 'student'].includes(t)) return 'student';
  if (['ogretmen', 'teacher'].includes(t)) return 'teacher';
  if (['koc', 'coach'].includes(t)) return 'coach';
  if (['admin', 'yonetici'].includes(t)) return 'admin';
  return null;
}

const ROLE_SPLIT = /[,;+/\\|]+|\s+ve\s+|\s+and\s+/i;

/**
 * Rol hücresi: "öğretmen, koç", "teacher+coach", "öğretmen ve koç"
 */
export function parseRoles(raw: string): UserRole[] {
  const s = String(raw || '').trim();
  if (!s) return [];
  const parts = s.split(ROLE_SPLIT).map((x) => x.trim()).filter(Boolean);
  const out: UserRole[] = [];
  const seen = new Set<UserRole>();
  for (const p of parts) {
    const r = parseRole(p);
    if (r && !seen.has(r)) {
      seen.add(r);
      out.push(r);
    }
  }
  return out;
}

/** Öğrenci ile personel rolleri aynı satırda olmasın */
export function validateImportedRoleCombo(roles: UserRole[]): string | null {
  if (!roles.length) return 'Rol boş olamaz.';
  const hasStudent = roles.includes('student');
  const hasStaff = roles.some((r) => r !== 'student');
  if (hasStudent && hasStaff) return 'Öğrenci rolü öğretmen/koç/admin ile aynı satırda kullanılamaz.';
  return null;
}

export function normalizeRolesFromApiUser(row: {
  role?: string | null;
  roles?: unknown;
}): UserRole[] {
  const arr = Array.isArray(row.roles) ? row.roles : null;
  if (arr?.length) {
    const uniq = [...new Set(arr.map((x) => String(x || '').trim()).filter(Boolean))] as UserRole[];
    return uniq.length ? uniq : [String(row.role || 'student') as UserRole];
  }
  return [String(row.role || 'student') as UserRole];
}

export function importedRolesKindConflict(existing: UserRole[], imported: UserRole[]): boolean {
  const studentOnly = (roles: UserRole[]) => roles.length > 0 && roles.every((r) => r === 'student');
  const hasStaff = (roles: UserRole[]) => roles.some((r) => r !== 'student');
  return (
    (studentOnly(existing) && hasStaff(imported)) || (hasStaff(existing) && studentOnly(imported))
  );
}

/** İlk satır başlık; en az ad, soyad, email, role */
export function buildHeaderIndexMap(headerRow: string[]): Map<UserImportColumnKey, number> {
  const map = new Map<UserImportColumnKey, number>();
  const usedPasswordIdx: number[] = [];
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
  // İki sütun da yalnızca "Şifresi" gibi aynı kalıba düştüyse: ilk şifre, ikinci tekrar
  if (usedPasswordIdx.length >= 2 && !map.has('passwordConfirm')) {
    map.set('password', usedPasswordIdx[0]!);
    map.set('passwordConfirm', usedPasswordIdx[1]!);
  }
  return map;
}

/** Ham hücreden metin; Excel sayı/Date ve bilimsel gösterim için güvenli */
export function cellValueToString(raw: unknown): string {
  if (raw == null || raw === '') return '';
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (Math.abs(raw) >= 1e15) return String(raw); // çok büyükse stringle
    if (Number.isInteger(raw) || Math.abs(raw - Math.round(raw)) < 1e-9) {
      const i = Math.round(raw);
      const s = String(i);
      return s;
    }
    const t = String(raw);
    if (/e/i.test(t)) {
      const rounded = Math.round(raw);
      return Number.isFinite(rounded) ? String(rounded) : t;
    }
    return t.trim();
  }
  return String(raw).trim().replace(/\u00a0/g, ' ');
}

/** Türkiye: hücreden sayı veya metin; baştaki 0 ve 10 haneli 5… için tampon */
export function normalizeImportedPhone(raw: unknown): string {
  const s = cellValueToString(raw).replace(/[\s()-]/g, '');
  let digits = s.replace(/\D/g, '');
  if (!digits) return '';

  // +90 veya 90…
  if (digits.startsWith('90') && digits.length === 12) digits = '0' + digits.slice(2);
  else if (digits.startsWith('90') && digits.length === 11) digits = '0' + digits.slice(2);

  if (digits.length === 10 && digits.startsWith('5')) digits = '0' + digits;
  else if (digits.length === 11 && digits.startsWith('05')) {
    /* ok */
  } else if (digits.length === 9 && digits.startsWith('5')) {
    digits = '0' + digits;
  }

  return digits;
}

/**
 * Sınıf + şube: ayrı hücre veya tek hücrede "11-A", "11 / A", "11.A", "11A".
 */
export function splitClassLevelAndBranch(
  classCell: unknown,
  branchCell: unknown
): { classLevel: string; branch: string } {
  let cls = cellValueToString(classCell).trim();
  let br = cellValueToString(branchCell).trim();

  let m = /^(\d{1,2})\s*[-_/]\s*([a-zğüşıöçA-ZĞÜŞİÖÇİı0-9]+)$/iu.exec(cls);
  if (!m) m = /^(\d{1,2})\s*[-_/]\s*([^\s\-_/]+)$/.exec(cls);
  if (m && !br) {
    cls = m[1]!;
    br = String(m[2]).replace(/\s+/g, '').toUpperCase();
  }

  let noSpc = cls.replace(/\s+/g, '');
  m = /^(\d{1,2})\.([a-zğüşıöçA-ZĞÜŞİÖÇ])$/i.exec(noSpc);
  if (m && !br) {
    cls = m[1]!;
    br = m[2]!.toUpperCase();
  }

  noSpc = cls.replace(/\s+/g, '');
  if (!br && noSpc.length <= 4 && /^\d{1,2}[a-zğüşıöçA-ZĞÜŞİÖÇ]$/i.test(noSpc)) {
    m = /^(\d{1,2})([a-zğüşıöçA-ZĞÜŞİÖÇ])$/i.exec(noSpc);
    if (m) {
      cls = m[1]!;
      br = m[2]!.toUpperCase();
    }
  }

  const numGrab = cls.match(/(\d{1,2})/);
  cls = numGrab ? numGrab[1]! : cls.replace(/\D/g, '');

  return { classLevel: cls.trim(), branch: br.trim() };
}

/** Satır içi hücre; sütun eşlemesi yoksa boş döner */
function pick(row: unknown[], idx: number | undefined): unknown {
  if (idx == null || idx < 0 || idx >= row.length) return '';
  const v = row[idx];
  return v === undefined ? '' : v;
}

function cell(row: unknown[], idx: number | undefined): string {
  return cellValueToString(pick(row, idx));
}

/**
 * Excel bazen tarih hücrelerini seri güne döndürür (örn. "45232") — Postgres `date` kabul etmez.
 * Seri günu, yyyy-MM-dd ve GG.AA.yyyy biçimlerini ISO tarih olarak döndürür; anlaşılmazsa boş.
 */
export function normalizeImportedBirthDate(raw: unknown): string {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const mo = raw.getMonth() + 1;
    const dd = raw.getDate();
    if (y >= 1900 && y <= 2100)
      return `${y}-${String(mo).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }

  const s = cellValueToString(raw)
    .trim()
    .replace(/\u00a0/g, '')
    .replace(',', '.');
  if (!s) return '';

  // dd.MM.yyyy / dd/MM/yyyy (Türkiye)
  const dmy = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s);
  if (dmy) {
    const dd = Number(dmy[1]);
    const mo = Number(dmy[2]);
    const yy = Number(dmy[3]);
    if (dd >= 1 && dd <= 31 && mo >= 1 && mo <= 12 && yy >= 1900 && yy <= 2100) {
      return `${yy}-${String(mo).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
  }

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) {
    const yy = Number(iso[1]);
    const mo = Number(iso[2]);
    const dd = Number(iso[3]);
    if (dd >= 1 && dd <= 31 && mo >= 1 && mo <= 12 && yy >= 1900 && yy <= 2100) {
      return `${yy}-${String(mo).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
  }

  // Excel seri günü (Windows Excel: 1899-12-30 tabanı; güvenli yaklaşım: 25569 epoch)
  const n = Number(s);
  if (Number.isFinite(n)) {
    const serial = Math.trunc(n + 1e-9); // zaman dilimi olmadan güne yaklaş
    if (serial >= 1 && serial < 2958466) {
      const ms = (serial - 25569) * 86400 * 1000;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) {
        return d.toISOString().slice(0, 10);
      }
    }
  }

  return '';
}

export function parseUserImportGrid(rows: unknown[][]): {
  rows: ParsedUserImportRow[];
  headerError: string | null;
  invalidComboRows: { rowNumber: number; message: string }[];
} {
  if (rows.length < 2) {
    return { rows: [], headerError: 'Dosyada en az bir veri satırı olmalıdır.', invalidComboRows: [] };
  }
  const headerCells = rows[0]!.map((c) => cellValueToString(c));
  const colMap = buildHeaderIndexMap(headerCells);
  const need: UserImportColumnKey[] = ['firstName', 'lastName', 'email', 'role'];
  const missing = need.filter((k) => !colMap.has(k));
  if (missing.length) {
    return {
      rows: [],
      headerError:
        'Zorunlu sütunlar eksik: Adı, Soyadı, E-mail adresi, Rolü (birden fazla rol için virgülle ayırın). İndirdiğiniz örnek şablonu kullanın veya başlıkları kontrol edin.',
      invalidComboRows: []
    };
  }

  const out: ParsedUserImportRow[] = [];
  const invalidComboRows: { rowNumber: number; message: string }[] = [];
  for (let i = 1; i < rows.length; i++) {
    const line = rows[i] || [];
    if (line.every((c) => !cellValueToString(c))) continue;
    const firstName = cell(line, colMap.get('firstName'));
    const lastName = cell(line, colMap.get('lastName'));
    const email = cell(line, colMap.get('email')).toLowerCase();
    const roleRaw = cell(line, colMap.get('role'));
    const roles = parseRoles(roleRaw);
    if (!firstName || !lastName || !email || !roles.length) continue;
    const comboErr = validateImportedRoleCombo(roles);
    if (comboErr) {
      invalidComboRows.push({ rowNumber: i + 1, message: comboErr });
      continue;
    }
    const fullName = `${firstName} ${lastName}`.trim();

    const birthIso = normalizeImportedBirthDate(pick(line, colMap.get('birthDate')));

    const { classLevel: clParsed, branch: brParsed } = splitClassLevelAndBranch(
      pick(line, colMap.get('classLevel')),
      pick(line, colMap.get('branch'))
    );

    out.push({
      firstName,
      lastName,
      fullName,
      email,
      phone: normalizeImportedPhone(pick(line, colMap.get('phone'))),
      birthDate: birthIso,
      classLevel: clParsed,
      branch: brParsed,
      roles,
      password: cell(line, colMap.get('password')),
      passwordConfirm: cell(line, colMap.get('passwordConfirm')),
      parentName: cell(line, colMap.get('parentName')),
      parentPhone: normalizeImportedPhone(pick(line, colMap.get('parentPhone'))),
      rowNumber: i + 1
    });
  }
  return { rows: out, headerError: null, invalidComboRows };
}

export async function readUserImportFileAsGrid(file: File): Promise<unknown[][]> {
  const buf = await file.arrayBuffer();
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const readOpts = { type: 'array' as const };
  const sheetOpts = { header: 1 as const, defval: '', raw: true as const };
  if (ext === 'csv' || ext === 'txt') {
    const wb = XLSX.read(new Uint8Array(buf), readOpts);
    const sheet = wb.Sheets[wb.SheetNames[0]!];
    return XLSX.utils.sheet_to_json<unknown[]>(sheet, sheetOpts) as unknown[][];
  }
  const wb = XLSX.read(buf, readOpts);
  const sheet = wb.Sheets[wb.SheetNames[0]!];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { ...sheetOpts, cellDates: true }) as unknown[][];
}

export function downloadUserImportTemplateXlsx(): void {
  const ws = XLSX.utils.aoa_to_sheet([
    [...USER_IMPORT_TEMPLATE_HEADERS],
    [
      'Ayşe Örnek',
      'Yılmaz',
      'ayse.ornek@ornek.com',
      '05551112233',
      '2008-01-15',
      '11',
      'A',
      'öğrenci',
      'Ogrenci123!',
      'Ogrenci123!',
      'Ali Veli',
      '05559998877'
    ],
    [
      'Mehmet Öğretmen',
      'Kaya',
      'mehmet.ogretmen@ornek.com',
      '05552223344',
      '',
      '',
      '',
      'öğretmen, koç',
      'Ogretmen123!',
      'Ogretmen123!',
      '',
      ''
    ]
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Kullanicilar');
  XLSX.writeFile(wb, 'kullanici_yukleme_sablonu.xlsx');
}
