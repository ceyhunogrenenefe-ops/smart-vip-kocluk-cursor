import { requireAuthenticatedActor, hasInstitutionAccess } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  getInstitutionStudentIds,
  resolveInstitutionClassIds
} from '../api/_lib/attendance-report-query.js';
import {
  exportPlannerGroupToClass,
  loadInstitutionTeachers,
  matchTeacherId,
  buildExportResultSummary,
  describeSkippedItem
} from '../api/_lib/class-schedule-plan-export.js';
import {
  ensureClassSessionsForClassInRange,
  backfillClassSessionMeetingLinksInRange,
  backfillClassWeeklySlotMeetingLinks,
  backfillClassSessionInstitutionId
} from '../api/_lib/class-sessions-from-slots.js';

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

function resolveWriteInstitutionId(actor, bodyInstitutionId) {
  const role = String(actor.role || '');
  const bodyId = String(bodyInstitutionId || '').trim();
  const actorId = String(actor.institution_id || '').trim();
  if (role === 'super_admin') return bodyId || actorId;
  if (bodyId && hasInstitutionAccess(actor, bodyId)) return bodyId;
  return actorId;
}

function resolveReadInstitutionId(actor, queryInstitutionId) {
  const role = String(actor.role || '');
  const q = String(queryInstitutionId || '').trim();
  const actorId = String(actor.institution_id || '').trim();
  if (role === 'super_admin') return q || actorId;
  if (q && hasInstitutionAccess(actor, q)) return q;
  return actorId;
}

function institutionIdMatches(stored, requested) {
  const a = String(stored ?? '').trim();
  const b = String(requested ?? '').trim();
  if (!a || !b) return false;
  return a === b || a.toLowerCase() === b.toLowerCase();
}

async function inferClassInstitutionId(classId) {
  const cid = String(classId || '').trim();
  if (!cid) return null;

  const { data: studentLinks } = await supabaseAdmin
    .from('class_students')
    .select('student_id')
    .eq('class_id', cid)
    .limit(5);
  const studentIds = (studentLinks || []).map((r) => r.student_id).filter(Boolean);
  if (studentIds.length) {
    const { data: students } = await supabaseAdmin
      .from('students')
      .select('institution_id')
      .in('id', studentIds);
    for (const s of students || []) {
      const iid = String(s.institution_id || '').trim();
      if (iid) return iid;
    }
  }

  const { data: teacherLinks } = await supabaseAdmin
    .from('class_teachers')
    .select('teacher_id')
    .eq('class_id', cid)
    .limit(5);
  const teacherIds = (teacherLinks || []).map((r) => r.teacher_id).filter(Boolean);
  if (teacherIds.length) {
    const { data: teachers } = await supabaseAdmin
      .from('users')
      .select('institution_id')
      .in('id', teacherIds);
    for (const t of teachers || []) {
      const iid = String(t.institution_id || '').trim();
      if (iid) return iid;
    }
  }

  return null;
}

async function classBelongsToInstitution(classId, institutionId) {
  const instId = String(institutionId || '').trim();
  const cid = String(classId || '').trim();
  if (!cid) return false;
  if (!instId) return true;

  const { data: classRow, error } = await supabaseAdmin
    .from('classes')
    .select('id,institution_id')
    .eq('id', cid)
    .maybeSingle();
  if (error) throw error;
  if (!classRow) return false;
  if (institutionIdMatches(classRow.institution_id, instId)) return true;

  const studentIds = await getInstitutionStudentIds(supabaseAdmin, instId);
  const classIds = await resolveInstitutionClassIds(supabaseAdmin, instId, studentIds);
  return classIds.some((id) => String(id) === cid);
}

async function patchClassInstitutionIfMissing(classId, institutionId) {
  const instId = String(institutionId || '').trim();
  const cid = String(classId || '').trim();
  if (!instId || !cid) return;
  const { data: row } = await supabaseAdmin
    .from('classes')
    .select('institution_id')
    .eq('id', cid)
    .maybeSingle();
  if (row && !String(row.institution_id || '').trim()) {
    await supabaseAdmin.from('classes').update({ institution_id: instId }).eq('id', cid);
  }
}

async function loadClassForExport(classId, institutionId, actor) {
  const { data: classRow, error } = await supabaseAdmin
    .from('classes')
    .select('id,name,institution_id,class_level,branch')
    .eq('id', classId)
    .maybeSingle();
  if (error) throw error;
  if (!classRow) return { error: 'class_not_found' };

  const role = String(actor?.role || '');
  let effectiveInstitutionId =
    String(classRow.institution_id || '').trim() ||
    String(institutionId || '').trim() ||
    (await inferClassInstitutionId(classId));

  if (role === 'super_admin') {
    const requestInst = String(institutionId || '').trim();
    if (!effectiveInstitutionId && requestInst) effectiveInstitutionId = requestInst;
    if (effectiveInstitutionId) await patchClassInstitutionIfMissing(classId, effectiveInstitutionId);
    return {
      classRow: {
        ...classRow,
        institution_id: effectiveInstitutionId || classRow.institution_id
      },
      effectiveInstitutionId: effectiveInstitutionId || null
    };
  }

  const requestInstitutionId = String(institutionId || actor?.institution_id || '').trim();
  if (!requestInstitutionId) {
    return {
      error: 'institution_required',
      message: 'Kurum bilgisi bulunamadı.'
    };
  }
  if (!hasInstitutionAccess(actor, requestInstitutionId)) {
    return { error: 'forbidden' };
  }

  let belongs = await classBelongsToInstitution(classId, requestInstitutionId);
  if (!belongs && !String(classRow.institution_id || '').trim()) {
    belongs = true;
  }
  if (!belongs) {
    return {
      error: 'class_institution_mismatch',
      message: `«${classRow.name || 'Sınıf'}» bu kuruma bağlı görünmüyor. Canlı Grup Dersi'nde sınıfa öğrenci atayın veya sınıfı yeniden oluştururken kurumu seçili tutun.`
    };
  }

  if (!effectiveInstitutionId) effectiveInstitutionId = requestInstitutionId;
  await patchClassInstitutionIfMissing(classId, effectiveInstitutionId);

  return {
    classRow: {
      ...classRow,
      institution_id: effectiveInstitutionId
    },
    effectiveInstitutionId
  };
}

async function loadTeachersWithBranches(institutionId) {
  const teachers = await loadInstitutionTeachers(institutionId);
  const ids = teachers.map((t) => t.id).filter(Boolean);
  const branchMap = new Map();
  if (ids.length) {
    const { data: profiles, error: pErr } = await supabaseAdmin
      .from('question_help_teacher_profiles')
      .select('user_id, branches')
      .in('user_id', ids);
    if (!pErr) {
      for (const p of profiles || []) {
        branchMap.set(
          p.user_id,
          Array.isArray(p.branches) ? p.branches.map((x) => String(x || '').trim()).filter(Boolean) : []
        );
      }
    }
  }
  return teachers.map((t) => ({
    id: t.id,
    name: String(t.name || t.email || '').trim(),
    email: t.email || '',
    branches: branchMap.get(t.id) || []
  }));
}

async function loadInstitutionClassesForPlanner(institutionId) {
  const instId = String(institutionId || '').trim();
  if (!instId) return [];
  const studentIds = await getInstitutionStudentIds(supabaseAdmin, instId);
  const classIds = await resolveInstitutionClassIds(supabaseAdmin, instId, studentIds);
  if (!classIds.length) return [];
  const { data, error } = await supabaseAdmin
    .from('classes')
    .select('id,name,class_level,branch,institution_id')
    .in('id', classIds);
  if (error) throw error;
  return (data || [])
    .map((c) => ({
      id: c.id,
      name: String(c.name || '').trim(),
      class_level: c.class_level ?? null,
      branch: c.branch ?? null
    }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'tr'));
}

/** Planlayıcı hücrelerindeki öğretmen adlarını kurum öğretmenleriyle eşleştirme özeti */
async function previewTeacherMatches(plannerJson, groupId, institutionId) {
  const pj = plannerJson && typeof plannerJson === 'object' ? plannerJson : {};
  const groups = Array.isArray(pj.groups) ? pj.groups : [];
  const group = groups.find((g) => String(g.id) === String(groupId));
  if (!group) return { unmatched: [], matched: [] };
  const schedule = group.schedule && typeof group.schedule === 'object' ? group.schedule : {};
  const teachers = institutionId ? await loadInstitutionTeachers(institutionId) : [];
  const names = new Set();
  for (const cell of Object.values(schedule)) {
    if (!cell || typeof cell !== 'object') continue;
    const t = String(cell.teacher || '').trim();
    if (t) names.add(t);
  }
  const matched = [];
  const unmatched = [];
  for (const name of names) {
    const id = matchTeacherId(name, teachers);
    if (id) matched.push({ name, teacher_id: id });
    else unmatched.push({ name });
  }
  return { matched, unmatched, teachers: teachers.map((t) => ({ id: t.id, name: t.name, email: t.email })) };
}

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }

  const role = String(actor.role || '');
  const canAccess = role === 'super_admin' || role === 'admin';
  if (!canAccess) return res.status(403).json({ error: 'forbidden' });

  const op = String(req.query.op || '').trim();

  try {
    if (req.method === 'GET') {
      const planId = String(req.query.id || '').trim();

      if (planId) {
        const { data, error } = await supabaseAdmin
          .from('class_schedule_plans')
          .select('*')
          .eq('id', planId)
          .maybeSingle();
        if (error) {
          if (String(error.message || '').includes('relation') || error.code === '42P01') {
            return res.status(200).json({
              data: null,
              hint: 'class_schedule_plans için 2026-06-24-class-schedule-plans.sql çalıştırın.'
            });
          }
          throw error;
        }
        if (!data) return res.status(404).json({ error: 'not_found' });
        if (role === 'admin' && !hasInstitutionAccess(actor, data.institution_id)) {
          return res.status(403).json({ error: 'forbidden' });
        }
        return res.status(200).json({ data });
      }

      const institutionId = resolveReadInstitutionId(actor, req.query.institution_id);
      if (!institutionId) {
        if (role === 'super_admin') return res.status(400).json({ error: 'institution_id_query_required' });
        return res.status(400).json({ error: 'institution_required' });
      }
      if (role === 'admin' && !hasInstitutionAccess(actor, institutionId)) {
        return res.status(403).json({ error: 'forbidden' });
      }

      if (op === 'planner-resources') {
        const [classes, teachers] = await Promise.all([
          loadInstitutionClassesForPlanner(institutionId),
          loadTeachersWithBranches(institutionId)
        ]);
        return res.status(200).json({ classes, teachers });
      }

      const { data, error } = await supabaseAdmin
        .from('class_schedule_plans')
        .select('id,name,institution_id,created_by,created_at,updated_at')
        .eq('institution_id', institutionId)
        .order('updated_at', { ascending: false })
        .limit(200);
      if (error) {
        if (String(error.message || '').includes('relation') || error.code === '42P01') {
          return res.status(200).json({
            data: [],
            hint: 'class_schedule_plans için 2026-06-24-class-schedule-plans.sql çalıştırın.'
          });
        }
        throw error;
      }
      return res.status(200).json({ data: data || [] });
    }

    if (req.method === 'POST') {
      const body = parseBody(req);
      const institutionId = resolveWriteInstitutionId(actor, body.institution_id);
      if (!institutionId) return res.status(400).json({ error: 'institution_required' });
      if (role === 'admin' && !hasInstitutionAccess(actor, institutionId)) {
        return res.status(403).json({ error: 'forbidden' });
      }

      if (op === 'preview-teachers') {
        const groupId = String(body.group_id || '').trim();
        if (!groupId) return res.status(400).json({ error: 'group_id_required' });
        let plannerJson = body.planner_json;
        const planId = String(body.plan_id || '').trim();
        if (planId && !plannerJson) {
          const { data: plan, error: pErr } = await supabaseAdmin
            .from('class_schedule_plans')
            .select('planner_json,institution_id')
            .eq('id', planId)
            .maybeSingle();
          if (pErr) throw pErr;
          if (!plan) return res.status(404).json({ error: 'plan_not_found' });
          if (String(plan.institution_id) !== institutionId) return res.status(403).json({ error: 'forbidden' });
          plannerJson = plan.planner_json;
        }
        if (!plannerJson || typeof plannerJson !== 'object') {
          return res.status(400).json({ error: 'planner_json_required' });
        }
        const preview = await previewTeacherMatches(plannerJson, groupId, institutionId);
        return res.status(200).json(preview);
      }

      if (op === 'export' || op === 'export-direct') {
        const classId = String(body.class_id || '').trim();
        const groupId = String(body.group_id || '').trim();
        const teacherMap =
          body.teacher_map && typeof body.teacher_map === 'object' ? body.teacher_map : {};

        if (!classId || !groupId) {
          return res.status(400).json({ error: 'class_id_and_group_id_required' });
        }

        const loaded = await loadClassForExport(classId, institutionId, actor);
        if (loaded.error) {
          return res.status(loaded.error === 'forbidden' ? 403 : 404).json({
            error: loaded.error,
            message: loaded.message || undefined
          });
        }
        const { classRow, effectiveInstitutionId } = loaded;
        const exportInstitutionId = String(effectiveInstitutionId || institutionId || classRow.institution_id || '').trim();

        let plannerJson = body.planner_json;
        if (op === 'export') {
          const planId = String(body.plan_id || '').trim();
          if (!planId) return res.status(400).json({ error: 'plan_id_required' });
          const { data: plan, error: pErr } = await supabaseAdmin
            .from('class_schedule_plans')
            .select('planner_json,institution_id')
            .eq('id', planId)
            .maybeSingle();
          if (pErr) throw pErr;
          if (!plan) return res.status(404).json({ error: 'plan_not_found' });
          if (String(plan.institution_id) !== institutionId) return res.status(403).json({ error: 'forbidden' });
          plannerJson = plan.planner_json;
        }
        if (!plannerJson || typeof plannerJson !== 'object') {
          return res.status(400).json({ error: 'planner_json_required' });
        }

        const dateFrom = String(body.date_from || body.dateFrom || '').trim().slice(0, 10);
        const dateTo = String(body.date_to || body.dateTo || '').trim().slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
          return res.status(400).json({
            error: 'date_range_required',
            message: 'Başlangıç ve bitiş tarihi seçin (YYYY-MM-DD).'
          });
        }
        if (dateFrom > dateTo) {
          return res.status(400).json({
            error: 'date_range_invalid',
            message: 'Bitiş tarihi başlangıçtan önce olamaz.'
          });
        }

        const replaceExisting = body.replace_existing !== false;
        const clearCrossClassConflicts = body.clear_cross_class_conflicts !== false;

        const slotResult = await exportPlannerGroupToClass({
          plannerJson,
          groupId,
          classId,
          classRow: { ...classRow, institution_id: exportInstitutionId || classRow.institution_id },
          replaceExisting,
          clearCrossClassConflicts,
          teacherMap
        });

        if (replaceExisting && dateFrom && dateTo) {
          await supabaseAdmin
            .from('class_sessions')
            .delete()
            .eq('class_id', classId)
            .gte('lesson_date', dateFrom)
            .lte('lesson_date', dateTo)
            .eq('status', 'scheduled');
        }

        const sessionResult = await ensureClassSessionsForClassInRange(classId, dateFrom, dateTo);
        const exportInst = String(exportInstitutionId || classRow.institution_id || '').trim();
        if (exportInst) await backfillClassSessionInstitutionId(classId, exportInst);
        await backfillClassWeeklySlotMeetingLinks(classId);
        const linkBackfill = await backfillClassSessionMeetingLinksInRange(classId, dateFrom, dateTo);

        const summary = buildExportResultSummary({
          slotsCreated: slotResult.created,
          sessionsCreated: sessionResult.created,
          slotsAlreadyExists: slotResult.already_exists,
          sessionsAlreadyExists: sessionResult.already_exists,
          skipped: slotResult.skipped,
          sessionSkipped: sessionResult.skipped,
          errors: slotResult.errors,
          dateFrom,
          dateTo
        });

        return res.status(200).json({
          ...summary,
          class_id: classId,
          class_name: classRow.name || '',
          created: slotResult.created,
          slots_already_exists: slotResult.already_exists,
          sessions_created: sessionResult.created,
          sessions_already_exists: sessionResult.already_exists,
          days_scanned: sessionResult.days_scanned,
          skipped: slotResult.skipped,
          session_skipped: sessionResult.skipped,
          errors: slotResult.errors,
          details: slotResult.details,
          skipped_descriptions: (slotResult.skipped || []).map(describeSkippedItem),
          session_skipped_descriptions: (sessionResult.skipped || []).map(describeSkippedItem),
          sessions_link_backfilled: linkBackfill.updated || 0,
          conflicts_cleared: slotResult.conflicts_cleared || 0
        });
      }

      const name = String(body.name || '').trim();
      const plannerJson = body.planner_json;
      if (!name) return res.status(400).json({ error: 'name_required' });
      if (!plannerJson || typeof plannerJson !== 'object') {
        return res.status(400).json({ error: 'planner_json_required' });
      }

      const { data, error } = await supabaseAdmin
        .from('class_schedule_plans')
        .insert({
          institution_id: institutionId,
          name,
          planner_json: plannerJson,
          created_by: actor.id || null,
          updated_at: new Date().toISOString()
        })
        .select('*')
        .single();
      if (error) throw error;
      return res.status(201).json({ data });
    }

    if (req.method === 'PATCH') {
      const body = parseBody(req);
      const planId = String(body.id || req.query.id || '').trim();
      if (!planId) return res.status(400).json({ error: 'id_required' });

      const { data: existing, error: exErr } = await supabaseAdmin
        .from('class_schedule_plans')
        .select('id,institution_id')
        .eq('id', planId)
        .maybeSingle();
      if (exErr) throw exErr;
      if (!existing) return res.status(404).json({ error: 'not_found' });
      if (role === 'admin' && !hasInstitutionAccess(actor, existing.institution_id)) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const patch = { updated_at: new Date().toISOString() };
      if (body.name != null) patch.name = String(body.name || '').trim();
      if (body.planner_json != null) {
        if (typeof body.planner_json !== 'object') {
          return res.status(400).json({ error: 'planner_json_invalid' });
        }
        patch.planner_json = body.planner_json;
      }
      if (!patch.name && !patch.planner_json) {
        return res.status(400).json({ error: 'nothing_to_update' });
      }

      const { data, error } = await supabaseAdmin
        .from('class_schedule_plans')
        .update(patch)
        .eq('id', planId)
        .select('*')
        .single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'DELETE') {
      const planId = String(req.query.id || '').trim();
      if (!planId) return res.status(400).json({ error: 'id_required' });

      const { data: existing, error: exErr } = await supabaseAdmin
        .from('class_schedule_plans')
        .select('id,institution_id')
        .eq('id', planId)
        .maybeSingle();
      if (exErr) throw exErr;
      if (!existing) return res.status(404).json({ error: 'not_found' });
      if (role === 'admin' && !hasInstitutionAccess(actor, existing.institution_id)) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const { error } = await supabaseAdmin.from('class_schedule_plans').delete().eq('id', planId);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    return res.status(500).json({ error: errorMessage(e) });
  }
}
