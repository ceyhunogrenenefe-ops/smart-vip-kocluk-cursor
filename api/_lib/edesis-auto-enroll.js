/**
 * Kayıt onayı → Edesis öğrenci (Online VIP Ders ve Koçluk).
 * Şube, sınıf seviyesine göre Edesis classrooms listesinden seçilir.
 */

import { randomBytes } from 'node:crypto';
import {
  changeEdesisStudentTerm,
  createEdesisParent,
  createEdesisStudent,
  fetchEdesisClassroomsList,
  fetchEdesisStudentsList,
  fetchEdesisTermsList,
  getEdesisConfig,
  nameLookupKeys,
  studentMatchKeysFromEdesisRow
} from './edesis-client.js';

export const EDESIS_AUTO_ENROLL_INSTITUTION_ID = '73323d75-eea1-4552-8bba-d50555423589';
export const EDESIS_TERM_REGULAR_NAME = '2026-2027';
export const EDESIS_TERM_SUMMER_NAME = '2026-2027-YAZ';
export const EDESIS_TERM_REGULAR_ID_FALLBACK = 113;
export const EDESIS_TERM_SUMMER_ID_FALLBACK = 142;

const SKIP_CLASSROOM_NAME =
  /bursluluk|kayit silen|kayıt silen|sömestr|somestr|yaz kamp|kitap okuma|kitap ukuma|atolye|deneme klub|4zpz8|eu8bb|premium|özelders|^özel$/i;

const SKIP_AUTO_ENROLL_EMAIL =
  /@example\.com$|^admin@smartvip(?:\.com)?$|cursor-setup-test/i;

export function shouldAutoEnrollEdesis(institutionId) {
  const id = String(institutionId || '').trim();
  if (!id) return true;
  return id === EDESIS_AUTO_ENROLL_INSTITUTION_ID;
}

export function edesisGradeFromClassLevel(classLevel) {
  const raw = String(classLevel || '').trim();
  if (!raw) return '8';
  const s = raw.toLocaleUpperCase('tr');
  if (s === 'LGS' || s.startsWith('8') || s.includes('LGS')) return '8';
  if (s.includes('YÖS') || s.includes('YOS')) return 'YÖS';
  if (s.includes('TYT') || s.includes('AYT') || s.includes('YKS') || s.includes('MEZUN')) return '12';
  const n = parseInt(s, 10);
  if (Number.isFinite(n) && n >= 1 && n <= 12) return String(n);
  return '8';
}

/** Lise / TYT-AYT-YKS → yaz dönemi; 3–8 ve LGS → normal 2026-2027. */
export function edesisTermKindFromClassLevel(classLevel) {
  const raw = String(classLevel || '').trim();
  const s = raw.toLocaleUpperCase('tr');
  if (!s) return 'regular';
  if (s.includes('YÖS') || s.includes('YOS')) return 'summer';
  if (s.includes('TYT') || s.includes('AYT') || s.includes('YKS') || s.includes('MEZUN')) return 'summer';
  const n = parseInt(s, 10);
  if (Number.isFinite(n) && n >= 9 && n <= 12) return 'summer';
  return 'regular';
}

export function pickEdesisTerm(terms, classLevel) {
  const kind = edesisTermKindFromClassLevel(classLevel);
  const list = Array.isArray(terms) ? terms : [];
  const want = kind === 'summer' ? EDESIS_TERM_SUMMER_NAME : EDESIS_TERM_REGULAR_NAME;
  const wantU = want.toLocaleUpperCase('tr');
  const exact = list.find((t) => String(t?.name || '').trim().toLocaleUpperCase('tr') === wantU);
  if (exact?.id) return { id: exact.id, name: String(exact.name || want), kind };
  if (kind === 'summer') {
    const fuzzy = list.find((t) => {
      const n = String(t?.name || '').toLocaleUpperCase('tr');
      return n.includes('2026') && n.includes('2027') && n.includes('YAZ');
    });
    if (fuzzy?.id) return { id: fuzzy.id, name: String(fuzzy.name || want), kind };
    return { id: EDESIS_TERM_SUMMER_ID_FALLBACK, name: EDESIS_TERM_SUMMER_NAME, kind };
  }
  const fuzzy = list.find((t) => {
    const n = String(t?.name || '').trim().toLocaleUpperCase('tr');
    return n === '2026-2027' || n === '2026 / 2027' || n === '2026-2027 DÖNEMİ';
  });
  if (fuzzy?.id) return { id: fuzzy.id, name: String(fuzzy.name || want), kind };
  return { id: EDESIS_TERM_REGULAR_ID_FALLBACK, name: EDESIS_TERM_REGULAR_NAME, kind };
}

export function skipEdesisAutoEnrollStudent(student) {
  const email = String(student?.email || '').trim().toLowerCase();
  const name = String(student?.name || '').trim();
  if (SKIP_AUTO_ENROLL_EMAIL.test(email)) return true;
  if (/^admin$/i.test(name)) return true;
  if (/^test(\s|$)/i.test(name)) return true;
  return false;
}

export function studentToPending(student) {
  const s = student && typeof student === 'object' ? student : {};
  const { firstName, lastName } = splitName(s.name);
  return {
    first_name: firstName,
    last_name: lastName,
    name: s.name,
    email: s.email,
    phone: s.phone,
    phone_e164: s.phone_e164 || s.phone,
    class_level: s.class_level,
    branch: s.branch || s.class_letter || s.school,
    parent_name: s.parent_name,
    parent_phone: s.parent_phone,
    parent_phone_e164: s.parent_phone_e164 || s.parent_phone,
    tc_identity_no: s.tc_identity_no,
    birth_date: s.birth_date
  };
}

function isShortClassroomLetterToken(raw) {
  const compact = String(raw || '')
    .trim()
    .toLocaleUpperCase('tr');
  if (!compact) return false;
  return (
    /^[A-H]$/.test(compact) ||
    /^\d+\s*[-.]?\s*[A-H]$/.test(compact) ||
    /^\d+[A-H]$/.test(compact.replace(/\s+/g, '')) ||
    /^[A-H]\s*SINIFI?$/.test(compact)
  );
}

export function extractClassroomLetter(classLevel, branch) {
  const level = String(classLevel || '').trim();
  const rawBranch = String(branch || '').trim();
  const examTrack = /(LGS|TYT|AYT|YKS|YÖS|YOS)/i.test(level);
  const branchForLetter = examTrack && !isShortClassroomLetterToken(rawBranch) ? '' : rawBranch;
  const blob = `${branchForLetter} ${level}`.toLocaleUpperCase('tr').trim();
  const m = blob.match(/(?:^|[\s.\-])([A-H])(?:\s|$|SINIF)/) || blob.match(/(\d)\s*([A-H])\b/);
  if (m) return (m[2] || m[1]).toLocaleUpperCase('tr');
  const only = blob.match(/^([A-H])$/);
  return only ? only[1] : '';
}

function classroomLetter(name) {
  const n = String(name || '').trim().toLocaleUpperCase('tr');
  if (/^[A-H]$/.test(n)) return n;
  const m = n.match(/^(\d+)\s*[- ]?\s*([A-H])(?:\b|$)/);
  if (m) return m[2];
  const m2 = n.match(/\b([A-H])(?:\s+SINIFI?)?$/);
  return m2 ? m2[1] : '';
}

function isUsableClassroom(row, termKind) {
  const name = String(row?.name || '');
  const full = String(row?.fullName || '');
  const grade = String(row?.gradeName || '');
  if (SKIP_CLASSROOM_NAME.test(name) || SKIP_CLASSROOM_NAME.test(full)) return false;
  if (termKind === 'regular') {
    if (/yaz/i.test(name) || /yaz/i.test(full) || /Y$/i.test(grade)) return false;
  }
  return true;
}

function newestClassroom(rows) {
  return (rows || [])
    .slice()
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0] || null;
}

export const EDESIS_AUTO_ENROLL_MARKER = 'edesis-auto-enroll-terms-2026-08-27j';

export function classroomIdsFromStudentRows(rows) {
  const ids = [];
  for (const row of rows || []) {
    const id = row?.classroomId ?? row?.ClassroomId ?? row?.subeId ?? row?.subeID;
    if (id == null || id === '') continue;
    if (!ids.some((x) => String(x) === String(id))) ids.push(id);
  }
  return ids;
}

export function pickEdesisClassroom(classrooms, { classLevel, branch, termKind, preferredIds } = {}) {
  const list = Array.isArray(classrooms) ? classrooms : [];
  const grade = edesisGradeFromClassLevel(classLevel);
  const kind = termKind || edesisTermKindFromClassLevel(classLevel);
  const pref = new Set((preferredIds || []).map((id) => String(id)));
  const gradeNames =
    kind === 'summer' && grade !== 'YÖS' ? [`${grade}Y`, grade] : [grade];
  let inGrade = [];
  for (const g of gradeNames) {
    inGrade = list.filter((c) => String(c.gradeName || '') === g);
    if (inGrade.length) break;
  }
  const poolAll = (inGrade.length ? inGrade : list).filter((c) => isUsableClassroom(c, kind));
  const inPref = pref.size ? poolAll.filter((c) => pref.has(String(c.id))) : [];
  let usable = inPref.length ? inPref : poolAll;
  if (pref.size && !inPref.length && kind === 'summer' && grade === '9') {
    const nineish = list.filter(
      (c) => pref.has(String(c.id)) && /9/.test(`${c.name || ''}${c.gradeName || ''}${c.fullName || ''}`)
    );
    if (nineish.length) usable = nineish;
    else {
      const tenY = list.filter((c) => pref.has(String(c.id)) && String(c.gradeName || '') === '10Y');
      if (tenY.length) usable = tenY;
    }
  }
  if (!usable.length) usable = poolAll.length ? poolAll : inGrade.length ? inGrade : list;
  const letter = extractClassroomLetter(classLevel, branch);
  const wantsLgsNamed = false;

  if (grade === 'YÖS') {
    const eki = usable.filter((c) => /2026\s*ekim/.test(foldNameKey(`${c.name || ''} ${c.fullName || ''}`)));
    if (eki.length) return newestClassroom(eki);
  }

  if (letter) {
    const byLetter = usable.filter((c) => classroomLetter(c.name) === letter);
    if (byLetter.length) return newestClassroom(byLetter);
  }

  if (wantsLgsNamed) {
    const namedLgs = usable.filter((c) => /lgs/i.test(String(c.name || '')));
    if (namedLgs.length) return newestClassroom(namedLgs);
  }

  const simpleA = usable.filter((c) => classroomLetter(c.name) === 'A' && /^[A-H]$/i.test(String(c.name || '').trim()));
  if (simpleA.length) return newestClassroom(simpleA);

  const simple = usable.filter((c) => /^[A-H]$/i.test(String(c.name || '').trim()));
  if (simple.length) return newestClassroom(simple);

  return newestClassroom(usable);
}

export function pickCreatedEdesisId(item) {
  if (item == null) return '';
  if (typeof item === 'number' || typeof item === 'string') {
    const s = String(item).trim();
    return s && s !== '0' ? s : '';
  }
  const root = typeof item === 'object' ? item : {};
  const nested =
    (root.result && typeof root.result === 'object' && !Array.isArray(root.result) ? root.result : null) ||
    (root.item && typeof root.item === 'object' ? root.item : null) ||
    (root.data && typeof root.data === 'object' && !Array.isArray(root.data) ? root.data : null) ||
    root;
  const id = nested.id ?? nested.Id ?? nested.studentId ?? nested.ogrenciId ?? nested.ogrenci_id;
  return id != null && String(id).trim() && String(id).trim() !== '0' ? String(id).trim() : '';
}

function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: 'Öğrenci', lastName: '-' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '-' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.slice(-1)[0] };
}

function edesisPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return undefined;
  if (d.length === 12 && d.startsWith('90')) return `0${d.slice(2)}`;
  if (d.length === 11 && d.startsWith('0')) return d;
  if (d.length === 10) return `0${d}`;
  return d;
}

function edesisCreatePassword() {
  return `Vip${randomBytes(9).toString('base64url')}9aA!`;
}

function buildStudentBody(pending, classroomId, termId) {
  const firstName = String(pending.first_name || '').trim();
  const lastName = String(pending.last_name || '').trim();
  const password = edesisCreatePassword();
  const body = {
    firstName: firstName || splitName(pending.name).firstName,
    lastName: lastName || splitName(pending.name).lastName,
    classroomId: Number(classroomId) || classroomId,
    password,
    passwordRepeat: password
  };
  if (termId != null && termId !== '') {
    const id = Number(termId) || termId;
    body.donemId = id;
  }
  const email = String(pending.email || '').trim().toLowerCase();
  if (email) body.email = email;
  const phone = edesisPhone(pending.phone_e164 || pending.phone);
  if (phone) body.phone = phone;
  const tc = String(pending.tc_identity_no || '').replace(/\D/g, '');
  if (tc.length === 11) {
    body.identityNumber = tc;
    body.tcNo = tc;
  }
  const birth = String(pending.birth_date || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(birth)) body.birthDate = birth;
  return body;
}

async function persistLink(platformStudentId, edesisStudentId) {
  if (!platformStudentId || !edesisStudentId) return false;
  const { supabaseAdmin } = await import('./supabase-admin.js');
  const { error } = await supabaseAdmin
    .from('students')
    .update({ edesis_ogrenci_id: String(edesisStudentId).trim() })
    .eq('id', platformStudentId);
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('edesis_ogrenci_id')) return false;
    throw error;
  }
  return true;
}

function rowEdesisId(row) {
  const keys = studentMatchKeysFromEdesisRow(row);
  return String(keys.edesisStudentId || '').trim();
}

function foldNameKey(s) {
  return String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

function pendingDisplayName(pending) {
  return String(pending?.name || `${pending?.first_name || ''} ${pending?.last_name || ''}`).trim();
}

function personNameKeys(name) {
  const keys = new Set(nameLookupKeys(name).map(foldNameKey).filter(Boolean));
  const tokens = foldNameKey(name)
    .replace(/[.\-_,']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((t) => t.length > 1);
  if (tokens.length >= 3) keys.add(tokens.slice(-2).join(' '));
  return keys;
}

function rowEdesisStudentId(row) {
  const keys = studentMatchKeysFromEdesisRow(row);
  return String(keys.edesisStudentId || row?.edesisId || row?.id || '').trim();
}

export function findInTermRows(rows, pending) {
  const email = String(pending?.email || '').trim().toLowerCase();
  const list = Array.isArray(rows) ? rows : [];
  if (email) {
    for (const row of list) {
      const keys = studentMatchKeysFromEdesisRow(row);
      const rowEmail = keys.email || String(row?.email || '').trim().toLowerCase();
      if (rowEmail && rowEmail === email) {
        const id = rowEdesisStudentId(row);
        if (id) return { edesisStudentId: id, matchMethod: 'email' };
      }
    }
  }
  const want = personNameKeys(pendingDisplayName(pending));
  if (!want.size) return null;
  const hits = [];
  for (const row of list) {
    const keys = studentMatchKeysFromEdesisRow(row);
    const have = personNameKeys(keys.name || row?.name);
    let hit = false;
    for (const k of have) {
      if (want.has(k)) {
        hit = true;
        break;
      }
    }
    if (!hit) continue;
    const id = rowEdesisStudentId(row);
    if (id) hits.push(id);
  }
  const unique = [...new Set(hits)];
  if (unique.length === 1) return { edesisStudentId: unique[0], matchMethod: 'name' };
  return null;
}

function idInTermRows(rows, edesisStudentId) {
  const want = String(edesisStudentId || '').trim();
  if (!want) return false;
  return (rows || []).some((row) => {
    const keys = studentMatchKeysFromEdesisRow(row);
    const id = String(keys.edesisStudentId || row?.edesisId || row?.id || '').trim();
    return id === want;
  });
}

async function listTermIdsForLookup() {
  const cached = enrollCatalogCache.terms;
  if (Array.isArray(cached) && cached.length) {
    return cached.map((t) => t.id).filter((id) => id != null && id !== '');
  }
  try {
    const listed = await fetchEdesisTermsList();
    return (listed.rows || []).map((t) => t.id).filter((id) => id != null && id !== '');
  } catch {
    return [EDESIS_TERM_REGULAR_ID_FALLBACK, EDESIS_TERM_SUMMER_ID_FALLBACK, 40];
  }
}

async function findExistingEdesisStudent(pending, termId) {
  const email = String(pending.email || '').trim().toLowerCase();
  if (!email) return null;
  try {
    const filters = { Filter: email };
    if (termId != null && termId !== '') filters.TermId = termId;
    const listed = await fetchEdesisStudentsList({}, filters);
    const hit = findInTermRows(listed.rows || [], pending);
    if (hit) return hit;
  } catch {
    /* onay düşmesin; diğer dönemler denenecek */
  }
  const skipId = termId != null && termId !== '' ? String(termId) : '';
  const termIds = await listTermIdsForLookup();
  for (const id of termIds) {
    if (skipId && String(id) === skipId) continue;
    try {
      const listed = await fetchEdesisStudentsList({}, { Filter: email, TermId: id });
      const hit = findInTermRows(listed.rows || [], pending);
      if (hit) return { ...hit, matchMethod: 'email_other_term' };
    } catch {
      /* sonraki dönem */
    }
  }
  return null;
}

async function createEdesisStudentWithFallback(pending, classroomId, cfg, termId) {
  const full = buildStudentBody(pending, classroomId, termId);
  try {
    return await createEdesisStudent(full, cfg);
  } catch (firstErr) {
    const attempts = [
      {
        firstName: full.firstName,
        lastName: full.lastName,
        classroomId: full.classroomId,
        password: full.password,
        passwordRepeat: full.passwordRepeat,
        studentState: 3,
        ...(full.donemId != null ? { donemId: full.donemId } : {}),
        ...(full.email ? { email: full.email } : {})
      },
      {
        adi: full.firstName,
        soyadi: full.lastName,
        classroomId: full.classroomId,
        password: full.password,
        passwordRepeat: full.passwordRepeat,
        studentState: 3,
        ...(full.donemId != null ? { donemId: full.donemId } : {}),
        ...(full.email ? { email: full.email } : {})
      }
    ];
    for (const body of attempts) {
      try {
        return await createEdesisStudent(body, cfg);
      } catch {
        /* sonraki deneme */
      }
    }
    const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
    if (/email adresi ile zaten|already.*email/i.test(msg) && full.email) {
      const phone = String(pending.phone_e164 || pending.phone || pending.parent_phone_e164 || pending.parent_phone || '').replace(/\D/g, '');
      const local = (phone.slice(-10) || foldNameKey(pendingDisplayName(pending)).replace(/\s+/g, '').slice(0, 24) || 'ogrenci') + Date.now().toString(36).slice(-4);
      const alt = {
        firstName: full.firstName,
        lastName: full.lastName,
        classroomId: full.classroomId,
        password: full.password,
        passwordRepeat: full.passwordRepeat,
        studentState: 3,
        email: `${local}@sinavza.com`
      };
      if (full.donemId != null) alt.donemId = full.donemId;
      try {
        return await createEdesisStudent(alt, cfg);
      } catch {
        /* yok */
      }
    }
    throw firstErr;
  }
}

async function moveStudentToTerm(edesisStudentId, term, classroom) {
  if (!edesisStudentId || !term?.id) return { ok: false, error: 'term_or_student_missing' };
  try {
    await changeEdesisStudentTerm({
      ogrenciId: edesisStudentId,
      donemId: term.id,
      subeId: classroom?.id,
      studentState: 3
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

let enrollCatalogCache = {
  at: 0,
  rooms: null,
  terms: null,
  regularRows: null,
  summerRows: null,
  otherTermRows: null
};
const enrollSkipUntil = new Map();

async function loadEnrollCatalog({ includeTermStudents = false } = {}) {
  const fresh = Date.now() - enrollCatalogCache.at < 90_000;
  if (fresh && enrollCatalogCache.rooms && enrollCatalogCache.terms) {
    if (
      !includeTermStudents ||
      (enrollCatalogCache.regularRows && enrollCatalogCache.summerRows && enrollCatalogCache.otherTermRows)
    ) {
      return enrollCatalogCache;
    }
  }
  const [rooms, terms] = await Promise.all([fetchEdesisClassroomsList(), fetchEdesisTermsList()]);
  const next = {
    at: Date.now(),
    rooms: rooms.rows || [],
    terms: terms.rows || [],
    regularRows: enrollCatalogCache.regularRows,
    summerRows: enrollCatalogCache.summerRows,
    otherTermRows: enrollCatalogCache.otherTermRows
  };
  if (includeTermStudents) {
    const regular = pickEdesisTerm(next.terms, 'LGS');
    const summer = pickEdesisTerm(next.terms, '9');
    const extraTerms = (next.terms || []).filter(
      (t) => t?.id != null && String(t.id) !== String(regular.id) && String(t.id) !== String(summer.id)
    );
    const [reg, yaz, ...extra] = await Promise.all([
      fetchEdesisStudentsList({}, { TermId: regular.id }),
      fetchEdesisStudentsList({}, { TermId: summer.id }),
      ...extraTerms.slice(0, 4).map((t) => fetchEdesisStudentsList({}, { TermId: t.id }))
    ]);
    next.regularRows = reg.rows || [];
    next.summerRows = yaz.rows || [];
    next.otherTermRows = extra.flatMap((listed) => listed.rows || []);
  }
  enrollCatalogCache = next;
  return next;
}

async function maybeCreateParent(pending, edesisStudentId) {
  const parentName = String(pending.parent_name || '').trim();
  if (!parentName || !edesisStudentId) return { created: false };
  const { firstName, lastName } = splitName(parentName);
  const body = {
    firstName,
    lastName,
    studentId: Number(edesisStudentId) || edesisStudentId
  };
  const phone = edesisPhone(pending.parent_phone_e164 || pending.parent_phone);
  if (phone) body.phone = phone;
  try {
    await createEdesisParent(body);
    return { created: true };
  } catch (e) {
    return { created: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function summarizeEdesisEnrollResult(edesis) {
  if (!edesis || edesis.skipped) {
    return { tone: 'success', extra: '' };
  }
  if (edesis.ok && edesis.edesisStudentId) {
    const room = edesis.classroom?.name ? ` (${edesis.classroom.name})` : '';
    const verb = edesis.created ? 'Edesis kaydı açıldı' : 'Mevcut Edesis kaydına bağlandı';
    return { tone: 'success', extra: ` ${verb}: ${edesis.edesisStudentId}${room}.` };
  }
  const err = edesis.error ? `: ${edesis.error}` : '.';
  return { tone: 'warning', extra: ` Edesis kaydı oluşturulamadı${err}` };
}

/**
 * Platform öğrencisi → Edesis kaydı (dönem + şube) + edesis_ogrenci_id.
 * Platform yazımını düşürmez.
 */
export async function provisionEdesisStudent({
  pending,
  platformStudentId,
  institutionId,
  allowRelinkToNewTerm = false,
  classrooms,
  terms,
  termStudentRows,
  otherTermRows
} = {}) {
  if (!shouldAutoEnrollEdesis(institutionId)) {
    return { skipped: true, reason: 'institution_not_edesis', marker: EDESIS_AUTO_ENROLL_MARKER };
  }
  if (skipEdesisAutoEnrollStudent(pending)) {
    return { skipped: true, reason: 'test_or_admin_account', marker: EDESIS_AUTO_ENROLL_MARKER };
  }
  const cfg = getEdesisConfig();
  if (!cfg.apiKey) {
    return { skipped: true, reason: 'EDESIS_API_KEY_missing', marker: EDESIS_AUTO_ENROLL_MARKER };
  }
  if (!platformStudentId) {
    return { ok: false, error: 'platform_student_id_missing', marker: EDESIS_AUTO_ENROLL_MARKER };
  }

  const { supabaseAdmin } = await import('./supabase-admin.js');
  const { data: student } = await supabaseAdmin
    .from('students')
    .select('id, edesis_ogrenci_id, email, name, class_level, school, parent_name, parent_phone, phone, birth_date, institution_id')
    .eq('id', platformStudentId)
    .maybeSingle();
  const source = pending && (pending.email || pending.name || pending.class_level)
    ? pending
    : studentToPending(student || {});
  const existingId = String(student?.edesis_ogrenci_id || '').trim();

  let catalog;
  try {
    catalog = classrooms && terms
      ? { rooms: classrooms, terms, otherTermRows }
      : await loadEnrollCatalog({ includeTermStudents: false });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'edesis_catalog_failed',
      marker: EDESIS_AUTO_ENROLL_MARKER
    };
  }

  const term = pickEdesisTerm(catalog.terms || [], source.class_level);
  const kind = term.kind;
  const inTermRows = termStudentRows || (kind === 'summer' ? enrollCatalogCache.summerRows : enrollCatalogCache.regularRows) || null;

  if (existingId && inTermRows && idInTermRows(inTermRows, existingId)) {
    return {
      ok: true,
      created: false,
      edesisStudentId: existingId,
      matchMethod: 'already_in_term',
      term,
      marker: EDESIS_AUTO_ENROLL_MARKER
    };
  }
  if (existingId && !allowRelinkToNewTerm) {
    return {
      ok: true,
      created: false,
      edesisStudentId: existingId,
      matchMethod: 'already_linked',
      term,
      marker: EDESIS_AUTO_ENROLL_MARKER
    };
  }

  const existing = inTermRows
    ? findInTermRows(inTermRows, source)
    : await findExistingEdesisStudent(source, term.id);
  if (existing?.edesisStudentId) {
    await persistLink(platformStudentId, existing.edesisStudentId);
    const parent = await maybeCreateParent(source, existing.edesisStudentId);
    return {
      ok: true,
      created: false,
      edesisStudentId: existing.edesisStudentId,
      matchMethod: existing.matchMethod,
      term,
      parent,
      marker: EDESIS_AUTO_ENROLL_MARKER
    };
  }

  const extraRows = otherTermRows || catalog.otherTermRows || enrollCatalogCache.otherTermRows || null;
  const cachedOther = extraRows ? findInTermRows(extraRows, source) : null;
  const anyTerm = cachedOther
    ? { ...cachedOther, matchMethod: 'email_other_term' }
    : await findExistingEdesisStudent(source);
  if (anyTerm?.edesisStudentId) {
    await persistLink(platformStudentId, anyTerm.edesisStudentId);
    const classroomEarly = pickEdesisClassroom(catalog.rooms || [], {
      classLevel: source.class_level,
      branch: source.branch,
      termKind: kind,
      preferredIds: classroomIdsFromStudentRows(inTermRows)
    });
    const moved = await moveStudentToTerm(anyTerm.edesisStudentId, term, classroomEarly);
    const parent = await maybeCreateParent(source, anyTerm.edesisStudentId);
    return {
      ok: true,
      created: false,
      edesisStudentId: anyTerm.edesisStudentId,
      matchMethod: 'email_other_term',
      classroom: classroomEarly
        ? { id: classroomEarly.id, name: classroomEarly.fullName || classroomEarly.name, gradeName: classroomEarly.gradeName }
        : undefined,
      term,
      termAssigned: moved.ok,
      termError: moved.ok ? undefined : moved.error,
      parent,
      marker: EDESIS_AUTO_ENROLL_MARKER
    };
  }

  const classroom = pickEdesisClassroom(catalog.rooms || [], {
    classLevel: source.class_level,
    branch: source.branch,
    termKind: kind,
    preferredIds: classroomIdsFromStudentRows(inTermRows)
  });
  if (!classroom?.id) {
    return { ok: false, error: 'edesis_classroom_not_found', term, marker: EDESIS_AUTO_ENROLL_MARKER };
  }

  const classroomInfo = {
    id: classroom.id,
    name: classroom.fullName || classroom.name,
    gradeName: classroom.gradeName
  };

  if (existingId && allowRelinkToNewTerm) {
    const moved = await moveStudentToTerm(existingId, term, classroom);
    const missing = /bulunamad[ıi]|not found|nesne bulunamad/i.test(String(moved.error || ''));
    if (moved.ok) {
      return {
        ok: true,
        created: false,
        edesisStudentId: existingId,
        matchMethod: 'term_changed',
        classroom: classroomInfo,
        term,
        termAssigned: true,
        marker: EDESIS_AUTO_ENROLL_MARKER
      };
    }
    if (!missing) {
      return {
        ok: false,
        created: false,
        edesisStudentId: existingId,
        matchMethod: 'term_changed',
        classroom: classroomInfo,
        term,
        termAssigned: false,
        error: moved.error,
        marker: EDESIS_AUTO_ENROLL_MARKER
      };
    }
  }

  let created;
  try {
    created = await createEdesisStudentWithFallback(source, classroom.id, cfg, term.id);
  } catch (e) {
    const again =
      (await findExistingEdesisStudent(source, term.id)) || (await findExistingEdesisStudent(source));
    if (again?.edesisStudentId) {
      await persistLink(platformStudentId, again.edesisStudentId);
      const moved = await moveStudentToTerm(again.edesisStudentId, term, classroom);
      const parent = await maybeCreateParent(source, again.edesisStudentId);
      return {
        ok: true,
        created: false,
        edesisStudentId: again.edesisStudentId,
        matchMethod: again.matchMethod,
        classroom: classroomInfo,
        term,
        termAssigned: moved.ok,
        parent,
        marker: EDESIS_AUTO_ENROLL_MARKER
      };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'edesis_create_student_failed',
      classroom: classroomInfo,
      term,
      marker: EDESIS_AUTO_ENROLL_MARKER
    };
  }

  let edesisStudentId = pickCreatedEdesisId(created);
  if (!edesisStudentId) {
    const again =
      (await findExistingEdesisStudent(source, term.id)) || (await findExistingEdesisStudent(source));
    edesisStudentId = again?.edesisStudentId || '';
  }
  if (!edesisStudentId) {
    return {
      ok: false,
      error: 'edesis_student_id_missing_after_create',
      classroom: classroomInfo,
      term,
      marker: EDESIS_AUTO_ENROLL_MARKER
    };
  }

  await persistLink(platformStudentId, edesisStudentId);
  const moved = await moveStudentToTerm(edesisStudentId, term, classroom);
  const parent = await maybeCreateParent(source, edesisStudentId);
  return {
    ok: true,
    created: true,
    edesisStudentId,
    classroom: classroomInfo,
    term,
    termAssigned: moved.ok,
    termError: moved.ok ? undefined : moved.error,
    parent,
    marker: EDESIS_AUTO_ENROLL_MARKER
  };
}

export async function provisionEdesisStudentOnApproval(opts) {
  return provisionEdesisStudent({ ...opts, allowRelinkToNewTerm: false });
}

export async function autoEnrollStudentRow(studentRow) {
  if (!studentRow?.id) return { skipped: true, reason: 'no_student' };
  try {
    return await provisionEdesisStudent({
      pending: studentToPending(studentRow),
      platformStudentId: studentRow.id,
      institutionId: studentRow.institution_id,
      allowRelinkToNewTerm: false
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'edesis_auto_enroll_failed',
      marker: EDESIS_AUTO_ENROLL_MARKER
    };
  }
}

/**
 * Online VIP platform öğrencilerini hedef 2026-2027 / YAZ dönemine yazar.
 * Hobby zaman aşımı için limit kadar yazma; tekrar çağrılınca kalanı işler.
 */
export async function enrollPlatformStudentsBatch({ limit = 6, institutionId } = {}) {
  if (institutionId && !shouldAutoEnrollEdesis(institutionId)) {
    return { skipped: true, reason: 'institution_not_edesis', marker: EDESIS_AUTO_ENROLL_MARKER };
  }
  const cfg = getEdesisConfig();
  if (!cfg.apiKey) {
    return { skipped: true, reason: 'EDESIS_API_KEY_missing', marker: EDESIS_AUTO_ENROLL_MARKER };
  }

  const { supabaseAdmin } = await import('./supabase-admin.js');
  const vip = EDESIS_AUTO_ENROLL_INSTITUTION_ID;
  const cols =
    'id, name, email, phone, class_level, school, branch, parent_name, parent_phone, birth_date, tc_identity_no, institution_id, edesis_ogrenci_id';
  let { data, error } = await supabaseAdmin
    .from('students')
    .select(cols)
    .or(`institution_id.eq.${vip},institution_id.is.null`)
    .order('id', { ascending: true })
    .limit(5000);
  if (error && String(error.message || '').includes('branch')) {
    ({ data, error } = await supabaseAdmin
      .from('students')
      .select(
        'id, name, email, phone, class_level, school, parent_name, parent_phone, birth_date, tc_identity_no, institution_id, edesis_ogrenci_id'
      )
      .or(`institution_id.eq.${vip},institution_id.is.null`)
      .order('id', { ascending: true })
      .limit(5000));
  }
  if (error) throw error;

  const catalog = await loadEnrollCatalog({ includeTermStudents: true });
  const maxWrites = Math.min(Math.max(Number(limit) || 6, 1), 10);
  const items = [];
  let remaining = 0;
  let writes = 0;
  let skipped = 0;
  let already = 0;

  const linkedWork = [];
  const unlinkedWork = [];
  for (const st of data || []) {
    if (skipEdesisAutoEnrollStudent(st) || !String(st.name || '').trim()) {
      skipped += 1;
      continue;
    }
    const term = pickEdesisTerm(catalog.terms, st.class_level);
    const termRows = term.kind === 'summer' ? catalog.summerRows : catalog.regularRows;
    const linkedId = String(st.edesis_ogrenci_id || '').trim();
    const inTermById = linkedId && idInTermRows(termRows, linkedId);
    const inTermHit = findInTermRows(termRows, studentToPending(st));
    if (inTermById || (inTermHit && linkedId && inTermHit.edesisStudentId === linkedId)) {
      already += 1;
      continue;
    }
    if (inTermHit && !linkedId) {
      await persistLink(st.id, inTermHit.edesisStudentId);
      items.push({
        id: st.id,
        name: st.name,
        ok: true,
        created: false,
        matchMethod: inTermHit.matchMethod,
        edesisStudentId: inTermHit.edesisStudentId,
        term
      });
      already += 1;
      continue;
    }
    const job = { st, term, termRows, linkedId };
    if (linkedId) linkedWork.push(job);
    else unlinkedWork.push(job);
  }

  for (const job of [...linkedWork, ...unlinkedWork]) {
    const { st, term, termRows } = job;
    if ((enrollSkipUntil.get(st.id) || 0) > Date.now()) {
      remaining += 1;
      continue;
    }
    if (writes >= maxWrites) {
      remaining += 1;
      continue;
    }
    const result = await provisionEdesisStudent({
      pending: studentToPending(st),
      platformStudentId: st.id,
      institutionId: st.institution_id || vip,
      allowRelinkToNewTerm: true,
      classrooms: catalog.rooms,
      terms: catalog.terms,
      termStudentRows: termRows,
      otherTermRows: catalog.otherTermRows
    });
    items.push({ id: st.id, name: st.name, class_level: st.class_level, ...result });
    writes += 1;
    if (result.ok && result.edesisStudentId) {
      const rowFake = {
        id: result.edesisStudentId,
        email: st.email,
        name: st.name,
        edesisId: result.edesisStudentId
      };
      if (term.kind === 'summer') catalog.summerRows = [...(catalog.summerRows || []), rowFake];
      else catalog.regularRows = [...(catalog.regularRows || []), rowFake];
    } else if (!result.ok) {
      enrollSkipUntil.set(st.id, Date.now() + 8 * 60 * 1000);
    }
  }

  enrollCatalogCache = { ...catalog, at: Date.now() };
  return {
    ok: true,
    done: remaining === 0,
    remaining,
    writes,
    skipped,
    already,
    count: (data || []).length,
    items,
    marker: EDESIS_AUTO_ENROLL_MARKER
  };
}

