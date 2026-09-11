/**
 * Muhasebe — Özel Ders Ücretleri (veli tahsilatı).
 * Öğretmen hakediş / payroll tablolarına yazmaz; yalnızca tamamlanan özel ders saatlerini okur.
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
const SQL_HINT = 'sql/2026-09-11-private-lesson-monthly-fees.sql';

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

  const feeByStudent = new Map();
  for (const row of feePack.rows) feeByStudent.set(String(row.student_id), row);

  const assignedTeachersByStudent = new Map();
  for (const a of assignments) {
    const sid = String(a.student_id || '').trim();
    const tid = String(a.teacher_id || '').trim();
    if (!sid || !tid) continue;
    if (!assignedTeachersByStudent.has(sid)) assignedTeachersByStudent.set(sid, new Set());
    assignedTeachersByStudent.get(sid).add(tid);
  }

  const studentIds = new Set([
    ...hoursMap.keys(),
    ...assignedTeachersByStudent.keys(),
    ...feeByStudent.keys()
  ]);

  const teacherIds = new Set();
  for (const sid of studentIds) {
    const h = hoursMap.get(sid);
    if (h) for (const tid of h.teachers.keys()) teacherIds.add(tid);
    const assigned = assignedTeachersByStudent.get(sid);
    if (assigned) for (const tid of assigned) teacherIds.add(tid);
  }

  const { studentMap, teacherMap } = await loadNames([...studentIds], [...teacherIds]);

  const rows = [];
  let sumSystemHours = 0;
  let sumHours = 0;
  let sumTotal = 0;
  let sumCollected = 0;
  let sumRemaining = 0;

  for (const sid of studentIds) {
    const hoursInfo = hoursMap.get(sid) || { system_hours: 0, teachers: new Map() };
    const fee = feeByStudent.get(sid) || null;
    const systemHours = roundUnits(hoursInfo.system_hours || 0);
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

    const teacherIdSet = new Set([
      ...hoursInfo.teachers.keys(),
      ...(assignedTeachersByStudent.get(sid) || [])
    ]);
    const teachers = [...teacherIdSet]
      .map((tid) => ({
        teacher_id: tid,
        teacher_name: teacherMap.get(tid) || tid,
        hours: roundUnits(hoursInfo.teachers.get(tid)?.hours || 0)
      }))
      .sort((a, b) => a.teacher_name.localeCompare(b.teacher_name, 'tr'));

    sumSystemHours = roundUnits(sumSystemHours + systemHours);
    sumHours = roundUnits(sumHours + hours);
    sumTotal = money(sumTotal + total);
    sumCollected = money(sumCollected + collected);
    sumRemaining = money(sumRemaining + remaining);

    rows.push({
      student_id: sid,
      student_name: studentMap.get(sid) || sid,
      teachers,
      system_hours: systemHours,
      hours_override: hoursOverride,
      hours,
      unit_price_tl: unitPrice,
      total_tl: total,
      amount_collected_tl: collected,
      remaining_tl: remaining,
      collection_status: status,
      notes: fee?.notes || null,
      fee_row_id: fee?.id || null
    });
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

async function handleUpsert(req, res, actor, roleSet) {
  const body = req.body || {};
  const inst = scopeInstitution(actor, roleSet, body.institution_id || req.query?.institution_id);
  if (!inst && !roleSetHasSuperAdmin(roleSet)) {
    return jsonError(res, 400, 'institution_required');
  }
  if (inst && !hasInstitutionAccess(actor, inst) && !roleSetHasSuperAdmin(roleSet)) {
    return jsonError(res, 403, 'forbidden');
  }

  const studentId = String(body.student_id || '').trim();
  const periodYm = String(body.month || body.period_ym || '').trim();
  if (!studentId) return jsonError(res, 400, 'student_id_required');
  if (!YM_RE.test(periodYm)) return jsonError(res, 400, 'invalid_month');

  const patch = {
    institution_id: inst || null,
    student_id: studentId,
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

  if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
    patch.notes = body.notes == null ? null : String(body.notes).slice(0, 2000);
  }

  let existingQ = supabaseAdmin
    .from('private_lesson_monthly_fees')
    .select('*')
    .eq('student_id', studentId)
    .eq('period_ym', periodYm)
    .limit(1);
  if (inst) existingQ = existingQ.eq('institution_id', inst);
  else existingQ = existingQ.is('institution_id', null);

  const { data: existingRows, error: findErr } = await existingQ;
  if (findErr) {
    if (feesSchemaMissing(findErr)) {
      return jsonError(res, 400, 'schema_missing', { hint: SQL_HINT });
    }
    throw findErr;
  }
  const existing = (existingRows || [])[0] || null;

  const bounds = monthBoundsYm(periodYm);
  const hoursMap = await scanPrivateLessonHoursByStudent({
    supabase: supabaseAdmin,
    from: bounds.from,
    to: bounds.to,
    institutionId: inst
  });
  const systemHours = roundUnits(hoursMap.get(studentId)?.system_hours || 0);
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
    if (patch.hours_override === undefined) patch.hours_override = null;
    const { data, error } = await supabaseAdmin
      .from('private_lesson_monthly_fees')
      .insert(patch)
      .select('*')
      .single();
    if (error) {
      if (feesSchemaMissing(error)) {
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
  if (error) throw error;
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
