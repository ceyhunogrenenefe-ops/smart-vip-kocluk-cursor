/**
 * Kayıt onayı → Edesis öğrenci (Online VIP Ders ve Koçluk).
 * Şube, sınıf seviyesine göre Edesis classrooms listesinden seçilir.
 */

import {
  createEdesisParent,
  createEdesisStudent,
  fetchEdesisClassroomsList,
  fetchEdesisStudentsList,
  getEdesisConfig,
  studentMatchKeysFromEdesisRow
} from './edesis-client.js';

export const EDESIS_AUTO_ENROLL_INSTITUTION_ID = '73323d75-eea1-4552-8bba-d50555423589';

const SKIP_CLASSROOM_NAME =
  /bursluluk|kayit silen|kayıt silen|sömestr|somestr|yaz kamp|kitap okuma|deneme klub|4zpz8|eu8bb|premium|özelders|^özel$/i;

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

export function extractClassroomLetter(classLevel, branch) {
  const blob = `${branch || ''} ${classLevel || ''}`.toLocaleUpperCase('tr').trim();
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

function isUsableClassroom(row) {
  const name = String(row?.name || '');
  const full = String(row?.fullName || '');
  return !SKIP_CLASSROOM_NAME.test(name) && !SKIP_CLASSROOM_NAME.test(full);
}

function newestClassroom(rows) {
  return (rows || [])
    .slice()
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0] || null;
}

export const EDESIS_AUTO_ENROLL_MARKER = 'edesis-auto-enroll-on-approve-2026-08-27';

export function pickEdesisClassroom(classrooms, { classLevel, branch } = {}) {
  const list = Array.isArray(classrooms) ? classrooms : [];
  const grade = edesisGradeFromClassLevel(classLevel);
  const inGrade = list.filter((c) => String(c.gradeName || '') === grade);
  const pool = (inGrade.length ? inGrade : list).filter(isUsableClassroom);
  const usable = pool.length ? pool : inGrade.length ? inGrade : list;
  const letter = extractClassroomLetter(classLevel, branch);
  const wantsLgsNamed = /LGS/i.test(String(classLevel || ''));

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

function buildStudentBody(pending, classroomId) {
  const firstName = String(pending.first_name || '').trim();
  const lastName = String(pending.last_name || '').trim();
  const body = {
    firstName: firstName || splitName(pending.name).firstName,
    lastName: lastName || splitName(pending.name).lastName,
    classroomId: Number(classroomId) || classroomId
  };
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

async function findExistingEdesisStudent(pending) {
  const email = String(pending.email || '').trim().toLowerCase();
  if (!email) return null;
  try {
    const listed = await fetchEdesisStudentsList({}, { Filter: email });
    for (const row of listed.rows || []) {
      const keys = studentMatchKeysFromEdesisRow(row);
      if (keys.email && keys.email === email && keys.edesisStudentId) {
        return { edesisStudentId: String(keys.edesisStudentId).trim(), matchMethod: 'email' };
      }
    }
  } catch {
    /* onay düşmesin; oluşturma denenecek */
  }
  return null;
}

async function createEdesisStudentWithFallback(pending, classroomId, cfg) {
  const full = buildStudentBody(pending, classroomId);
  try {
    return await createEdesisStudent(full, cfg);
  } catch (firstErr) {
    const minimal = {
      firstName: full.firstName,
      lastName: full.lastName,
      classroomId: full.classroomId
    };
    if (full.email) minimal.email = full.email;
    try {
      return await createEdesisStudent(minimal, cfg);
    } catch {
      throw firstErr;
    }
  }
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
 * Platform öğrencisi onaylandıktan sonra Edesis kaydı + edesis_ogrenci_id bağlama.
 * Platform onayını düşürmez; hata döner.
 */
export async function provisionEdesisStudentOnApproval({ pending, platformStudentId, institutionId }) {
  if (!shouldAutoEnrollEdesis(institutionId)) {
    return { skipped: true, reason: 'institution_not_edesis', marker: EDESIS_AUTO_ENROLL_MARKER };
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
    .select('id, edesis_ogrenci_id, email, name')
    .eq('id', platformStudentId)
    .maybeSingle();
  const existingId = String(student?.edesis_ogrenci_id || '').trim();
  if (existingId) {
    return {
      ok: true,
      created: false,
      edesisStudentId: existingId,
      matchMethod: 'already_linked',
      marker: EDESIS_AUTO_ENROLL_MARKER
    };
  }

  const existing = await findExistingEdesisStudent(pending);
  if (existing?.edesisStudentId) {
    await persistLink(platformStudentId, existing.edesisStudentId);
    const parent = await maybeCreateParent(pending, existing.edesisStudentId);
    return {
      ok: true,
      created: false,
      edesisStudentId: existing.edesisStudentId,
      matchMethod: existing.matchMethod,
      parent,
      marker: EDESIS_AUTO_ENROLL_MARKER
    };
  }

  let rooms;
  try {
    rooms = await fetchEdesisClassroomsList();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'edesis_classrooms_failed',
      marker: EDESIS_AUTO_ENROLL_MARKER
    };
  }
  const classroom = pickEdesisClassroom(rooms.rows || [], {
    classLevel: pending.class_level,
    branch: pending.branch
  });
  if (!classroom?.id) {
    return { ok: false, error: 'edesis_classroom_not_found', marker: EDESIS_AUTO_ENROLL_MARKER };
  }

  const classroomInfo = {
    id: classroom.id,
    name: classroom.fullName || classroom.name,
    gradeName: classroom.gradeName
  };

  let created;
  try {
    created = await createEdesisStudentWithFallback(pending, classroom.id, cfg);
  } catch (e) {
    const again = await findExistingEdesisStudent(pending);
    if (again?.edesisStudentId) {
      await persistLink(platformStudentId, again.edesisStudentId);
      const parent = await maybeCreateParent(pending, again.edesisStudentId);
      return {
        ok: true,
        created: false,
        edesisStudentId: again.edesisStudentId,
        matchMethod: again.matchMethod,
        classroom: classroomInfo,
        parent,
        marker: EDESIS_AUTO_ENROLL_MARKER
      };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'edesis_create_student_failed',
      classroom: classroomInfo,
      marker: EDESIS_AUTO_ENROLL_MARKER
    };
  }

  let edesisStudentId = pickCreatedEdesisId(created);
  if (!edesisStudentId) {
    const again = await findExistingEdesisStudent(pending);
    edesisStudentId = again?.edesisStudentId || '';
  }
  if (!edesisStudentId) {
    return {
      ok: false,
      error: 'edesis_student_id_missing_after_create',
      classroom: classroomInfo,
      marker: EDESIS_AUTO_ENROLL_MARKER
    };
  }

  await persistLink(platformStudentId, edesisStudentId);
  const parent = await maybeCreateParent(pending, edesisStudentId);
  return {
    ok: true,
    created: true,
    edesisStudentId,
    classroom: classroomInfo,
    parent,
    marker: EDESIS_AUTO_ENROLL_MARKER
  };
}
