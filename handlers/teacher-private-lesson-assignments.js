import { requireAuthenticatedActor, hasInstitutionAccess } from '../api/_lib/auth.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { normalizedUserRolesFromDb } from '../api/_lib/user-roles-fetch.js';

const jsonError = (res, status, error, extra) => res.status(status).json({ error, ...extra });

function isMissingTableError(err) {
  const msg = errorMessage(err);
  return /teacher_private_lesson_assignments|does not exist|schema cache|could not find the table|PGRST205|relation .* does not exist/i.test(
    msg
  );
}

async function assertAdminActor(actor) {
  if (actor.role === 'super_admin') return true;
  if (actor.role === 'admin' && actor.institution_id) return true;
  return false;
}

async function loadStudent(studentId) {
  const { data, error } = await supabaseAdmin
    .from('students')
    .select('id, institution_id, name, email')
    .eq('id', studentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadTeacherUser(teacherId) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, institution_id, name, email, role, roles')
    .eq('id', teacherId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function userIsTeacher(row) {
  if (!row) return false;
  const role = String(row.role || '').toLowerCase();
  if (role === 'teacher') return true;
  const roles = Array.isArray(row.roles) ? row.roles : [];
  return roles.some((r) => String(r || '').toLowerCase() === 'teacher');
}

async function validatePair(actor, studentId, teacherId) {
  const student = await loadStudent(studentId);
  if (!student) return { ok: false, status: 404, error: 'Öğrenci bulunamadı.' };

  const teacher = await loadTeacherUser(teacherId);
  if (!teacher) return { ok: false, status: 404, error: 'Öğretmen bulunamadı.' };
  if (!userIsTeacher(teacher)) return { ok: false, status: 400, error: 'Seçilen kullanıcı öğretmen değil.' };

  if (actor.role === 'admin') {
    if (!hasInstitutionAccess(actor, student.institution_id)) {
      return { ok: false, status: 403, error: 'Öğrenci kurumunuzda değil.' };
    }
    if (!hasInstitutionAccess(actor, teacher.institution_id)) {
      return { ok: false, status: 403, error: 'Öğretmen kurumunuzda değil.' };
    }
    if (String(student.institution_id || '') !== String(teacher.institution_id || '')) {
      return { ok: false, status: 400, error: 'Öğrenci ve öğretmen aynı kurumda olmalıdır.' };
    }
  }

  return {
    ok: true,
    student,
    teacher,
    institution_id: student.institution_id || teacher.institution_id || null
  };
}

async function enrichRows(rows) {
  if (!rows?.length) return [];
  const studentIds = [...new Set(rows.map((r) => r.student_id).filter(Boolean))];
  const teacherIds = [...new Set(rows.map((r) => r.teacher_id).filter(Boolean))];

  let studs = [];
  let teachers = [];
  if (studentIds.length) {
    const { data, error } = await supabaseAdmin
      .from('students')
      .select('id, name, email')
      .in('id', studentIds);
    if (error) throw error;
    studs = data || [];
  }
  if (teacherIds.length) {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, name, email')
      .in('id', teacherIds);
    if (error) throw error;
    teachers = data || [];
  }

  const studMap = new Map(studs.map((s) => [String(s.id), s]));
  const teachMap = new Map(teachers.map((t) => [String(t.id), t]));

  return rows.map((r) => {
    const st = studMap.get(String(r.student_id));
    const te = teachMap.get(String(r.teacher_id));
    return {
      ...r,
      student_name: String(st?.name || '').trim() || r.student_id,
      student_email: st?.email || null,
      teacher_name: te?.name || r.teacher_id,
      teacher_email: te?.email || null
    };
  });
}

async function handleList(req, res, actor) {
  const teacherFilter =
    typeof req.query?.teacher_id === 'string' ? req.query.teacher_id.trim() : '';
  const studentFilter =
    typeof req.query?.student_id === 'string' ? req.query.student_id.trim() : '';

  let q = supabaseAdmin
    .from('teacher_private_lesson_assignments')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false });

  if (actor.role === 'admin') {
    if (!actor.institution_id) return res.status(200).json({ data: [] });
    q = q.eq('institution_id', actor.institution_id);
  }
  if (teacherFilter) q = q.eq('teacher_id', teacherFilter);
  if (studentFilter) q = q.eq('student_id', studentFilter);

  const { data, error } = await q;
  if (error) {
    if (isMissingTableError(error)) {
      return res.status(200).json({ data: [], hint: 'teacher_private_lesson_assignments_sql_missing' });
    }
    throw error;
  }
  const enriched = await enrichRows(data || []);
  return res.status(200).json({ data: enriched });
}

async function upsertAssignment(actor, studentId, teacherId) {
  const check = await validatePair(actor, studentId, teacherId);
  if (!check.ok) return check;

  const now = new Date().toISOString();
  const payload = {
    institution_id: check.institution_id,
    teacher_id: teacherId,
    student_id: studentId,
    active: true,
    assigned_by: actor.sub && actor.sub !== 'anonymous' ? actor.sub : null,
    updated_at: now
  };

  const { data: existing } = await supabaseAdmin
    .from('teacher_private_lesson_assignments')
    .select('id')
    .eq('teacher_id', teacherId)
    .eq('student_id', studentId)
    .maybeSingle();

  if (existing?.id) {
    const { data, error } = await supabaseAdmin
      .from('teacher_private_lesson_assignments')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    return { ok: true, data, created: false };
  }

  const { data, error } = await supabaseAdmin
    .from('teacher_private_lesson_assignments')
    .insert({ ...payload, created_at: now })
    .select('*')
    .single();
  if (error) throw error;
  return { ok: true, data, created: true };
}

async function handleCreate(req, res, actor) {
  const body = req.body || {};

  if (body.bulk === true) {
    const teacherId = String(body.teacher_id || '').trim();
    const studentId = String(body.student_id || '').trim();
    const studentIds = Array.isArray(body.student_ids)
      ? body.student_ids.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    const teacherIds = Array.isArray(body.teacher_ids)
      ? body.teacher_ids.map((x) => String(x || '').trim()).filter(Boolean)
      : [];

    const pairs = [];
    if (teacherId && studentIds.length) {
      for (const sid of studentIds) pairs.push({ student_id: sid, teacher_id: teacherId });
    } else if (studentId && teacherIds.length) {
      for (const tid of teacherIds) pairs.push({ student_id: studentId, teacher_id: tid });
    } else {
      return jsonError(res, 400, 'Toplu atama için teacher_id+student_ids veya student_id+teacher_ids gerekli.');
    }

    const results = [];
    const errors = [];
    for (const pair of pairs) {
      try {
        const r = await upsertAssignment(actor, pair.student_id, pair.teacher_id);
        if (!r.ok) {
          errors.push({ ...pair, error: r.error || 'Atama başarısız' });
        } else {
          results.push(r.data);
        }
      } catch (e) {
        errors.push({ ...pair, error: errorMessage(e) });
      }
    }
    const enriched = await enrichRows(results);
    return res.status(200).json({
      data: enriched,
      created_count: enriched.length,
      errors: errors.length ? errors : undefined
    });
  }

  const studentId = String(body.student_id || '').trim();
  const teacherId = String(body.teacher_id || '').trim();
  if (!studentId || !teacherId) {
    return jsonError(res, 400, 'student_id ve teacher_id gerekli.');
  }

  const r = await upsertAssignment(actor, studentId, teacherId);
  if (!r.ok) return jsonError(res, r.status || 400, r.error);
  const enriched = await enrichRows([r.data]);
  return res.status(r.created ? 201 : 200).json({ data: enriched[0] });
}

async function handleDelete(req, res, actor) {
  const id =
    (typeof req.query?.id === 'string' ? req.query.id.trim() : '') ||
    String(req.body?.id || '').trim();
  if (!id) return jsonError(res, 400, 'id gerekli.');

  const { data: row, error: fe } = await supabaseAdmin
    .from('teacher_private_lesson_assignments')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (fe) {
    if (isMissingTableError(fe)) {
      return jsonError(res, 503, 'Atama tablosu henüz oluşturulmamış.');
    }
    throw fe;
  }
  if (!row) return jsonError(res, 404, 'Atama bulunamadı.');

  if (actor.role === 'admin' && !hasInstitutionAccess(actor, row.institution_id)) {
    return jsonError(res, 403, 'forbidden');
  }

  const { error } = await supabaseAdmin.from('teacher_private_lesson_assignments').delete().eq('id', id);
  if (error) throw error;
  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  try {
    const actor = requireAuthenticatedActor(req);
    const roleTags = await normalizedUserRolesFromDb(actor.sub);
    const isAdmin =
      actor.role === 'super_admin' ||
      actor.role === 'admin' ||
      roleTags.includes('super_admin') ||
      roleTags.includes('admin');

    if (!isAdmin) return jsonError(res, 403, 'forbidden');
    if (!(await assertAdminActor(actor))) return jsonError(res, 403, 'institution_missing');

    if (req.method === 'GET') return handleList(req, res, actor);
    if (req.method === 'POST') return handleCreate(req, res, actor);
    if (req.method === 'DELETE') return handleDelete(req, res, actor);

    return jsonError(res, 405, 'method_not_allowed');
  } catch (e) {
    const msg = errorMessage(e);
    if (/Missing token|Invalid token|Token expired/i.test(msg)) return jsonError(res, 401, msg);
    if (isMissingTableError(e)) {
      return res.status(200).json({
        data: [],
        hint: 'teacher_private_lesson_assignments_sql_missing',
        error:
          'Atama tablosu henüz yok. Supabase SQL Editor’da sql/2026-07-10-teacher-private-lesson-assignments.sql çalıştırın.'
      });
    }
    console.error('[teacher-private-lesson-assignments]', msg);
    return jsonError(res, 500, msg);
  }
}
