/**
 * Kayıt Takibi API
 * GET/POST/PATCH /api/registration-tracking?op=...
 */
import { requireAuthenticatedActor, hasInstitutionAccess } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { isMissingTableError } from '../api/_lib/supabase-schema.js';
import { isUuid } from '../api/_lib/uuid.js';
import {
  normalizeTrPhone,
  normalizeGradeProgram,
  computeConversionRate,
  isOverdue,
  splitFullName,
  phoneLookupVariants,
  istanbulDayBounds,
  STAGES,
  LOST_REASONS,
  TASK_TYPES,
  GRADE_PROGRAMS
} from '../api/_lib/registration-tracking-utils.js';
import { ensureExcelBoardLeads } from '../api/_lib/registration-tracking-excel-seed.js';

const PLATFORM_PRIMARY_INSTITUTION_ID = '73323d75-eea1-4552-8bba-d50555423589';

function parseBody(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b || '{}');
    } catch {
      return {};
    }
  }
  return {};
}

function roleOf(actor) {
  return String(actor?.role || '').trim().toLowerCase();
}

async function loadRoleTags(userId) {
  if (!userId) return [];
  try {
    const { data } = await supabaseAdmin.from('users').select('role, roles').eq('id', userId).maybeSingle();
    const tags = new Set();
    const r = String(data?.role || '').toLowerCase();
    if (r) tags.add(r);
    if (Array.isArray(data?.roles)) {
      for (const x of data.roles) {
        const t = String(x || '').toLowerCase();
        if (t) tags.add(t);
      }
    }
    return [...tags];
  } catch {
    return [];
  }
}

function isManager(tags) {
  return tags.includes('super_admin') || tags.includes('admin');
}

function canAccessModule(tags) {
  if (isManager(tags)) return true;
  return tags.includes('coach') || tags.includes('teacher');
}

function canSeeFinancial(tags) {
  return tags.includes('super_admin') || tags.includes('admin');
}

async function resolveInstitutionId(actor, queryInst) {
  const q = String(queryInst || '').trim();
  if (q && isUuid(q)) return q;
  if (actor.institution_id) return String(actor.institution_id);
  const { data: u } = await supabaseAdmin
    .from('users')
    .select('institution_id')
    .eq('id', actor.sub)
    .maybeSingle();
  if (u?.institution_id) return String(u.institution_id);
  if (roleOf(actor) === 'super_admin') return PLATFORM_PRIMARY_INSTITUTION_ID;
  return null;
}

function missingTableResponse(res) {
  return res.status(503).json({
    error: 'table_missing',
    message:
      'Kayıt Takibi tabloları henüz kurulmadı. Supabase SQL Editor\'da 2026-08-17-registration-tracking.sql dosyasını çalıştırın.',
    sql_file: 'student-coaching-system/sql/2026-08-17-registration-tracking.sql'
  });
}

async function auditLog({ institutionId, leadId, action, actorUserId, oldValue, newValue }) {
  try {
    await supabaseAdmin.from('registration_audit_logs').insert({
      institution_id: institutionId,
      lead_id: leadId || null,
      action,
      actor_user_id: actorUserId || null,
      old_value: oldValue ?? null,
      new_value: newValue ?? null
    });
  } catch {
    /* best-effort */
  }
}

async function notifyUser({ title, body, targetUserId, linkUrl, senderId, institutionId }) {
  if (!targetUserId) return;
  const dedupKey = `reg_track:${targetUserId}:${String(title).slice(0, 50)}:${Date.now().slice(0, -5)}`;
  try {
    const { data: existing } = await supabaseAdmin
      .from('platform_notifications')
      .select('id')
      .eq('target_user_id', targetUserId)
      .ilike('title', String(title).slice(0, 100))
      .gte('created_at', new Date(Date.now() - 3600000).toISOString())
      .limit(1);
    if (existing?.length) return;
    await supabaseAdmin.from('platform_notifications').insert({
      title: String(title).slice(0, 200),
      body: String(body).slice(0, 4000),
      target_type: 'user',
      target_user_id: targetUserId,
      sender_user_id: senderId || 'system',
      sender_role: 'admin',
      institution_id: institutionId || null,
      priority: 'normal',
      link_url: linkUrl || '/toplanti-takip?tab=kayit-takibi'
    });
  } catch {
    /* optional */
  }
}

function sanitizeLeadForActor(lead, tags) {
  if (!lead) return lead;
  if (canSeeFinancial(tags)) return lead;
  const { offered_price, discount_amount, final_offer_amount, ...rest } = lead;
  return { ...rest, offered_price: null, discount_amount: null, final_offer_amount: null };
}

function applyLeadFilters(q, filters, institutionId) {
  let query = q.eq('institution_id', institutionId).is('deleted_at', null);

  if (filters.primary_status) {
    const statuses = String(filters.primary_status).split(',').filter(Boolean);
    if (statuses.length === 1) query = query.eq('primary_status', statuses[0]);
    else if (statuses.length > 1) query = query.in('primary_status', statuses);
  } else if (filters.include_lost !== '1' && filters.include_lost !== 'true') {
    query = query.neq('primary_status', 'lost');
  }

  if (filters.stage) query = query.eq('stage', filters.stage);
  if (filters.grade_program) query = query.eq('grade_program', filters.grade_program);
  if (filters.temperature) query = query.eq('temperature', filters.temperature);
  if (filters.assigned_user_id) query = query.eq('assigned_user_id', filters.assigned_user_id);
  if (filters.academic_period_key) query = query.eq('academic_period_key', filters.academic_period_key);
  if (filters.source) query = query.ilike('source', `%${filters.source}%`);

  if (filters.search) {
    const s = String(filters.search).trim();
    query = query.or(
      `full_name.ilike.%${s}%,parent_full_name.ilike.%${s}%,normalized_phone.ilike.%${s}%,phone.ilike.%${s}%`
    );
  }

  if (filters.overdue === '1' || filters.overdue === 'true') {
    query = query.lt('next_action_at', new Date().toISOString()).eq('primary_status', 'tracking');
  }

  if (filters.payment_pending === '1' || filters.payment_pending === 'true') {
    query = query.eq('stage', 'payment_pending');
  }

  if (filters.next_action_from) {
    query = query.gte('next_action_at', filters.next_action_from);
  }
  if (filters.next_action_to) {
    query = query.lte('next_action_at', filters.next_action_to);
  }

  if (filters.created_from) query = query.gte('created_at', filters.created_from);
  if (filters.created_to) query = query.lte('created_at', filters.created_to);

  if (filters.date_from) {
    const b = istanbulDayBounds(filters.date_from);
    if (b) query = query.gte('created_at', b.start);
  }
  if (filters.date_to) {
    const b = istanbulDayBounds(filters.date_to);
    if (b) query = query.lte('created_at', b.end);
  }

  if (filters.coach_id) query = query.eq('assigned_user_id', filters.coach_id);

  return query;
}

async function findDuplicates(institutionId, payload) {
  const phone = normalizeTrPhone(payload.phone);
  const fullName = String(payload.full_name || `${payload.first_name || ''} ${payload.last_name || ''}`)
    .trim()
    .toLocaleLowerCase('tr-TR');
  const period = String(payload.academic_period_key || '').trim();
  const grade = normalizeGradeProgram(payload.grade_program) || payload.grade_program;

  let query = supabaseAdmin
    .from('registration_leads')
    .select('id, full_name, grade_program, primary_status, stage, normalized_phone, academic_period_key, created_at')
    .eq('institution_id', institutionId)
    .is('deleted_at', null);

  if (phone) query = query.eq('normalized_phone', phone);
  if (grade) query = query.eq('grade_program', grade);
  if (period) query = query.eq('academic_period_key', period);

  const { data, error } = await query.limit(20);
  if (error) throw error;

  return (data || []).filter((row) => {
    const rowName = String(row.full_name || '').toLocaleLowerCase('tr-TR').trim();
    return !fullName || rowName.includes(fullName) || fullName.includes(rowName);
  });
}

async function maybeSeedExcelBoard(institutionId) {
  try {
    return await ensureExcelBoardLeads(supabaseAdmin, institutionId);
  } catch (e) {
    if (isMissingTableError(e, 'registration_leads')) throw e;
    console.warn('[registration-tracking] excel seed', errorMessage(e));
    return null;
  }
}

async function handleDashboard(institutionId, filters) {
  let base = supabaseAdmin.from('registration_leads').select('*').eq('institution_id', institutionId).is('deleted_at', null);
  base = applyLeadFilters(base, { ...filters, include_lost: filters.include_lost || '0' }, institutionId);
  const { data: leads, error } = await base.limit(5000);
  if (error) throw error;

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const all = leads || [];
  const tracking = all.filter((l) => l.primary_status === 'tracking');
  const confirmed = all.filter((l) => l.primary_status === 'confirmed');
  const lost = all.filter((l) => l.primary_status === 'lost');

  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const conversion = computeConversionRate(all);

  const byGrade = {};
  for (const g of GRADE_PROGRAMS) {
    byGrade[g.code] = {
      label: g.label,
      tracking: tracking.filter((l) => l.grade_program === g.code).length,
      confirmed: confirmed.filter((l) => l.grade_program === g.code).length
    };
  }

  const stageDistribution = {};
  for (const s of STAGES) {
    stageDistribution[s] = all.filter((l) => l.stage === s).length;
  }

  return {
    total_tracking: tracking.length,
    total_confirmed: confirmed.length,
    new_this_week: all.filter((l) => new Date(l.created_at) >= weekStart).length,
    confirmed_this_week: confirmed.filter((l) => l.confirmed_at && new Date(l.confirmed_at) >= weekStart).length,
    confirmed_this_month: confirmed.filter((l) => l.confirmed_at && new Date(l.confirmed_at) >= monthStart).length,
    payment_pending: all.filter((l) => l.stage === 'payment_pending').length,
    call_today: tracking.filter((l) => {
      if (!l.next_action_at) return false;
      const d = new Date(l.next_action_at);
      return d >= now && d <= todayEnd;
    }).length,
    overdue: tracking.filter((l) => isOverdue(l.next_action_at, now)).length,
    lost_count: lost.length,
    conversion_rate: conversion.rate,
    by_grade: byGrade,
    stage_distribution: stageDistribution
  };
}

async function handleList(institutionId, filters, tags, actor) {
  const page = Math.max(1, parseInt(filters.page || '1', 10) || 1);
  const pageSize = Math.min(200, Math.max(10, parseInt(filters.page_size || '50', 10) || 50));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabaseAdmin
    .from('registration_leads')
    .select('*', { count: 'exact' })
    .order(filters.sort_by || 'updated_at', { ascending: filters.sort_dir === 'asc' });

  query = applyLeadFilters(query, filters, institutionId);

  if (!isManager(tags) && (tags.includes('coach') || tags.includes('teacher'))) {
    query = query.eq('assigned_user_id', actor.sub);
  }

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  return {
    items: (data || []).map((l) => sanitizeLeadForActor(l, tags)),
    total: count ?? 0,
    page,
    page_size: pageSize
  };
}

async function handleGetLead(leadId, institutionId, tags) {
  const { data: lead, error } = await supabaseAdmin
    .from('registration_leads')
    .select('*')
    .eq('id', leadId)
    .eq('institution_id', institutionId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!lead) return null;

  const [interactions, tasks, meetingLinks, audit, tagRows] = await Promise.all([
    supabaseAdmin
      .from('registration_interactions')
      .select('*')
      .eq('lead_id', leadId)
      .order('interaction_at', { ascending: false }),
    supabaseAdmin
      .from('registration_tasks')
      .select('*')
      .eq('lead_id', leadId)
      .order('due_at', { ascending: true }),
    supabaseAdmin.from('registration_meeting_links').select('*').eq('lead_id', leadId),
    supabaseAdmin
      .from('registration_audit_logs')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabaseAdmin.from('registration_lead_tags').select('tag_id, registration_tags(id, name, color)').eq('lead_id', leadId)
  ]);

  return {
    lead: sanitizeLeadForActor(lead, tags),
    interactions: interactions.data || [],
    tasks: tasks.data || [],
    meeting_links: meetingLinks.data || [],
    audit_logs: audit.data || [],
    tags: (tagRows.data || []).map((r) => r.registration_tags).filter(Boolean)
  };
}

async function resolveCoachRow(coachId) {
  if (!coachId) return null;
  const { data: c } = await supabaseAdmin.from('coaches').select('id, name, email').eq('id', coachId).maybeSingle();
  if (c?.id) return { id: String(c.id), name: c.name || 'Koç', email: c.email || null };
  const { data: u } = await supabaseAdmin.from('users').select('id, name, email').eq('id', coachId).maybeSingle();
  if (u?.id) return { id: String(u.id), name: u.name || 'Koç', email: u.email || null };
  return { id: String(coachId), name: 'Koç', email: null };
}

async function lookupCoachByParentPhone(institutionId, phoneRaw) {
  const phone = normalizeTrPhone(phoneRaw);
  if (!phone) {
    return { phone: null, coach: null, parent_full_name: null, linked_student_id: null };
  }
  const variants = phoneLookupVariants(phone);
  let coachId = null;
  let parentName = null;
  let studentId = null;

  try {
    let q = supabaseAdmin
      .from('students')
      .select('id, name, parent_name, parent_phone, coach_id')
      .eq('institution_id', institutionId)
      .limit(20);
    if (variants.length === 1) q = q.eq('parent_phone', variants[0]);
    else q = q.in('parent_phone', variants);
    const { data: students } = await q;
    const hit = (students || []).find((s) => s.coach_id) || (students || [])[0];
    if (hit) {
      coachId = hit.coach_id || null;
      parentName = hit.parent_name || null;
      studentId = hit.id || null;
    }
  } catch {
    /* students tablosu yoksa leads'e düş */
  }

  if (!coachId) {
    const { data: leads } = await supabaseAdmin
      .from('registration_leads')
      .select('assigned_user_id, parent_full_name, linked_student_id')
      .eq('institution_id', institutionId)
      .eq('normalized_phone', phone)
      .is('deleted_at', null)
      .not('assigned_user_id', 'is', null)
      .limit(5);
    const lead = (leads || [])[0];
    if (lead) {
      coachId = lead.assigned_user_id;
      parentName = parentName || lead.parent_full_name;
      studentId = studentId || lead.linked_student_id;
    }
  }

  const coach = await resolveCoachRow(coachId);
  return {
    phone,
    coach,
    parent_full_name: parentName,
    linked_student_id: studentId
  };
}

async function handleListCoaches(institutionId) {
  let q = supabaseAdmin.from('coaches').select('id, name, email').order('name').limit(400);
  if (institutionId) q = q.eq('institution_id', institutionId);
  const { data, error } = await q;
  if (!error) {
    return (data || []).map((c) => ({ id: String(c.id), name: c.name || 'Koç', email: c.email || null }));
  }
  const { data: users } = await supabaseAdmin
    .from('users')
    .select('id, name, email, role, roles')
    .eq('institution_id', institutionId)
    .limit(400);
  return (users || [])
    .filter((u) => {
      const tags = [String(u.role || '').toLowerCase(), ...(Array.isArray(u.roles) ? u.roles.map((x) => String(x).toLowerCase()) : [])];
      return tags.includes('coach');
    })
    .map((u) => ({ id: String(u.id), name: u.name || 'Koç', email: u.email || null }));
}

async function handleCreateLead(body, institutionId, actor) {
  const names = body.first_name
    ? { first_name: body.first_name, last_name: body.last_name || '' }
    : splitFullName(body.full_name || body.student_name);

  const phone = normalizeTrPhone(body.phone);
  const altPhone = normalizeTrPhone(body.alternate_phone);
  const grade = normalizeGradeProgram(body.grade_program) || body.grade_program;

  if (!names.first_name || !grade) {
    throw new Error('Öğrenci adı ve sınıf/program zorunludur');
  }

  const isConfirmed = body.primary_status === 'confirmed';
  let assignedUserId = body.assigned_user_id || null;
  let parentName = body.parent_full_name || null;
  let linkedStudentId = body.linked_student_id || null;

  if (phone && !assignedUserId) {
    const looked = await lookupCoachByParentPhone(institutionId, phone);
    if (looked.coach?.id) assignedUserId = looked.coach.id;
    if (!parentName && looked.parent_full_name) parentName = looked.parent_full_name;
    if (!linkedStudentId && looked.linked_student_id) linkedStudentId = looked.linked_student_id;
  }

  const nowIso = new Date().toISOString();
  const row = {
    institution_id: institutionId,
    academic_period_id: body.academic_period_id || null,
    academic_period_key: body.academic_period_key || null,
    linked_student_id: linkedStudentId,
    first_name: names.first_name,
    last_name: names.last_name || '',
    parent_full_name: parentName,
    phone: body.phone || null,
    normalized_phone: phone,
    alternate_phone: body.alternate_phone || null,
    normalized_alternate_phone: altPhone,
    email: body.email || null,
    grade_program: grade,
    interested_package: body.interested_package || null,
    primary_status: isConfirmed ? 'confirmed' : 'tracking',
    stage: isConfirmed ? 'confirmed' : body.stage && STAGES.includes(body.stage) ? body.stage : 'new_lead',
    temperature: body.temperature || (isConfirmed ? 'hot' : 'warm'),
    probability: body.probability != null ? Number(body.probability) : null,
    source: body.source || null,
    assigned_user_id: assignedUserId,
    next_action_at: body.next_action_at || null,
    next_action_type: body.next_action_type || null,
    parent_expectations: body.parent_expectations || null,
    registration_obstacles: body.registration_obstacles || null,
    offered_price: body.offered_price != null ? Number(body.offered_price) : null,
    discount_amount: body.discount_amount != null ? Number(body.discount_amount) : null,
    final_offer_amount: body.final_offer_amount != null ? Number(body.final_offer_amount) : null,
    notes: body.notes || null,
    confirmed_at: isConfirmed ? nowIso : null,
    confirmed_by: isConfirmed ? actor.sub : null,
    created_by: actor.sub,
    updated_by: actor.sub
  };

  const { data, error } = await supabaseAdmin.from('registration_leads').insert(row).select('*').single();
  if (error) throw error;

  await auditLog({
    institutionId,
    leadId: data.id,
    action: 'created',
    actorUserId: actor.sub,
    newValue: { id: data.id, grade_program: grade }
  });

  if (data.assigned_user_id && data.assigned_user_id !== actor.sub) {
    await notifyUser({
      title: 'Yeni kayıt adayı atandı',
      body: `${data.full_name} — ${grade}`,
      targetUserId: data.assigned_user_id,
      senderId: actor.sub,
      institutionId
    });
  }

  return data;
}

async function handleUpdateLead(leadId, body, institutionId, actor, tags) {
  const { data: existing, error: exErr } = await supabaseAdmin
    .from('registration_leads')
    .select('*')
    .eq('id', leadId)
    .eq('institution_id', institutionId)
    .is('deleted_at', null)
    .maybeSingle();
  if (exErr) throw exErr;
  if (!existing) throw new Error('Kayıt bulunamadı');

  const patch = { updated_by: actor.sub, updated_at: new Date().toISOString() };
  const allowed = [
    'first_name', 'last_name', 'parent_full_name', 'phone', 'alternate_phone', 'email',
    'grade_program', 'interested_package', 'stage', 'temperature', 'probability', 'source',
    'assigned_user_id', 'first_contact_at', 'last_contact_at', 'next_action_at', 'next_action_type',
    'parent_expectations', 'registration_obstacles', 'notes', 'academic_period_id', 'academic_period_key'
  ];

  if (canSeeFinancial(tags)) {
    allowed.push('offered_price', 'discount_amount', 'final_offer_amount');
  }

  for (const k of allowed) {
    if (body[k] !== undefined) patch[k] = body[k];
  }

  if (patch.phone !== undefined) {
    patch.normalized_phone = normalizeTrPhone(patch.phone);
  }
  if (patch.alternate_phone !== undefined) {
    patch.normalized_alternate_phone = normalizeTrPhone(patch.alternate_phone);
  }
  if (patch.grade_program !== undefined) {
    patch.grade_program = normalizeGradeProgram(patch.grade_program) || patch.grade_program;
  }

  if (body.stage && body.stage !== existing.stage) {
    await supabaseAdmin.from('registration_stage_history').insert({
      lead_id: leadId,
      old_primary_status: existing.primary_status,
      new_primary_status: existing.primary_status,
      old_stage: existing.stage,
      new_stage: body.stage,
      changed_by: actor.sub
    });
    patch.stage = body.stage;
  }

  const { data, error } = await supabaseAdmin
    .from('registration_leads')
    .update(patch)
    .eq('id', leadId)
    .select('*')
    .single();
  if (error) throw error;

  await auditLog({
    institutionId,
    leadId,
    action: 'updated',
    actorUserId: actor.sub,
    oldValue: existing,
    newValue: patch
  });

  if (patch.assigned_user_id && patch.assigned_user_id !== existing.assigned_user_id) {
    await notifyUser({
      title: 'Kayıt adayı size atandı',
      body: data.full_name,
      targetUserId: patch.assigned_user_id,
      senderId: actor.sub,
      institutionId
    });
  }

  return data;
}

async function handleConfirm(body, institutionId, actor) {
  const { data, error } = await supabaseAdmin.rpc('registration_confirm_lead', {
    p_lead_id: body.lead_id,
    p_actor_user_id: actor.sub,
    p_grade_program: normalizeGradeProgram(body.grade_program) || body.grade_program,
    p_class_group: body.class_group || null,
    p_academic_period_key: body.academic_period_key || null,
    p_confirmed_at: body.confirmed_at || new Date().toISOString(),
    p_total_amount: body.total_amount != null ? Number(body.total_amount) : null,
    p_discount_amount: body.discount_amount != null ? Number(body.discount_amount) : null,
    p_final_amount: body.final_amount != null ? Number(body.final_amount) : null,
    p_payment_method: body.payment_method || null,
    p_down_payment: body.down_payment != null ? Number(body.down_payment) : null,
    p_remaining_amount: body.remaining_amount != null ? Number(body.remaining_amount) : null,
    p_installment_count: body.installment_count != null ? Number(body.installment_count) : null,
    p_coach_id: body.coach_id || null,
    p_link_existing_student_id: body.link_existing_student_id || null,
    p_create_student: Boolean(body.create_student),
    p_student_first_name: body.student_first_name || null,
    p_student_last_name: body.student_last_name || null,
    p_parent_informed: Boolean(body.parent_informed),
    p_notes: body.notes || null
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || 'Kesin kayıt başarısız');

  await notifyUser({
    title: 'Kayıt adayı kesin kayda dönüştü',
    body: body.lead_id,
    targetUserId: actor.sub,
    senderId: actor.sub,
    institutionId
  });

  return data;
}

async function handleMarkLost(body, institutionId, actor) {
  const reason = body.lost_reason;
  if (!reason || !LOST_REASONS.includes(reason)) throw new Error('Olumsuzluk nedeni zorunludur');
  if (reason === 'other' && !String(body.lost_description || '').trim()) {
    throw new Error('Diğer nedeni için açıklama zorunludur');
  }

  const { data: existing } = await supabaseAdmin
    .from('registration_leads')
    .select('*')
    .eq('id', body.lead_id)
    .eq('institution_id', institutionId)
    .maybeSingle();

  const { data, error } = await supabaseAdmin
    .from('registration_leads')
    .update({
      primary_status: 'lost',
      stage: 'lost',
      lost_reason: reason,
      lost_description: body.lost_description || null,
      lost_at: new Date().toISOString(),
      updated_by: actor.sub,
      updated_at: new Date().toISOString()
    })
    .eq('id', body.lead_id)
    .select('*')
    .single();
  if (error) throw error;

  await auditLog({
    institutionId,
    leadId: body.lead_id,
    action: 'marked_lost',
    actorUserId: actor.sub,
    oldValue: { primary_status: existing?.primary_status },
    newValue: { lost_reason: reason }
  });

  return data;
}

async function handleReopenTracking(body, institutionId, actor, tags) {
  if (!isManager(tags)) throw new Error('Yeniden takibe alma yetkisi yok');
  if (!String(body.reason || '').trim()) throw new Error('Neden zorunludur');

  const { data, error } = await supabaseAdmin
    .from('registration_leads')
    .update({
      primary_status: 'tracking',
      stage: body.stage || 'follow_up',
      lost_reason: null,
      lost_description: null,
      lost_at: null,
      confirmed_at: null,
      confirmed_by: null,
      updated_by: actor.sub,
      updated_at: new Date().toISOString()
    })
    .eq('id', body.lead_id)
    .eq('institution_id', institutionId)
    .select('*')
    .single();
  if (error) throw error;

  await auditLog({
    institutionId,
    leadId: body.lead_id,
    action: 'reopened_tracking',
    actorUserId: actor.sub,
    newValue: { reason: body.reason }
  });

  return data;
}

async function handleRevertConfirmed(body, institutionId, actor, tags) {
  if (!tags.includes('super_admin')) throw new Error('Kesin kayıt geri alma yalnızca süper admin');
  if (!String(body.reason || '').trim()) throw new Error('Geri alma nedeni zorunludur');

  const { data, error } = await supabaseAdmin
    .from('registration_leads')
    .update({
      primary_status: 'tracking',
      stage: 'follow_up',
      confirmed_at: null,
      confirmed_by: null,
      updated_by: actor.sub,
      updated_at: new Date().toISOString()
    })
    .eq('id', body.lead_id)
    .eq('institution_id', institutionId)
    .select('*')
    .single();
  if (error) throw error;

  await auditLog({
    institutionId,
    leadId: body.lead_id,
    action: 'reverted_confirmed',
    actorUserId: actor.sub,
    newValue: { reason: body.reason }
  });

  return data;
}

async function handleAddInteraction(body, institutionId, actor) {
  const { data, error } = await supabaseAdmin
    .from('registration_interactions')
    .insert({
      lead_id: body.lead_id,
      institution_id: institutionId,
      interaction_type: body.interaction_type || 'phone_call',
      interaction_at: body.interaction_at || new Date().toISOString(),
      title: body.title || null,
      description: body.description || null,
      result: body.result || null,
      next_action_type: body.next_action_type || null,
      next_action_at: body.next_action_at || null,
      attachment_url: body.attachment_url || null,
      created_by: actor.sub
    })
    .select('*')
    .single();
  if (error) throw error;

  const leadPatch = {
    last_contact_at: data.interaction_at,
    updated_by: actor.sub,
    updated_at: new Date().toISOString()
  };
  if (body.next_action_at) leadPatch.next_action_at = body.next_action_at;
  if (body.next_action_type) leadPatch.next_action_type = body.next_action_type;

  await supabaseAdmin.from('registration_leads').update(leadPatch).eq('id', body.lead_id);

  return data;
}

async function handleCreateTask(body, institutionId, actor) {
  const dedupKey = body.deduplication_key || null;
  if (dedupKey) {
    const { data: dup } = await supabaseAdmin
      .from('registration_tasks')
      .select('id')
      .eq('deduplication_key', dedupKey)
      .maybeSingle();
    if (dup?.id) return { id: dup.id, deduplicated: true };
  }

  const { data, error } = await supabaseAdmin
    .from('registration_tasks')
    .insert({
      lead_id: body.lead_id,
      institution_id: institutionId,
      meeting_id: body.meeting_id || null,
      agenda_item_id: body.agenda_item_id || null,
      assigned_to: body.assigned_to || null,
      title: body.title,
      description: body.description || null,
      task_type: body.task_type && TASK_TYPES.includes(body.task_type) ? body.task_type : 'other',
      priority: body.priority || 'normal',
      status: 'pending',
      due_at: body.due_at || null,
      deduplication_key: dedupKey,
      created_by: actor.sub
    })
    .select('*')
    .single();
  if (error) throw error;

  if (data.assigned_to) {
    await notifyUser({
      title: 'Kayıt takibi görevi atandı',
      body: data.title,
      targetUserId: data.assigned_to,
      senderId: actor.sub,
      institutionId
    });
  }

  return data;
}

async function handleCompleteTask(body, institutionId, actor) {
  const { data: task, error: tErr } = await supabaseAdmin
    .from('registration_tasks')
    .select('*')
    .eq('id', body.task_id)
    .maybeSingle();
  if (tErr) throw tErr;
  if (!task) throw new Error('Görev bulunamadı');

  const { data, error } = await supabaseAdmin
    .from('registration_tasks')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_by: actor.sub,
      updated_at: new Date().toISOString()
    })
    .eq('id', body.task_id)
    .select('*')
    .single();
  if (error) throw error;

  await handleAddInteraction(
    {
      lead_id: task.lead_id,
      interaction_type: 'task_completed',
      title: 'Görev tamamlandı',
      description: body.result || task.title,
      result: body.result || null,
      next_action_type: body.next_action_type,
      next_action_at: body.next_action_at
    },
    institutionId,
    actor
  );

  if (body.next_action_type && body.next_action_at) {
    await handleCreateTask(
      {
        lead_id: task.lead_id,
        assigned_to: body.assigned_to || task.assigned_to,
        title: body.next_task_title || body.next_action_type,
        task_type: body.next_action_type,
        due_at: body.next_action_at,
        priority: body.priority || task.priority
      },
      institutionId,
      actor
    );
  }

  return data;
}

async function handleBulk(body, institutionId, actor, tags) {
  if (!isManager(tags)) throw new Error('Toplu işlem yetkisi yok');
  const ids = Array.isArray(body.lead_ids) ? body.lead_ids : [];
  if (!ids.length) throw new Error('Öğrenci seçilmedi');

  const patch = {};
  if (body.assigned_user_id !== undefined) patch.assigned_user_id = body.assigned_user_id;
  if (body.stage) patch.stage = body.stage;
  if (body.academic_period_key) patch.academic_period_key = body.academic_period_key;
  if (body.grade_program) patch.grade_program = normalizeGradeProgram(body.grade_program);
  if (body.next_action_at) patch.next_action_at = body.next_action_at;
  patch.updated_by = actor.sub;
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('registration_leads')
    .update(patch)
    .in('id', ids)
    .eq('institution_id', institutionId)
    .select('id');
  if (error) throw error;

  await auditLog({
    institutionId,
    leadId: null,
    action: 'bulk_update',
    actorUserId: actor.sub,
    newValue: { lead_ids: ids, patch }
  });

  return { updated: (data || []).length };
}

async function handleAddToMeeting(body, institutionId, actor) {
  const leadIds = Array.isArray(body.lead_ids) ? body.lead_ids : [body.lead_id].filter(Boolean);
  const meetingId = body.meeting_id;
  if (!meetingId || !leadIds.length) throw new Error('Toplantı ve öğrenci gerekli');

  const rows = [];
  for (const leadId of leadIds) {
    const { data: lead } = await supabaseAdmin
      .from('registration_leads')
      .select('full_name, grade_program, stage, temperature, notes')
      .eq('id', leadId)
      .maybeSingle();

    const agendaTitle = lead
      ? `Kayıt: ${lead.full_name} (${lead.grade_program})`
      : `Kayıt adayı ${leadId.slice(0, 8)}`;

    const { data: agendaItem, error: aErr } = await supabaseAdmin
      .from('mt_agenda_items')
      .insert({
        meeting_id: meetingId,
        institution_id: institutionId,
        title: agendaTitle,
        description: body.discussion_topic || lead?.notes || null,
        sort_order: body.sort_order ?? 999,
        priority: body.priority || 'normal',
        status: 'pending',
        created_by: actor.sub
      })
      .select('id')
      .single();
    if (aErr) throw aErr;

    const { data: link, error: lErr } = await supabaseAdmin
      .from('registration_meeting_links')
      .insert({
        lead_id: leadId,
        meeting_id: meetingId,
        agenda_item_id: agendaItem.id,
        institution_id: institutionId,
        discussion_topic: body.discussion_topic || null,
        responsible_user_id: body.responsible_user_id || null,
        created_by: actor.sub
      })
      .select('*')
      .single();
    if (lErr) throw lErr;

    rows.push(link);

    await auditLog({
      institutionId,
      leadId,
      action: 'added_to_meeting',
      actorUserId: actor.sub,
      newValue: { meeting_id: meetingId, agenda_item_id: agendaItem.id }
    });
  }

  return { links: rows };
}

async function handleMeetingDecision(body, institutionId, actor) {
  const linkId = body.link_id;
  const { data: link, error: lErr } = await supabaseAdmin
    .from('registration_meeting_links')
    .select('*')
    .eq('id', linkId)
    .maybeSingle();
  if (lErr) throw lErr;
  if (!link) throw new Error('Bağlantı bulunamadı');

  const patch = {
    decision: body.decision || null,
    responsible_user_id: body.responsible_user_id || link.responsible_user_id,
    due_at: body.due_at || null,
    status: body.status || 'pending',
    updated_at: new Date().toISOString()
  };

  await supabaseAdmin.from('registration_meeting_links').update(patch).eq('id', linkId);

  if (link.agenda_item_id && body.decision) {
    await supabaseAdmin
      .from('mt_agenda_items')
      .update({ decision_text: body.decision, status: 'discussed' })
      .eq('id', link.agenda_item_id);
  }

  await handleAddInteraction(
    {
      lead_id: link.lead_id,
      interaction_type: 'meeting_decision',
      title: 'Toplantı kararı',
      description: body.decision,
      next_action_type: body.task_type,
      next_action_at: body.due_at
    },
    institutionId,
    actor
  );

  let task = null;
  if (body.decision && body.responsible_user_id && body.due_at) {
    const dedupKey = `meeting_decision:${linkId}:${body.decision.slice(0, 80)}`;
    task = await handleCreateTask(
      {
        lead_id: link.lead_id,
        meeting_id: link.meeting_id,
        agenda_item_id: link.agenda_item_id,
        assigned_to: body.responsible_user_id,
        title: body.decision,
        task_type: body.task_type || 'other',
        due_at: body.due_at,
        deduplication_key: dedupKey,
        priority: body.priority || 'normal'
      },
      institutionId,
      actor
    );
  }

  return { link: { ...link, ...patch }, task };
}

async function handleSuggestions(institutionId) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);

  const { data: leads } = await supabaseAdmin
    .from('registration_leads')
    .select('*')
    .eq('institution_id', institutionId)
    .eq('primary_status', 'tracking')
    .is('deleted_at', null)
    .limit(500);

  const all = leads || [];
  return {
    overdue_followup: all.filter((l) => isOverdue(l.next_action_at, now)),
    overdue_tasks_leads: all.filter((l) => l.stage === 'payment_pending' || l.stage === 'follow_up'),
    stale_no_contact: all.filter((l) => {
      const ref = l.last_contact_at || l.created_at;
      return ref && new Date(ref) < twoWeeksAgo;
    }),
    hot_not_confirmed: all.filter((l) => l.temperature === 'hot' && l.stage !== 'confirmed'),
    payment_pending: all.filter((l) => l.stage === 'payment_pending'),
    near_confirmed: all.filter((l) =>
      ['offer_sent', 'considering', 'payment_pending'].includes(l.stage)
    ),
    frequent_no_result: all.filter((l) => {
      const ref = l.last_contact_at;
      return ref && new Date(ref) >= weekAgo && ['considering', 'follow_up'].includes(l.stage);
    })
  };
}

async function handleImportPreview(body, institutionId, actor) {
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const importType = body.import_type || 'excel_standard';
  const preview = [];
  let errors = 0;
  let duplicates = 0;

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const grade = normalizeGradeProgram(raw.grade_program || raw['Sınıf/Program'] || raw.sinif);
    const phone = normalizeTrPhone(raw.phone || raw.Telefon);
    const nameRaw = raw.full_name || raw['Öğrenci Adı Soyadı'] || raw.student_name || '';
    const names = splitFullName(nameRaw);

    const rowErr = [];
    if (!names.first_name) rowErr.push('Öğrenci adı eksik');
    if (!grade) rowErr.push('Sınıf/program eşleşmedi');

    let dupes = [];
    if (names.first_name && grade) {
      dupes = await findDuplicates(institutionId, {
        first_name: names.first_name,
        last_name: names.last_name,
        full_name: nameRaw,
        phone,
        grade_program: grade,
        academic_period_key: body.academic_period_key
      });
      if (dupes.length) duplicates++;
    }

    if (rowErr.length) errors++;

    preview.push({
      row_number: i + 1,
      status: rowErr.length ? 'error' : dupes.length ? 'duplicate' : 'ok',
      errors: rowErr,
      duplicates: dupes,
      mapped: {
        first_name: names.first_name,
        last_name: names.last_name,
        parent_full_name: raw.parent_full_name || raw['Veli Adı Soyadı'] || null,
        phone,
        grade_program: grade,
        primary_status:
          String(raw.status || raw.Durum || '')
            .toLocaleLowerCase('tr-TR')
            .includes('kesin') || String(raw.primary_status) === 'confirmed'
            ? 'confirmed'
            : 'tracking',
        stage: raw.stage || raw.Aşama || 'new_lead',
        source: raw.source || raw['Kayıt Kaynağı'] || 'excel_import',
        notes: raw.notes || raw.Not || null,
        assigned_user_id: null
      }
    });
  }

  const { data: logRow, error } = await supabaseAdmin
    .from('registration_import_logs')
    .insert({
      institution_id: institutionId,
      file_name: body.file_name || 'import',
      import_type: importType,
      status: 'preview',
      total_rows: rows.length,
      preview_json: preview,
      created_by: actor.sub
    })
    .select('id')
    .single();
  if (error) throw error;

  return {
    import_log_id: logRow.id,
    preview,
    summary: { total: rows.length, errors, duplicates, ok: rows.length - errors }
  };
}

async function handleImportCommit(body, institutionId, actor) {
  const logId = body.import_log_id;
  const { data: log, error: lErr } = await supabaseAdmin
    .from('registration_import_logs')
    .select('*')
    .eq('id', logId)
    .eq('institution_id', institutionId)
    .maybeSingle();
  if (lErr) throw lErr;
  if (!log?.preview_json) throw new Error('Ön izleme bulunamadı');

  const selected = Array.isArray(body.row_numbers)
    ? new Set(body.row_numbers.map(Number))
    : new Set((log.preview_json || []).filter((r) => r.status === 'ok').map((r) => r.row_number));

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of log.preview_json) {
    if (!selected.has(row.row_number)) {
      skipped++;
      continue;
    }
    if (row.status === 'error') {
      errors++;
      continue;
    }
    if (body.skip_duplicates && row.status === 'duplicate') {
      skipped++;
      continue;
    }

    try {
      await handleCreateLead(
        {
          ...row.mapped,
          academic_period_key: body.academic_period_key || row.mapped.academic_period_key
        },
        institutionId,
        actor
      );
      inserted++;
    } catch {
      errors++;
    }
  }

  await supabaseAdmin
    .from('registration_import_logs')
    .update({
      status: 'completed',
      inserted_count: inserted,
      skipped_count: skipped,
      error_count: errors,
      completed_at: new Date().toISOString(),
      result_json: { inserted, skipped, errors }
    })
    .eq('id', logId);

  await auditLog({
    institutionId,
    leadId: null,
    action: 'excel_imported',
    actorUserId: actor.sub,
    newValue: { import_log_id: logId, inserted, skipped, errors }
  });

  return { inserted, skipped, errors };
}

async function handleExport(filters, institutionId, tags, actor) {
  let query = supabaseAdmin.from('registration_leads').select('*').order('grade_program');
  query = applyLeadFilters(query, filters, institutionId);
  if (!isManager(tags)) query = query.eq('assigned_user_id', actor.sub);
  const { data, error } = await query.limit(5000);
  if (error) throw error;
  return { rows: (data || []).map((l) => sanitizeLeadForActor(l, tags)) };
}

async function handleStaffPerformance(institutionId) {
  const { data: leads } = await supabaseAdmin
    .from('registration_leads')
    .select('assigned_user_id, primary_status, confirmed_at, created_at, last_contact_at')
    .eq('institution_id', institutionId)
    .is('deleted_at', null);

  const { data: tasks } = await supabaseAdmin
    .from('registration_tasks')
    .select('assigned_to, status, due_at, completed_at')
    .eq('institution_id', institutionId);

  const byUser = {};
  for (const l of leads || []) {
    const uid = l.assigned_user_id || '_unassigned';
    if (!byUser[uid]) {
      byUser[uid] = { assigned: 0, confirmed: 0, contacted: 0, tasks_done: 0, tasks_overdue: 0 };
    }
    byUser[uid].assigned++;
    if (l.primary_status === 'confirmed') byUser[uid].confirmed++;
    if (l.last_contact_at) byUser[uid].contacted++;
  }

  const now = new Date();
  for (const t of tasks || []) {
    const uid = t.assigned_to || '_unassigned';
    if (!byUser[uid]) byUser[uid] = { assigned: 0, confirmed: 0, contacted: 0, tasks_done: 0, tasks_overdue: 0 };
    if (t.status === 'completed') byUser[uid].tasks_done++;
    else if (t.due_at && new Date(t.due_at) < now) byUser[uid].tasks_overdue++;
  }

  for (const u of Object.values(byUser)) {
    u.conversion_rate = u.assigned ? Math.round((u.confirmed / u.assigned) * 1000) / 10 : 0;
  }

  return { by_user: byUser };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, POST, PATCH, OPTIONS');
    return res.status(204).end();
  }

  try {
    const actor = requireAuthenticatedActor(req);
    const tags = await loadRoleTags(actor.sub);
    const role = roleOf(actor);

    if (role === 'student' || !canAccessModule(tags)) {
      return res.status(403).json({ error: 'forbidden', message: 'Bu modüle erişim yetkiniz yok' });
    }

    const op = String(req.query?.op || req.body?.op || '').trim();
    const institutionId = await resolveInstitutionId(actor, req.query?.institution_id || parseBody(req).institution_id);

    if (!institutionId) {
      return res.status(400).json({ error: 'institution_required' });
    }

    if (role !== 'super_admin' && !hasInstitutionAccess(actor, institutionId)) {
      return res.status(403).json({ error: 'forbidden', message: 'Kurum erişimi yok' });
    }

    const body = parseBody(req);
    const filters = { ...req.query };

    if (op === 'config') {
      return res.status(200).json({
        grade_programs: GRADE_PROGRAMS,
        stages: STAGES,
        lost_reasons: LOST_REASONS,
        task_types: TASK_TYPES
      });
    }

    if (op === 'dashboard') {
      await maybeSeedExcelBoard(institutionId);
      const data = await handleDashboard(institutionId, filters);
      return res.status(200).json({ data });
    }

    if (op === 'list') {
      await maybeSeedExcelBoard(institutionId);
      const data = await handleList(institutionId, filters, tags, actor);
      return res.status(200).json(data);
    }

    if (op === 'get') {
      const leadId = req.query.lead_id || body.lead_id;
      const data = await handleGetLead(leadId, institutionId, tags);
      if (!data) return res.status(404).json({ error: 'not_found' });
      return res.status(200).json({ data });
    }

    if (op === 'check-duplicates') {
      const dupes = await findDuplicates(institutionId, body);
      return res.status(200).json({ duplicates: dupes });
    }

    if (op === 'lookup-phone') {
      const data = await lookupCoachByParentPhone(institutionId, req.query.phone || body.phone);
      return res.status(200).json({ data });
    }

    if (op === 'coaches') {
      const data = await handleListCoaches(institutionId);
      return res.status(200).json({ data });
    }

    if (op === 'suggestions') {
      const data = await handleSuggestions(institutionId);
      return res.status(200).json({ data });
    }

    if (op === 'export') {
      const data = await handleExport(filters, institutionId, tags, actor);
      return res.status(200).json(data);
    }

    if (op === 'staff-performance') {
      if (!isManager(tags)) return res.status(403).json({ error: 'forbidden' });
      const data = await handleStaffPerformance(institutionId);
      return res.status(200).json({ data });
    }

    if (req.method === 'POST') {
      if (op === 'seed-excel') {
        if (!isManager(tags)) return res.status(403).json({ error: 'forbidden' });
        const data = await ensureExcelBoardLeads(supabaseAdmin, institutionId);
        return res.status(200).json({ data });
      }
      if (op === 'create') {
        const data = await handleCreateLead(body, institutionId, actor);
        return res.status(201).json({ data });
      }
      if (op === 'confirm') {
        const data = await handleConfirm(body, institutionId, actor);
        return res.status(200).json({ data });
      }
      if (op === 'mark-lost') {
        const data = await handleMarkLost(body, institutionId, actor);
        return res.status(200).json({ data });
      }
      if (op === 'reopen') {
        const data = await handleReopenTracking(body, institutionId, actor, tags);
        return res.status(200).json({ data });
      }
      if (op === 'revert-confirmed') {
        const data = await handleRevertConfirmed(body, institutionId, actor, tags);
        return res.status(200).json({ data });
      }
      if (op === 'add-interaction') {
        const data = await handleAddInteraction(body, institutionId, actor);
        return res.status(201).json({ data });
      }
      if (op === 'create-task') {
        const data = await handleCreateTask(body, institutionId, actor);
        return res.status(201).json({ data });
      }
      if (op === 'complete-task') {
        const data = await handleCompleteTask(body, institutionId, actor);
        return res.status(200).json({ data });
      }
      if (op === 'bulk') {
        const data = await handleBulk(body, institutionId, actor, tags);
        return res.status(200).json({ data });
      }
      if (op === 'add-to-meeting') {
        const data = await handleAddToMeeting(body, institutionId, actor);
        return res.status(200).json({ data });
      }
      if (op === 'meeting-decision') {
        const data = await handleMeetingDecision(body, institutionId, actor);
        return res.status(200).json({ data });
      }
      if (op === 'import-preview') {
        const data = await handleImportPreview(body, institutionId, actor);
        return res.status(200).json({ data });
      }
      if (op === 'import-commit') {
        const data = await handleImportCommit(body, institutionId, actor);
        return res.status(200).json({ data });
      }
    }

    if (req.method === 'PATCH' && op === 'update') {
      const leadId = body.lead_id || req.query.lead_id;
      const data = await handleUpdateLead(leadId, body, institutionId, actor, tags);
      return res.status(200).json({ data });
    }

    return res.status(400).json({ error: 'unknown_op', op });
  } catch (e) {
    if (isMissingTableError(e, 'registration_leads')) {
      return missingTableResponse(res);
    }
    const msg = errorMessage(e);
    if (/Missing token|Invalid token|Token expired/i.test(msg)) {
      return res.status(401).json({ error: 'unauthorized', message: msg });
    }
    console.error('[registration-tracking]', e);
    return res.status(500).json({ error: 'server_error', message: msg });
  }
}
