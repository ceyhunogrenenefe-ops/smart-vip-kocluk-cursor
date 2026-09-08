/**
 * Öğretmen hakediş (payroll) — otomatik ders sayımı + manuel onay + ödeme → muhasebe gideri.
 * Mevcut class-live-lessons / teacher_group_lesson_* akışını bozmaz.
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
import {
  GROUP_LESSON_UNIT_MINUTES,
  roundUnits,
  sessionLessonUnits40
} from '../api/_lib/class-lesson-payment-units.js';

const jsonError = (res, status, error, extra) => res.status(status).json({ error, ...extra });
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_RATE = 500;
const PAYROLL_NOTE_PREFIX = 'teacher_payroll:';

function schemaMissing(err) {
  return /teacher_payroll_|does not exist|schema cache|PGRST205|relation .* does not exist/i.test(
    errorMessage(err)
  );
}

function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function isGuidanceSubject(subject) {
  const s = String(subject || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    s.includes('rehberlik') ||
    s.includes('rehber') ||
    s.includes('kocluk') ||
    s.includes('guidance') ||
    s.includes('coach')
  );
}

function privateLessonUnits(row) {
  const dm = row?.duration_minutes != null ? Number(row.duration_minutes) : NaN;
  if (Number.isFinite(dm) && dm > 0) {
    return roundUnits(dm / GROUP_LESSON_UNIT_MINUTES);
  }
  return sessionLessonUnits40(row);
}

function scopeInstitution(actor, roleSet, queryInst) {
  if (roleSetHasSuperAdmin(roleSet)) {
    return queryInst ? String(queryInst).trim() : actor.institution_id || null;
  }
  return actor.institution_id || null;
}

function parsePeriod(reqOrBody) {
  const from = String(reqOrBody?.from || reqOrBody?.period_from || '').trim().slice(0, 10);
  const to = String(reqOrBody?.to || reqOrBody?.period_to || '').trim().slice(0, 10);
  if (!YMD.test(from) || !YMD.test(to)) return null;
  if (from > to) return null;
  return { from, to };
}

function computeTotals({
  approvedGroup,
  approvedPrivate,
  approvedGuidance,
  groupRate,
  privateRate,
  guidanceRate,
  extrasSum
}) {
  const lessonGross = money(
    approvedGroup * groupRate + approvedPrivate * privateRate + approvedGuidance * guidanceRate
  );
  const extras = money(extrasSum);
  return {
    lesson_gross_tl: lessonGross,
    extras_tl: extras,
    total_tl: money(lessonGross + extras),
    total_units: roundUnits(approvedGroup + approvedPrivate + approvedGuidance),
    total_hours: roundUnits(
      ((approvedGroup + approvedPrivate + approvedGuidance) * GROUP_LESSON_UNIT_MINUTES) / 60
    )
  };
}

async function loadTeacherNames(ids) {
  const uniq = [...new Set((ids || []).map((x) => String(x || '').trim()).filter(Boolean))];
  const map = new Map();
  if (!uniq.length) return map;
  const { data } = await supabaseAdmin.from('users').select('id,name,email').in('id', uniq);
  for (const u of data || []) {
    map.set(String(u.id), String(u.name || u.email || u.id));
  }
  return map;
}

async function loadRatesMap(teacherIds) {
  const uniq = [...new Set((teacherIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
  const map = new Map();
  if (!uniq.length) return map;

  const { data: typed, error: te } = await supabaseAdmin
    .from('teacher_payroll_rates')
    .select('teacher_id,group_unit_price_tl,private_unit_price_tl,guidance_unit_price_tl')
    .in('teacher_id', uniq);
  if (te && !schemaMissing(te)) throw te;
  for (const r of typed || []) {
    map.set(String(r.teacher_id), {
      group_unit_price_tl: money(r.group_unit_price_tl ?? DEFAULT_RATE) || DEFAULT_RATE,
      private_unit_price_tl: money(r.private_unit_price_tl ?? DEFAULT_RATE) || DEFAULT_RATE,
      guidance_unit_price_tl: money(r.guidance_unit_price_tl ?? DEFAULT_RATE) || DEFAULT_RATE
    });
  }

  const missing = uniq.filter((id) => !map.has(id));
  if (missing.length) {
    const { data: legacy } = await supabaseAdmin
      .from('teacher_group_lesson_rates')
      .select('teacher_id,unit_price_tl')
      .in('teacher_id', missing);
    for (const r of legacy || []) {
      const p = money(r.unit_price_tl) || DEFAULT_RATE;
      map.set(String(r.teacher_id), {
        group_unit_price_tl: p,
        private_unit_price_tl: p,
        guidance_unit_price_tl: p
      });
    }
  }
  return map;
}

async function scanSystemCounts({ from, to, teacherId, institutionId }) {
  let sessQ = supabaseAdmin
    .from('class_sessions')
    .select('id,teacher_id,start_time,end_time,lesson_date,subject,status,institution_id')
    .eq('status', 'completed')
    .gte('lesson_date', from)
    .lte('lesson_date', to)
    .limit(8000);
  if (teacherId) sessQ = sessQ.eq('teacher_id', teacherId);
  if (institutionId) sessQ = sessQ.eq('institution_id', institutionId);
  const { data: sessions, error: se } = await sessQ;
  if (se) throw se;

  let privQ = supabaseAdmin
    .from('teacher_lessons')
    .select('id,teacher_id,duration_minutes,start_time,end_time,lesson_date,status,institution_id')
    .eq('status', 'completed')
    .gte('lesson_date', from)
    .lte('lesson_date', to)
    .limit(8000);
  if (teacherId) privQ = privQ.eq('teacher_id', teacherId);
  if (institutionId) privQ = privQ.eq('institution_id', institutionId);
  const { data: privates, error: pe } = await privQ;
  if (pe && !/teacher_lessons|does not exist|schema cache|PGRST205/i.test(errorMessage(pe))) throw pe;

  const byTeacher = new Map();
  const ensure = (tid) => {
    const id = String(tid || '').trim();
    if (!id) return null;
    if (!byTeacher.has(id)) {
      byTeacher.set(id, {
        teacher_id: id,
        system_group_units: 0,
        system_private_units: 0,
        system_guidance_units: 0,
        group_session_count: 0,
        private_session_count: 0,
        guidance_session_count: 0,
        total_minutes: 0
      });
    }
    return byTeacher.get(id);
  };

  for (const s of sessions || []) {
    const cur = ensure(s.teacher_id);
    if (!cur) continue;
    const units = sessionLessonUnits40(s);
    const mins = Math.round(units * GROUP_LESSON_UNIT_MINUTES);
    cur.total_minutes += mins;
    if (isGuidanceSubject(s.subject)) {
      cur.system_guidance_units = roundUnits(cur.system_guidance_units + units);
      cur.guidance_session_count += 1;
    } else {
      cur.system_group_units = roundUnits(cur.system_group_units + units);
      cur.group_session_count += 1;
    }
  }

  for (const s of privates || []) {
    const cur = ensure(s.teacher_id);
    if (!cur) continue;
    const units = privateLessonUnits(s);
    cur.system_private_units = roundUnits(cur.system_private_units + units);
    cur.private_session_count += 1;
    cur.total_minutes += Math.round(units * GROUP_LESSON_UNIT_MINUTES);
  }

  return byTeacher;
}

async function loadSettlements({ from, to, teacherId, institutionId }) {
  let q = supabaseAdmin
    .from('teacher_payroll_settlements')
    .select('*')
    .eq('period_from', from)
    .eq('period_to', to)
    .limit(2000);
  if (teacherId) q = q.eq('teacher_id', teacherId);
  if (institutionId) q = q.or(`institution_id.eq.${institutionId},institution_id.is.null`);
  const { data, error } = await q;
  if (error) {
    if (schemaMissing(error)) return { map: new Map(), table_missing: true };
    throw error;
  }
  const map = new Map();
  for (const row of data || []) {
    map.set(String(row.teacher_id), row);
  }
  return { map, table_missing: false };
}

async function loadLineItems({ from, to, teacherId, institutionId }) {
  let q = supabaseAdmin
    .from('teacher_payroll_line_items')
    .select('*')
    .eq('period_from', from)
    .eq('period_to', to)
    .order('created_at', { ascending: true })
    .limit(5000);
  if (teacherId) q = q.eq('teacher_id', teacherId);
  if (institutionId) q = q.or(`institution_id.eq.${institutionId},institution_id.is.null`);
  const { data, error } = await q;
  if (error) {
    if (schemaMissing(error)) return { items: [], table_missing: true };
    throw error;
  }
  return { items: data || [], table_missing: false };
}

async function handleSummary(req, res, actor, roleSet) {
  const period = parsePeriod(req.query || {});
  if (!period) return jsonError(res, 400, 'from_to_invalid', { hint: 'YYYY-MM-DD' });
  const teacherId = typeof req.query?.teacher_id === 'string' ? req.query.teacher_id.trim() : '';
  const institutionId = scopeInstitution(actor, roleSet, req.query?.institution_id);

  const systemMap = await scanSystemCounts({
    from: period.from,
    to: period.to,
    teacherId: teacherId || undefined,
    institutionId: roleSetHasAdmin(roleSet) && !roleSetHasSuperAdmin(roleSet) ? institutionId : institutionId
  });

  const { map: settlementMap, table_missing: settlementsMissing } = await loadSettlements({
    from: period.from,
    to: period.to,
    teacherId: teacherId || undefined,
    institutionId
  });
  const { items: lineItems, table_missing: linesMissing } = await loadLineItems({
    from: period.from,
    to: period.to,
    teacherId: teacherId || undefined,
    institutionId
  });

  const teacherIds = new Set([
    ...systemMap.keys(),
    ...settlementMap.keys(),
    ...lineItems.map((x) => String(x.teacher_id || ''))
  ]);
  if (teacherId) teacherIds.add(teacherId);

  // Seçili öğretmen listede yoksa bile kart göster (manuel kalem için)
  if (teacherId && !teacherIds.has(teacherId)) teacherIds.add(teacherId);

  const names = await loadTeacherNames([...teacherIds]);
  const ratesMap = await loadRatesMap([...teacherIds]);

  const extrasByTeacher = new Map();
  for (const item of lineItems) {
    const tid = String(item.teacher_id || '');
    if (!extrasByTeacher.has(tid)) extrasByTeacher.set(tid, []);
    extrasByTeacher.get(tid).push({
      id: item.id,
      label: item.label,
      amount_tl: money(item.amount_tl),
      note: item.note || null,
      created_at: item.created_at
    });
  }

  const teachers = [];
  for (const tid of teacherIds) {
    if (!tid) continue;
    if (teacherId && tid !== teacherId) continue;
    const sys = systemMap.get(tid) || {
      teacher_id: tid,
      system_group_units: 0,
      system_private_units: 0,
      system_guidance_units: 0,
      group_session_count: 0,
      private_session_count: 0,
      guidance_session_count: 0,
      total_minutes: 0
    };
    const settlement = settlementMap.get(tid) || null;
    const rates = ratesMap.get(tid) || {
      group_unit_price_tl: DEFAULT_RATE,
      private_unit_price_tl: DEFAULT_RATE,
      guidance_unit_price_tl: DEFAULT_RATE
    };

    const approvedGroup =
      settlement != null
        ? Number(settlement.approved_group_units)
        : Number(sys.system_group_units);
    const approvedPrivate =
      settlement != null
        ? Number(settlement.approved_private_units)
        : Number(sys.system_private_units);
    const approvedGuidance =
      settlement != null
        ? Number(settlement.approved_guidance_units)
        : Number(sys.system_guidance_units);

    const groupRate =
      settlement != null ? Number(settlement.group_unit_price_tl) : rates.group_unit_price_tl;
    const privateRate =
      settlement != null ? Number(settlement.private_unit_price_tl) : rates.private_unit_price_tl;
    const guidanceRate =
      settlement != null ? Number(settlement.guidance_unit_price_tl) : rates.guidance_unit_price_tl;

    const extras = extrasByTeacher.get(tid) || [];
    const extrasSum = extras.reduce((a, x) => a + Number(x.amount_tl || 0), 0);
    const computed = computeTotals({
      approvedGroup,
      approvedPrivate,
      approvedGuidance,
      groupRate,
      privateRate,
      guidanceRate,
      extrasSum
    });

    teachers.push({
      teacher_id: tid,
      teacher_name: names.get(tid) || tid,
      system: {
        group_units: roundUnits(sys.system_group_units),
        private_units: roundUnits(sys.system_private_units),
        guidance_units: roundUnits(sys.system_guidance_units),
        group_session_count: sys.group_session_count,
        private_session_count: sys.private_session_count,
        guidance_session_count: sys.guidance_session_count,
        total_minutes: sys.total_minutes
      },
      approved: {
        group_units: roundUnits(approvedGroup),
        private_units: roundUnits(approvedPrivate),
        guidance_units: roundUnits(approvedGuidance)
      },
      rates: {
        group_unit_price_tl: money(groupRate) || DEFAULT_RATE,
        private_unit_price_tl: money(privateRate) || DEFAULT_RATE,
        guidance_unit_price_tl: money(guidanceRate) || DEFAULT_RATE
      },
      default_rates: rates,
      extras,
      computed,
      settlement: settlement
        ? {
            id: settlement.id,
            status: settlement.status,
            locked: Boolean(settlement.locked) || settlement.status === 'paid',
            paid_at: settlement.paid_at,
            paid_by: settlement.paid_by,
            expense_item_id: settlement.expense_item_id,
            total_tl: money(settlement.total_tl)
          }
        : null
    });
  }

  teachers.sort((a, b) =>
    String(a.teacher_name || '').localeCompare(String(b.teacher_name || ''), 'tr')
  );

  const overview = teachers.reduce(
    (acc, t) => {
      acc.total_units = roundUnits(acc.total_units + t.computed.total_units);
      acc.total_hours = roundUnits(acc.total_hours + t.computed.total_hours);
      acc.gross_tl = money(acc.gross_tl + t.computed.lesson_gross_tl);
      acc.extras_tl = money(acc.extras_tl + t.computed.extras_tl);
      acc.net_tl = money(acc.net_tl + t.computed.total_tl);
      if (t.settlement?.status === 'paid') acc.paid_tl = money(acc.paid_tl + t.computed.total_tl);
      else acc.unpaid_tl = money(acc.unpaid_tl + t.computed.total_tl);
      return acc;
    },
    {
      total_units: 0,
      total_hours: 0,
      gross_tl: 0,
      extras_tl: 0,
      net_tl: 0,
      paid_tl: 0,
      unpaid_tl: 0,
      teacher_count: teachers.length
    }
  );

  return res.status(200).json({
    from: period.from,
    to: period.to,
    unit_period_minutes: GROUP_LESSON_UNIT_MINUTES,
    teachers,
    overview,
    schema_hint:
      settlementsMissing || linesMissing
        ? 'student-coaching-system/sql/2026-09-08-teacher-payroll-hakedis.sql'
        : null
  });
}

async function upsertSettlementRow({
  teacherId,
  institutionId,
  period,
  system,
  approved,
  rates,
  extrasSum,
  actorId,
  status = 'draft',
  locked = false,
  paidAt = null,
  paidBy = null,
  expenseItemId = null,
  existingId = null
}) {
  const computed = computeTotals({
    approvedGroup: approved.group_units,
    approvedPrivate: approved.private_units,
    approvedGuidance: approved.guidance_units,
    groupRate: rates.group_unit_price_tl,
    privateRate: rates.private_unit_price_tl,
    guidanceRate: rates.guidance_unit_price_tl,
    extrasSum
  });

  const row = {
    teacher_id: teacherId,
    institution_id: institutionId || null,
    period_from: period.from,
    period_to: period.to,
    system_group_units: roundUnits(system.group_units),
    system_private_units: roundUnits(system.private_units),
    system_guidance_units: roundUnits(system.guidance_units),
    approved_group_units: roundUnits(approved.group_units),
    approved_private_units: roundUnits(approved.private_units),
    approved_guidance_units: roundUnits(approved.guidance_units),
    group_unit_price_tl: money(rates.group_unit_price_tl) || DEFAULT_RATE,
    private_unit_price_tl: money(rates.private_unit_price_tl) || DEFAULT_RATE,
    guidance_unit_price_tl: money(rates.guidance_unit_price_tl) || DEFAULT_RATE,
    lesson_gross_tl: computed.lesson_gross_tl,
    extras_tl: computed.extras_tl,
    total_tl: computed.total_tl,
    status,
    locked,
    paid_at: paidAt,
    paid_by: paidBy,
    expense_item_id: expenseItemId,
    updated_at: new Date().toISOString()
  };

  if (existingId) {
    const { data, error } = await supabaseAdmin
      .from('teacher_payroll_settlements')
      .update(row)
      .eq('id', existingId)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return { settlement: data, computed };
  }

  row.created_by = actorId || null;
  const { data, error } = await supabaseAdmin
    .from('teacher_payroll_settlements')
    .insert(row)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return { settlement: data, computed };
}

async function findSettlement(teacherId, institutionId, period) {
  let q = supabaseAdmin
    .from('teacher_payroll_settlements')
    .select('*')
    .eq('teacher_id', teacherId)
    .eq('period_from', period.from)
    .eq('period_to', period.to)
    .limit(5);
  if (institutionId) q = q.or(`institution_id.eq.${institutionId},institution_id.is.null`);
  const { data, error } = await q;
  if (error) throw error;
  if (!data?.length) return null;
  const exact = data.find((r) => String(r.institution_id || '') === String(institutionId || ''));
  return exact || data[0];
}

async function handleSaveRates(req, res, actor, roleSet) {
  const body = req.body || {};
  const teacherId = String(body.teacher_id || '').trim();
  if (!teacherId) return jsonError(res, 400, 'teacher_id_required');
  const institutionId = scopeInstitution(actor, roleSet, body.institution_id);
  const group = Number(body.group_unit_price_tl ?? body.group_rate);
  const priv = Number(body.private_unit_price_tl ?? body.private_rate);
  const guide = Number(body.guidance_unit_price_tl ?? body.guidance_rate);
  if (![group, priv, guide].every((n) => Number.isFinite(n) && n >= 0)) {
    return jsonError(res, 400, 'invalid_rates');
  }

  const { data, error } = await supabaseAdmin
    .from('teacher_payroll_rates')
    .upsert(
      {
        teacher_id: teacherId,
        institution_id: institutionId || null,
        group_unit_price_tl: money(group),
        private_unit_price_tl: money(priv),
        guidance_unit_price_tl: money(guide),
        updated_at: new Date().toISOString(),
        updated_by: String(actor.sub || actor.id || '') || null
      },
      { onConflict: 'teacher_id' }
    )
    .select('*')
    .maybeSingle();
  if (error) {
    if (schemaMissing(error)) {
      return jsonError(res, 503, 'teacher_payroll_sql_missing', {
        hint: 'student-coaching-system/sql/2026-09-08-teacher-payroll-hakedis.sql'
      });
    }
    throw error;
  }

  // Eski grup ücreti tablosu varsa senkron tut (yoksa sessizce atla)
  try {
    const { error: legacyErr } = await supabaseAdmin.from('teacher_group_lesson_rates').upsert(
      {
        teacher_id: teacherId,
        institution_id: institutionId || null,
        unit_price_tl: money(group) || DEFAULT_RATE,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'teacher_id' }
    );
    if (legacyErr && !/teacher_group_lesson_rates|does not exist|schema cache|PGRST205/i.test(errorMessage(legacyErr))) {
      console.warn('[teacher-payroll] legacy rate sync', legacyErr.message);
    }
  } catch {
    /* ignore missing legacy table */
  }

  return res.status(200).json({ data });
}

async function handleSaveDraft(req, res, actor, roleSet) {
  const body = req.body || {};
  const teacherId = String(body.teacher_id || '').trim();
  const period = parsePeriod(body);
  if (!teacherId) return jsonError(res, 400, 'teacher_id_required');
  if (!period) return jsonError(res, 400, 'from_to_invalid');
  const institutionId = scopeInstitution(actor, roleSet, body.institution_id);

  const existing = await findSettlement(teacherId, institutionId, period).catch((e) => {
    if (schemaMissing(e)) return null;
    throw e;
  });
  if (existing && (existing.locked || existing.status === 'paid')) {
    return jsonError(res, 409, 'settlement_locked', { hint: 'Ödenen hakediş kartı kilitlidir.' });
  }

  const systemMap = await scanSystemCounts({
    from: period.from,
    to: period.to,
    teacherId,
    institutionId
  });
  const sys = systemMap.get(teacherId) || {
    system_group_units: 0,
    system_private_units: 0,
    system_guidance_units: 0
  };

  const approved = {
    group_units:
      body.approved_group_units != null
        ? Number(body.approved_group_units)
        : Number(sys.system_group_units),
    private_units:
      body.approved_private_units != null
        ? Number(body.approved_private_units)
        : Number(sys.system_private_units),
    guidance_units:
      body.approved_guidance_units != null
        ? Number(body.approved_guidance_units)
        : Number(sys.system_guidance_units)
  };
  if (![approved.group_units, approved.private_units, approved.guidance_units].every((n) => Number.isFinite(n) && n >= 0)) {
    return jsonError(res, 400, 'invalid_approved_units');
  }

  const ratesMap = await loadRatesMap([teacherId]);
  const defaults = ratesMap.get(teacherId) || {
    group_unit_price_tl: DEFAULT_RATE,
    private_unit_price_tl: DEFAULT_RATE,
    guidance_unit_price_tl: DEFAULT_RATE
  };
  const rates = {
    group_unit_price_tl:
      body.group_unit_price_tl != null ? Number(body.group_unit_price_tl) : defaults.group_unit_price_tl,
    private_unit_price_tl:
      body.private_unit_price_tl != null
        ? Number(body.private_unit_price_tl)
        : defaults.private_unit_price_tl,
    guidance_unit_price_tl:
      body.guidance_unit_price_tl != null
        ? Number(body.guidance_unit_price_tl)
        : defaults.guidance_unit_price_tl
  };

  const { items } = await loadLineItems({
    from: period.from,
    to: period.to,
    teacherId,
    institutionId
  });
  const extrasSum = items.reduce((a, x) => a + Number(x.amount_tl || 0), 0);

  try {
    const { settlement, computed } = await upsertSettlementRow({
      teacherId,
      institutionId,
      period,
      system: {
        group_units: sys.system_group_units,
        private_units: sys.system_private_units,
        guidance_units: sys.system_guidance_units
      },
      approved,
      rates,
      extrasSum,
      actorId: String(actor.sub || actor.id || ''),
      status: 'draft',
      locked: false,
      existingId: existing?.id || null
    });
    return res.status(200).json({ data: settlement, computed });
  } catch (e) {
    if (schemaMissing(e)) {
      return jsonError(res, 503, 'teacher_payroll_sql_missing', {
        hint: 'student-coaching-system/sql/2026-09-08-teacher-payroll-hakedis.sql'
      });
    }
    throw e;
  }
}

async function handleUpsertExtra(req, res, actor, roleSet) {
  const body = req.body || {};
  const teacherId = String(body.teacher_id || '').trim();
  const period = parsePeriod(body);
  const label = String(body.label || '').trim();
  const amount = Number(body.amount_tl ?? body.amount);
  if (!teacherId) return jsonError(res, 400, 'teacher_id_required');
  if (!period) return jsonError(res, 400, 'from_to_invalid');
  if (!label) return jsonError(res, 400, 'label_required');
  if (!Number.isFinite(amount)) return jsonError(res, 400, 'invalid_amount');

  const institutionId = scopeInstitution(actor, roleSet, body.institution_id);
  const existing = await findSettlement(teacherId, institutionId, period).catch((e) => {
    if (schemaMissing(e)) return null;
    throw e;
  });
  if (existing && (existing.locked || existing.status === 'paid')) {
    return jsonError(res, 409, 'settlement_locked');
  }

  const row = {
    teacher_id: teacherId,
    institution_id: institutionId || null,
    period_from: period.from,
    period_to: period.to,
    settlement_id: existing?.id || null,
    label,
    amount_tl: money(amount),
    note: body.note ? String(body.note).trim() : null,
    created_by: String(actor.sub || actor.id || '') || null
  };

  const { data, error } = await supabaseAdmin
    .from('teacher_payroll_line_items')
    .insert(row)
    .select('*')
    .maybeSingle();
  if (error) {
    if (schemaMissing(error)) {
      return jsonError(res, 503, 'teacher_payroll_sql_missing', {
        hint: 'student-coaching-system/sql/2026-09-08-teacher-payroll-hakedis.sql'
      });
    }
    throw error;
  }
  return res.status(201).json({ data });
}

async function handleDeleteExtra(req, res, actor, roleSet) {
  const id = String(req.body?.id || req.query?.id || '').trim();
  if (!id) return jsonError(res, 400, 'id_required');

  const { data: item, error: fe } = await supabaseAdmin
    .from('teacher_payroll_line_items')
    .select('id,teacher_id,period_from,period_to,institution_id')
    .eq('id', id)
    .maybeSingle();
  if (fe) {
    if (schemaMissing(fe)) return jsonError(res, 503, 'teacher_payroll_sql_missing');
    throw fe;
  }
  if (!item) return jsonError(res, 404, 'not_found');

  const institutionId = scopeInstitution(actor, roleSet, item.institution_id);
  if (roleSetHasAdmin(roleSet) && !roleSetHasSuperAdmin(roleSet) && item.institution_id) {
    if (!hasInstitutionAccess(actor, item.institution_id)) return jsonError(res, 403, 'forbidden');
  }

  const settlement = await findSettlement(item.teacher_id, institutionId, {
    from: item.period_from,
    to: item.period_to
  }).catch(() => null);
  if (settlement && (settlement.locked || settlement.status === 'paid')) {
    return jsonError(res, 409, 'settlement_locked');
  }

  const { error } = await supabaseAdmin.from('teacher_payroll_line_items').delete().eq('id', id);
  if (error) throw error;
  return res.status(200).json({ ok: true });
}

async function createPayrollExpense({ actor, institutionId, teacherName, period, totalTl, settlementId }) {
  const today = new Date();
  const itemDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const title = `${teacherName} - ${period.from} / ${period.to} Hakediş Ödemesi`;
  const row = {
    institution_id: institutionId || null,
    item_date: itemDate,
    category: 'maas',
    title,
    amount_tl: money(totalTl),
    note: `${PAYROLL_NOTE_PREFIX}${settlementId}`,
    created_by: String(actor.sub || actor.id || '') || null,
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabaseAdmin
    .from('institution_expense_items')
    .insert(row)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function handlePay(req, res, actor, roleSet) {
  const body = req.body || {};
  const teacherId = String(body.teacher_id || '').trim();
  const period = parsePeriod(body);
  if (!teacherId) return jsonError(res, 400, 'teacher_id_required');
  if (!period) return jsonError(res, 400, 'from_to_invalid');
  const institutionId = scopeInstitution(actor, roleSet, body.institution_id);

  // Önce mevcut settlement'ı bul
  let existing;
  try {
    existing = await findSettlement(teacherId, institutionId, period);
  } catch (e) {
    if (schemaMissing(e)) {
      return jsonError(res, 503, 'teacher_payroll_sql_missing', {
        hint: 'student-coaching-system/sql/2026-09-08-teacher-payroll-hakedis.sql'
      });
    }
    throw e;
  }

  if (existing && existing.status === 'paid' && existing.locked) {
    return res.status(200).json({ data: existing, already_paid: true });
  }

  const systemMap = await scanSystemCounts({
    from: period.from,
    to: period.to,
    teacherId,
    institutionId
  });
  const sys = systemMap.get(teacherId) || {
    system_group_units: 0,
    system_private_units: 0,
    system_guidance_units: 0
  };
  const approved = {
    group_units:
      body.approved_group_units != null
        ? Number(body.approved_group_units)
        : existing
          ? Number(existing.approved_group_units)
          : Number(sys.system_group_units),
    private_units:
      body.approved_private_units != null
        ? Number(body.approved_private_units)
        : existing
          ? Number(existing.approved_private_units)
          : Number(sys.system_private_units),
    guidance_units:
      body.approved_guidance_units != null
        ? Number(body.approved_guidance_units)
        : existing
          ? Number(existing.approved_guidance_units)
          : Number(sys.system_guidance_units)
  };
  const ratesMap = await loadRatesMap([teacherId]);
  const defaults = ratesMap.get(teacherId) || {
    group_unit_price_tl: DEFAULT_RATE,
    private_unit_price_tl: DEFAULT_RATE,
    guidance_unit_price_tl: DEFAULT_RATE
  };
  const rates = {
    group_unit_price_tl:
      body.group_unit_price_tl != null
        ? Number(body.group_unit_price_tl)
        : existing
          ? Number(existing.group_unit_price_tl)
          : defaults.group_unit_price_tl,
    private_unit_price_tl:
      body.private_unit_price_tl != null
        ? Number(body.private_unit_price_tl)
        : existing
          ? Number(existing.private_unit_price_tl)
          : defaults.private_unit_price_tl,
    guidance_unit_price_tl:
      body.guidance_unit_price_tl != null
        ? Number(body.guidance_unit_price_tl)
        : existing
          ? Number(existing.guidance_unit_price_tl)
          : defaults.guidance_unit_price_tl
  };

  const { items } = await loadLineItems({
    from: period.from,
    to: period.to,
    teacherId,
    institutionId
  });
  const extrasSum = items.reduce((a, x) => a + Number(x.amount_tl || 0), 0);

  const { settlement, computed } = await upsertSettlementRow({
    teacherId,
    institutionId,
    period,
    system: {
      group_units: sys.system_group_units,
      private_units: sys.system_private_units,
      guidance_units: sys.system_guidance_units
    },
    approved,
    rates,
    extrasSum,
    actorId: String(actor.sub || actor.id || ''),
    status: 'draft',
    locked: false,
    existingId: existing?.id || null
  });

  const names = await loadTeacherNames([teacherId]);
  const teacherName = names.get(teacherId) || teacherId;

  let expense = null;
  try {
    expense = await createPayrollExpense({
      actor,
      institutionId,
      teacherName,
      period,
      totalTl: computed.total_tl,
      settlementId: settlement.id
    });
  } catch (e) {
    if (/institution_expense_items|does not exist|schema cache|PGRST205/i.test(errorMessage(e))) {
      return jsonError(res, 503, 'muhasebe_ledger_sql_missing', {
        hint: 'student-coaching-system/sql/2026-08-06-muhasebe-ledger.sql'
      });
    }
    throw e;
  }

  const paidAt = new Date().toISOString();
  const paidBy = String(actor.sub || actor.id || '') || null;
  const { data: locked, error: le } = await supabaseAdmin
    .from('teacher_payroll_settlements')
    .update({
      status: 'paid',
      locked: true,
      paid_at: paidAt,
      paid_by: paidBy,
      expense_item_id: expense?.id || null,
      lesson_gross_tl: computed.lesson_gross_tl,
      extras_tl: computed.extras_tl,
      total_tl: computed.total_tl,
      updated_at: paidAt
    })
    .eq('id', settlement.id)
    .select('*')
    .maybeSingle();
  if (le) throw le;

  // Line items'ı settlement'a bağla
  await supabaseAdmin
    .from('teacher_payroll_line_items')
    .update({ settlement_id: settlement.id })
    .eq('teacher_id', teacherId)
    .eq('period_from', period.from)
    .eq('period_to', period.to);

  // Eski payout tablosuna da yaz (geriye dönük uyum)
  try {
    await supabaseAdmin.from('teacher_group_lesson_payouts').upsert(
      {
        teacher_id: teacherId,
        institution_id: institutionId || null,
        period_from: period.from,
        period_to: period.to,
        amount_tl: computed.total_tl,
        paid_at: paidAt,
        paid_by: paidBy,
        notes: `payroll:${settlement.id}`
      },
      { onConflict: 'teacher_id,institution_id,period_from,period_to' }
    );
  } catch {
    /* ignore legacy sync */
  }

  return res.status(200).json({
    data: locked,
    expense,
    computed,
    paid: true
  });
}

async function handleUnpay(req, res, actor, roleSet) {
  const body = req.body || {};
  const teacherId = String(body.teacher_id || '').trim();
  const period = parsePeriod(body);
  if (!teacherId) return jsonError(res, 400, 'teacher_id_required');
  if (!period) return jsonError(res, 400, 'from_to_invalid');
  const institutionId = scopeInstitution(actor, roleSet, body.institution_id);

  const existing = await findSettlement(teacherId, institutionId, period);
  if (!existing) return res.status(200).json({ ok: true, paid: false });

  if (existing.expense_item_id) {
    await supabaseAdmin.from('institution_expense_items').delete().eq('id', existing.expense_item_id);
  } else {
    await supabaseAdmin
      .from('institution_expense_items')
      .delete()
      .eq('note', `${PAYROLL_NOTE_PREFIX}${existing.id}`);
  }

  const { data, error } = await supabaseAdmin
    .from('teacher_payroll_settlements')
    .update({
      status: 'draft',
      locked: false,
      paid_at: null,
      paid_by: null,
      expense_item_id: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', existing.id)
    .select('*')
    .maybeSingle();
  if (error) throw error;

  try {
    let delQ = supabaseAdmin
      .from('teacher_group_lesson_payouts')
      .delete()
      .eq('teacher_id', teacherId)
      .eq('period_from', period.from)
      .eq('period_to', period.to);
    if (institutionId) delQ = delQ.eq('institution_id', institutionId);
    await delQ;
  } catch {
    /* ignore */
  }

  return res.status(200).json({ data, paid: false });
}

export default async function handler(req, res) {
  try {
    const actor = requireAuthenticatedActor(req);
    const roleSet = await actorRoleSet(actor);
    if (!actorIsAdminLike(actor, roleSet)) {
      return jsonError(res, 403, 'forbidden');
    }

    const op =
      (typeof req.query?.op === 'string' && req.query.op.trim()) ||
      (typeof req.body?.op === 'string' && req.body.op.trim()) ||
      '';

    if (req.method === 'GET') {
      return handleSummary(req, res, actor, roleSet);
    }

    if (req.method === 'POST') {
      if (op === 'save-rates') return handleSaveRates(req, res, actor, roleSet);
      if (op === 'save-draft') return handleSaveDraft(req, res, actor, roleSet);
      if (op === 'add-extra' || op === 'upsert-extra') return handleUpsertExtra(req, res, actor, roleSet);
      if (op === 'delete-extra') return handleDeleteExtra(req, res, actor, roleSet);
      if (op === 'pay') return handlePay(req, res, actor, roleSet);
      if (op === 'unpay') return handleUnpay(req, res, actor, roleSet);
      return jsonError(res, 400, 'unknown_op', {
        hint: 'save-rates | save-draft | add-extra | delete-extra | pay | unpay'
      });
    }

    if (req.method === 'DELETE') {
      return handleDeleteExtra(req, res, actor, roleSet);
    }

    return jsonError(res, 405, 'method_not_allowed');
  } catch (e) {
    const msg = errorMessage(e);
    if (/Missing token|Invalid token|Token expired/i.test(msg)) return jsonError(res, 401, msg);
    if (schemaMissing(e)) {
      return res.status(503).json({
        error: 'teacher_payroll_sql_missing',
        hint: 'Supabase SQL Editor’da student-coaching-system/sql/2026-09-08-teacher-payroll-hakedis.sql çalıştırın.'
      });
    }
    console.error('[teacher-payroll]', msg);
    return jsonError(res, 500, msg);
  }
}

export { PAYROLL_NOTE_PREFIX };
