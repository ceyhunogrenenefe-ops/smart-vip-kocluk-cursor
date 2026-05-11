import crypto from 'crypto';

function splitName(full) {
  const p = String(full || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return { ad: p[0] || '', soyad: p.slice(1).join(' ') || '' };
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {object} opts
 * @param {object} opts.student
 * @param {object|null} opts.programPackage
 * @param {object|null} opts.institution
 * @param {object|null} opts.coach
 * @param {Record<string,string|number>} [opts.extras]
 */
export async function buildContractVariableMap(opts) {
  const { student, programPackage, institution, coach, extras = {} } = opts;
  const o = splitName(student?.name);
  const v = splitName(student?.parent_name);
  const sinif = student?.class_level != null ? String(student.class_level) : '';
  const programAdi = programPackage?.name || student?.program_id || '';
  const haftalik = programPackage?.weekly_hours != null ? String(programPackage.weekly_hours) : '';
  const ucret =
    programPackage?.price_numeric != null ? String(programPackage.price_numeric) : '';
  const bas =
    programPackage?.contract_start_date != null ? String(programPackage.contract_start_date).slice(0, 10) : '';
  const bit =
    programPackage?.contract_end_date != null ? String(programPackage.contract_end_date).slice(0, 10) : '';

  const base = {
    ogrenci_ad: o.ad,
    ogrenci_soyad: o.soyad,
    veli_ad: v.ad,
    veli_soyad: v.soyad,
    telefon: String(student?.phone || student?.parent_phone || '').trim(),
    adres: String(student?.school || institution?.address || '').trim(),
    sinif: sinif,
    program_adi: String(programAdi || ''),
    baslangic_tarihi: bas,
    bitis_tarihi: bit,
    haftalik_ders_saati: haftalik,
    ucret: ucret,
    koc_adi: String(coach?.name || '').trim(),
    kurum_adi: String(institution?.name || '').trim(),
    kurum_logo_url: String(institution?.logo || '').trim(),
    ...extras
  };
  return base;
}

export function applyTemplateVariables(template, map) {
  let s = String(template || '');
  for (const [k, val] of Object.entries(map)) {
    const needle = `{{${k}}}`;
    const raw = val == null ? '' : String(val);
    const safe = /^https?:\/\//i.test(raw) ? raw : escapeHtml(raw);
    s = s.split(needle).join(safe);
  }
  return s;
}

export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function contractNumberFromInstitution(instId) {
  const suf = crypto.randomBytes(3).toString('hex').toUpperCase();
  const short = String(instId || 'X').replace(/-/g, '').slice(0, 4).toUpperCase();
  return `SK-${short}-${suf}`;
}
