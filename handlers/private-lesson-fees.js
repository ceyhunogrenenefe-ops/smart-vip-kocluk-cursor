/**
 * Muhasebe — Özel Ders Ücretleri (veli tahsilatı).
 * Öğretmen hakediş / payroll tablolarına yazmaz; yalnızca tamamlanan özel ders saatlerini okur.
 * Dış öğrenci + payment_accounts (banka) seçimi destekler.
 */
import { requireAuthenticatedActor, hasInstitutionAccess } from '../api/_lib/auth.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  actorIsAdminLike,
  actorRoleSet,
  roleSetHasAdmin,
  roleSetHasSuperAdmin
} from '../api/_lib/actor-roles.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { roundUnits } from '../api/_lib/class-lesson-payment-units.js';
import {
  monthBoundsYm,
  scanPrivateLessonHoursByStudent
} from '../api/_lib/private-lesson-fee-hours.js';

const jsonError = (res, status, error, extra) => res.status(status).json({ error, ...extra });
const YM_RE = /^\d{4}-\d{2}$/;
const STATUSES = new Set(['unpaid', 'partial', 'paid']);
const SQL_HINT = 'sql/2026-09-11-private-lesson-fees-external-bank.sql';

function feesSchemaMissing(err) {
  return /private_lesson_monthly_fees|does not exist|schema cache|PGRST205|relation .* does not exist/i.test(
    errorMessage(err)
  );
}

function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function scopeInstitution(actor, roleSet, queryInst) {
  if (roleSetHasSuperAdmin(roleSet)) {
    return queryInst ? String(queryInst).trim() : actor.institution_id || null;
  }
  return actor.institution_id || null;
}

function deriveStatus(collected, total) {
  const c = money(collected);
  const t = money(total);
  if (c <= 0) return 'unpaid';
  if (t > 0 && c + 0.009 >= t) return 'paid';
  return 'partial';
}

function rowKey(feeOrParts) {
  const sid = String(feeOrParts.student_id || '').trim();
  if (sid) return `s:${sid}`;
  const name = String(feeOrParts.external_student_name || '').trim().toLocaleLowerCase('tr');
  if (name) return `e:${name}`;
  const id = String(feeOrParts.id || feeOrParts.fee_row_id || '').trim();
  return id ? `id:${id}` : '';
}

async function loadFeeRows(institutionId, periodYm) {
  let q = supabaseAdmin
    .from('private_lesson_monthly_fees')
    .select('*')
    .eq('period_ym', periodYm)
    .limit(5000);
  if (institutionId) {
    q = q.or(`institution_id.eq.${institutionId},institution_id.is.null`);
  }
  const { data, error } = await q;
  if (error) {
    if (feesSchemaMissing(error)) return { rows: [], tableMissing: true };
    throw error;
  }
  return { rows: data || [], tableMissing: false };
}

async function loadAssignedPrivateStudents(institutionId) {
  let q = supabaseAdmin
    .from('teacher_private_lesson_assignments')
    .select('student_id,teacher_id,institution_id,active')
    .eq('active', true)
    .limit(8000);
  if (institutionId) q = q.eq('institution_id', institutionId);
  const { data, error } = await q;
  if (error) {
    if (
      /teacher_private_lesson_assignments|does not exist|schema cache|PGRST205/i.test(
        errorMessage(error)
      )
    ) {
      return [];
    }
    throw error;
  }
  return data || [];
}

async function loadNames(studentIds, teacherIds) {
  const studentMap = new Map();
  const teacherMap = new Map();
  const sids = [...new Set((studentIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
  const tids = [...new Set((teacherIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
  if (sids.length) {
    const { data } = await supabaseAdmin.from('students').select('id,name').in('id', sids);
    for (const s of data || []) studentMap.set(String(s.id), String(s.name || s.id));
  }
  if (tids.length) {
    const { data } = await supabaseAdmin.from('users').select('id,name,email').in('id', tids);
    for (const u of data || []) teacherMap.set(String(u.id), String(u.name || u.email || u.id));
  }
  return { studentMap, teacherMap };
}

async function loadPaymentAccountMap(accountIds) {
  const map = new Map();
  const ids = [...new Set((accountIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
  if (!ids.length) return map;
  const { data, error } = await supabaseAdmin
    .from('payment_accounts')
    .select('id,label,bank_name,account_holder,iban,account_type,active')
    .in('id', ids);
  if (error) {
    if (/payment_accounts|does not exist|schema cache|PGRST205/i.test(errorMessage(error))) {
      return map;
    }
    throw error;
  }
  for (const a of data || []) {
    map.set(String(a.id), {
      id: String(a.id),
      label: String(a.label || a.id),
      bank_name: a.bank_name || null,
      account_holder: a.account_holder || null,
      iban: a.iban || null,
      account_type: a.account_type || 'bank'
    });
  }
  return map;
}

function buildRow({
  key,
  studentId,
  externalName,
  isExternal,
  hoursInfo,
  fee,
  assignedTeacherIds,
  studentMap,
  teacherMap,
  accountMap
}) {
  const systemHours = roundUnits(hoursInfo?.system_hours || 0);
  const hoursOverride =
    fee?.hours_override != null && Number.isFinite(Number(fee.hours_override))
      ? money(fee.hours_override)
      : null;
  const hours = hoursOverride != null ? hoursOverride : systemHours;
  const unitPrice = fee ? money(fee.unit_price_tl) : 0;
  const total = money(hours * unitPrice);
  const collected = fee ? money(fee.amount_collected_tl) : 0;
  const status =
    fee?.collection_status && STATUSES.has(String(fee.collection_status))
      ? String(fee.collection_status)
      : deriveStatus(collected, total);
  const remaining = money(Math.max(0, total - collected));
  const accountId = fee?.payment_account_id ? String(fee.payment_account_id) : null;
  const account = accountId ? accountMap.get(accountId) || null : null;

  const teacherIdSet = new Set([
    ...(hoursInfo?.teachers ? hoursInfo.teachers.keys() : []),
    ...(assignedTeacherIds || [])
  ]);
  const teachers = [...teacherIdSet]
    .map((tid) => ({
      teacher_id: tid,
      teacher_name: teacherMap.get(tid) || tid,
      hours: roundUnits(hoursInfo?.teachers?.get(tid)?.hours || 0)
    }))
    .sort((a, b) => a.teacher_name.localeCompare(b.teacher_name, 'tr'));

  const displayName = isExternal
    ? externalName || fee?.external_student_name || 'Dış öğrenci'
    : studentMap.get(studentId) || studentId;

  return {
    row_key: key,
    student_id: studentId || null,
    external_student_name: isExternal ? externalName || fee?.external_student_name || null : null,
    is_external: Boolean(isExternal),
    student_name: displayName,
    teachers,
    system_hours: systemHours,
    hours_override: hoursOverride,
    hours,
    unit_price_tl: unitPrice,
    total_tl: total,
    amount_collected_tl: collected,
    remaining_tl: remaining,
    collection_status: status,
    payment_account_id: accountId,
    payment_account: account,
    notes: fee?.notes || null,
    fee_row_id: fee?.id || null
  };
}

async function handleList(req, res, actor, roleSet) {
  const inst = scopeInstitution(actor, roleSet, req.query?.institution_id);
  if (!inst && !roleSetHasSuperAdmin(roleSet)) {
    return res.status(200).json({ error: 'institution_required' });
  }
  if (inst && !hasInstitutionAccess(actor, inst) && !roleSetHasSuperAdmin(roleSet)) {
    return jsonError(res, 403, 'forbidden');
  }

  const periodYm = String(req.query?.month || req.query?.period_ym || '').trim();
  const bounds = monthBoundsYm(periodYm);
  if (!bounds) return jsonError(res, 400, 'invalid_month');

  const [hoursMap, assignments, feePack] = await Promise.all([
    scanPrivateLessonHoursByStudent({
      supabase: supabaseAdmin,
      from: bounds.from,
      to: bounds.to,
      institutionId: inst
    }),
    loadAssignedPrivateStudents(inst),
    loadFeeRows(inst, periodYm)
  ]);

  const feeByKey = new Map();
  for (const row of feePack.rows) {
    const key = rowKey(row);
    if (key) feeByKey.set(key, row);
  }

  const assignedTeachersByStudent = new Map();
  for (const a of assignments) {
    const sid = String(a.student_id || '').trim();
    const tid = String(a.teacher_id || '').trim();
    if (!sid || !tid) continue;
    if (!assignedTeachersByStudent.has(sid)) assignedTeachersByStudent.set(sid, new Set());
    assignedTeachersByStudent.get(sid).add(tid);
  }

  const systemStudentIds = new Set([
    ...hoursMap.keys(),
    ...assignedTeachersByStudent.keys(),
    ...feePack.rows.map((r) => String(r.student_id || '').trim()).filter(Boolean)
  ]);

  const teacherIds = new Set();
  for (const sid of systemStudentIds) {
    const h = hoursMap.get(sid);
    if (h) for (const tid of h.teachers.keys()) teacherIds.add(tid);
    const assigned = assignedTeachersByStudent.get(sid);
    if (assigned) for (const tid of assigned) teacherIds.add(tid);
  }

  const accountIds = feePack.rows.map((r) => r.payment_account_id).filter(Boolean);
  const [{ studentMap, teacherMap }, accountMap] = await Promise.all([
    loadNames([...systemStudentIds], [...teacherIds]),
    loadPaymentAccountMap(accountIds)
  ]);

  const rows = [];
  let sumSystemHours = 0;
  let sumHours = 0;
  let sumTotal = 0;
  let sumCollected = 0;
  let sumRemaining = 0;
  const seenKeys = new Set();

  for (const sid of systemStudentIds) {
    const key = `s:${sid}`;
    seenKeys.add(key);
    const built = buildRow({
      key,
      studentId: sid,
      externalName: null,
      isExternal: false,
      hoursInfo: hoursMap.get(sid) || { system_hours: 0, teachers: new Map() },
      fee: feeByKey.get(key) || null,
      assignedTeacherIds: assignedTeachersByStudent.get(sid) || [],
      studentMap,
      teacherMap,
      accountMap
    });
    sumSystemHours = roundUnits(sumSystemHours + built.system_hours);
    sumHours = roundUnits(sumHours + built.hours);
    sumTotal = money(sumTotal + built.total_tl);
    sumCollected = money(sumCollected + built.amount_collected_tl);
    sumRemaining = money(sumRemaining + built.remaining_tl);
    rows.push(built);
  }

  // Dış öğrenciler / yalnızca ücret kaydı olan satırlar
  for (const fee of feePack.rows) {
    const key = rowKey(fee);
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    const isExternal = !String(fee.student_id || '').trim();
    const built = buildRow({
      key,
      studentId: isExternal ? null : String(fee.student_id),
      externalName: fee.external_student_name || null,
      isExternal,
      hoursInfo: { system_hours: 0, teachers: new Map() },
      fee,
      assignedTeacherIds: [],
      studentMap,
      teacherMap,
      accountMap
    });
    sumSystemHours = roundUnits(sumSystemHours + built.system_hours);
    sumHours = roundUnits(sumHours + built.hours);
    sumTotal = money(sumTotal + built.total_tl);
    sumCollected = money(sumCollected + built.amount_collected_tl);
    sumRemaining = money(sumRemaining + built.remaining_tl);
    rows.push(built);
  }

  rows.sort((a, b) => String(a.student_name || '').localeCompare(String(b.student_name || ''), 'tr'));

  return res.status(200).json({
    month: periodYm,
    from: bounds.from,
    to: bounds.to,
    rows,
    summary: {
      student_count: rows.length,
      system_hours: sumSystemHours,
      hours: sumHours,
      total_tl: sumTotal,
      collected_tl: sumCollected,
      remaining_tl: sumRemaining
    },
    hint: feePack.tableMissing ? SQL_HINT : null
  });
}

async function findExistingFee({ inst, studentId, externalName, periodYm, feeRowId }) {
  if (feeRowId) {
    const { data, error } = await supabaseAdmin
      .from('private_lesson_monthly_fees')
      .select('*')
      .eq('id', feeRowId)
      .limit(1);
    if (error) throw error;
    return (data || [])[0] || null;
  }

  let q = supabaseAdmin
    .from('private_lesson_monthly_fees')
    .select('*')
    .eq('period_ym', periodYm)
    .limit(1);
  if (inst) q = q.eq('institution_id', inst);
  else q = q.is('institution_id', null);

  if (studentId) {
    q = q.eq('student_id', studentId);
  } else {
    q = q.is('student_id', null).ilike('external_student_name', externalName);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data || [])[0] || null;
}

async function handleUpsert(req, res, actor, roleSet) {
  const body = req.body || {};
  const inst = scopeInstitution(actor, roleSet, body.institution_id || req.query?.institution_id);
  if (!inst && !roleSetHasSuperAdmin(roleSet)) {
    return jsonError(res, 400, 'institution_required');
  }
  if (inst && !hasInstitutionAccess(actor, inst) && !roleSetHasSuperAdmin(roleSet)) {
    return jsonError(res, 403, 'forbidden');
  }

  const periodYm = String(body.month || body.period_ym || '').trim();
  if (!YM_RE.test(periodYm)) return jsonError(res, 400, 'invalid_month');

  const isExternal = Boolean(
    body.is_external || (!String(body.student_id || '').trim() && body.external_student_name)
  );
  const studentId = isExternal ? null : String(body.student_id || '').trim() || null;
  const externalName = isExternal
    ? String(body.external_student_name || body.student_name || '').trim()
    : null;

  if (!isExternal && !studentId) return jsonError(res, 400, 'student_id_required');
  if (isExternal && !externalName) return jsonError(res, 400, 'external_student_name_required');

  const feeRowId = body.fee_row_id ? String(body.fee_row_id).trim() : null;

  const patch = {
    institution_id: inst || null,
    student_id: studentId,
    external_student_name: externalName,
    period_ym: periodYm,
    updated_by: actor.sub || actor.id || null,
    updated_at: new Date().toISOString()
  };

  if (Object.prototype.hasOwnProperty.call(body, 'hours_override')) {
    if (body.hours_override === null || body.hours_override === '') {
      patch.hours_override = null;
    } else {
      const h = Number(body.hours_override);
      if (!Number.isFinite(h) || h < 0) return jsonError(res, 400, 'invalid_hours_override');
      patch.hours_override = money(h);
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'unit_price_tl')) {
    const p = Number(body.unit_price_tl);
    if (!Number.isFinite(p) || p < 0) return jsonError(res, 400, 'invalid_unit_price');
    patch.unit_price_tl = money(p);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'amount_collected_tl')) {
    const c = Number(body.amount_collected_tl);
    if (!Number.isFinite(c) || c < 0) return jsonError(res, 400, 'invalid_amount_collected');
    patch.amount_collected_tl = money(c);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'payment_account_id')) {
    if (body.payment_account_id === null || body.payment_account_id === '') {
      patch.payment_account_id = null;
    } else {
      patch.payment_account_id = String(body.payment_account_id).trim();
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
    patch.notes = body.notes == null ? null : String(body.notes).slice(0, 2000);
  }

  let existing;
  try {
    existing = await findExistingFee({
      inst,
      studentId,
      externalName,
      periodYm,
      feeRowId
    });
  } catch (findErr) {
    if (feesSchemaMissing(findErr)) {
      return jsonError(res, 400, 'schema_missing', { hint: SQL_HINT });
    }
    // external_student_name / payment_account_id kolonları yoksa alter SQL iste
    if (/external_student_name|payment_account_id|schema cache/i.test(errorMessage(findErr))) {
      return jsonError(res, 400, 'schema_missing', { hint: SQL_HINT });
    }
    throw findErr;
  }

  const bounds = monthBoundsYm(periodYm);
  let systemHours = 0;
  if (studentId) {
    const hoursMap = await scanPrivateLessonHoursByStudent({
      supabase: supabaseAdmin,
      from: bounds.from,
      to: bounds.to,
      institutionId: inst
    });
    systemHours = roundUnits(hoursMap.get(studentId)?.system_hours || 0);
  }

  const hoursOverride =
    patch.hours_override !== undefined
      ? patch.hours_override
      : existing?.hours_override != null
        ? Number(existing.hours_override)
        : null;
  const hours = hoursOverride != null ? money(hoursOverride) : systemHours;
  const unitPrice =
    patch.unit_price_tl !== undefined
      ? patch.unit_price_tl
      : existing
        ? money(existing.unit_price_tl)
        : 0;
  const total = money(hours * unitPrice);
  const collected =
    patch.amount_collected_tl !== undefined
      ? patch.amount_collected_tl
      : existing
        ? money(existing.amount_collected_tl)
        : 0;

  if (Object.prototype.hasOwnProperty.call(body, 'collection_status')) {
    const st = String(body.collection_status || '').trim();
    if (!STATUSES.has(st)) return jsonError(res, 400, 'invalid_collection_status');
    patch.collection_status = st;
  } else {
    patch.collection_status = deriveStatus(collected, total);
  }

  if (!existing) {
    if (patch.unit_price_tl === undefined) patch.unit_price_tl = 0;
    if (patch.amount_collected_tl === undefined) patch.amount_collected_tl = 0;
    if (patch.hours_override === undefined) patch.hours_override = isExternal ? hoursOverride ?? 0 : null;
    if (patch.payment_account_id === undefined) patch.payment_account_id = null;
    const { data, error } = await supabaseAdmin
      .from('private_lesson_monthly_fees')
      .insert(patch)
      .select('*')
      .single();
    if (error) {
      if (
        feesSchemaMissing(error) ||
        /external_student_name|payment_account_id|schema cache/i.test(errorMessage(error))
      ) {
        return jsonError(res, 400, 'schema_missing', { hint: SQL_HINT });
      }
      throw error;
    }
    return res.status(200).json({ data, system_hours: systemHours, hours, total_tl: total });
  }

  const { data, error } = await supabaseAdmin
    .from('private_lesson_monthly_fees')
    .update(patch)
    .eq('id', existing.id)
    .select('*')
    .single();
  if (error) {
    if (/external_student_name|payment_account_id|schema cache/i.test(errorMessage(error))) {
      return jsonError(res, 400, 'schema_missing', { hint: SQL_HINT });
    }
    throw error;
  }
  return res.status(200).json({ data, system_hours: systemHours, hours, total_tl: total });
}

/** Genel bakış için: ay içi tahsil edilen özel ders ücretleri toplamı */
export async function loadPrivateLessonFeeCollections(institutionId, from, to) {
  const empty = { collected_sum: 0, row_count: 0 };
  const ymFrom = String(from || '').slice(0, 7);
  const ymTo = String(to || '').slice(0, 7);
  if (!YM_RE.test(ymFrom) || !YM_RE.test(ymTo)) return empty;

  let q = supabaseAdmin
    .from('private_lesson_monthly_fees')
    .select('period_ym,amount_collected_tl')
    .gte('period_ym', ymFrom)
    .lte('period_ym', ymTo)
    .limit(5000);
  if (institutionId) {
    q = q.or(`institution_id.eq.${institutionId},institution_id.is.null`);
  }
  const { data, error } = await q;
  if (error) {
    if (feesSchemaMissing(error)) return empty;
    throw error;
  }

  let collected = 0;
  for (const row of data || []) collected += Number(row.amount_collected_tl) || 0;
  return { collected_sum: money(collected), row_count: (data || []).length };
}

async function handleDelete(req, res, actor, roleSet) {
  const body = req.body || {};
  const inst = scopeInstitution(actor, roleSet, body.institution_id || req.query?.institution_id);
  if (!inst && !roleSetHasSuperAdmin(roleSet)) {
    return jsonError(res, 400, 'institution_required');
  }
  if (inst && !hasInstitutionAccess(actor, inst) && !roleSetHasSuperAdmin(roleSet)) {
    return jsonError(res, 403, 'forbidden');
  }

  const periodYm = String(body.month || body.period_ym || req.query?.month || '').trim();
  const feeRowId = String(body.fee_row_id || req.query?.fee_row_id || '').trim() || null;
  const studentId = String(body.student_id || req.query?.student_id || '').trim() || null;
  const externalName = String(
    body.external_student_name || req.query?.external_student_name || ''
  ).trim() || null;

  if (!feeRowId && !studentId && !externalName) {
    return jsonError(res, 400, 'fee_row_id_or_student_required');
  }
  if (!feeRowId && !YM_RE.test(periodYm)) {
    return jsonError(res, 400, 'invalid_month');
  }

  let existing;
  try {
    existing = await findExistingFee({
      inst,
      studentId: studentId || null,
      externalName: externalName || null,
      periodYm: periodYm || '',
      feeRowId
    });
  } catch (findErr) {
    if (feesSchemaMissing(findErr)) {
      return jsonError(res, 400, 'schema_missing', { hint: SQL_HINT });
    }
    throw findErr;
  }

  if (!existing) {
    return jsonError(res, 404, 'fee_row_not_found');
  }

  if (inst && existing.institution_id && String(existing.institution_id) !== String(inst)) {
    return jsonError(res, 403, 'forbidden');
  }

  const { error } = await supabaseAdmin
    .from('private_lesson_monthly_fees')
    .delete()
    .eq('id', existing.id);
  if (error) {
    if (feesSchemaMissing(error)) {
      return jsonError(res, 400, 'schema_missing', { hint: SQL_HINT });
    }
    throw error;
  }

  return res.status(200).json({
    ok: true,
    deleted_id: existing.id,
    was_external: !String(existing.student_id || '').trim()
  });
}

export default async function handler(req, res) {
  try {
    const actor = requireAuthenticatedActor(req);
    const roleSet = await actorRoleSet(actor);
    if (!actorIsAdminLike(actor, roleSet) && !roleSetHasAdmin(roleSet)) {
      return jsonError(res, 403, 'forbidden');
    }
    if (req.method === 'GET') return handleList(req, res, actor, roleSet);
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      return handleUpsert(req, res, actor, roleSet);
    }
    if (req.method === 'DELETE') return handleDelete(req, res, actor, roleSet);
    return jsonError(res, 405, 'method_not_allowed');
  } catch (e) {
    const msg = errorMessage(e);
    if (/Missing token|Invalid token|Token expired|Invalid signature/i.test(msg)) {
      return jsonError(res, 401, msg);
    }
    console.error('[private-lesson-fees]', msg);
    return jsonError(res, 500, msg);
  }
}
