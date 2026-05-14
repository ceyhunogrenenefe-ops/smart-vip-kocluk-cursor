import { requireAuth, hasInstitutionAccess } from '../api/_lib/auth.js';
import { enrichStudentActor } from '../api/_lib/enrich-student-actor.js';
import { getSupabaseAdmin, supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { normalizeUuidOrGenerate } from '../api/_lib/uuid.js';
import { rebuildCoachStudentIdsFromFk } from '../api/_lib/sync-coach-students.js';
import { enforceStudentInsertQuotas, enforceCoachStudentQuota, QuotaError } from '../api/_lib/quota-enforce.js';
import { getTeacherGroupClassStudentScope } from '../api/_lib/teacher-class-scope.js';
import { normalizedUserRolesFromDb } from '../api/_lib/user-roles-fetch.js';

const normActorRole = (r) => String(r || '').trim().toLowerCase();

async function actorRoleSet(actor) {
  const rs = await normalizedUserRolesFromDb(actor.sub);
  const set = new Set(rs.map(normActorRole));
  if (!set.size) set.add(normActorRole(actor.role));
  return set;
}

/**
 * Öğrenci kartı silinmeden önce: haftalık çalışma (soru / deneme sayıları), kitap, sınav, konu ilerlemesi vb.
 * Bazı kurulumlarda `students` üzerinde ON DELETE CASCADE tanımlı olmayabilir; yetim satır bırakmamak için
 * açık silme (hata olursa log, akış devam — ardından students.delete ve DB CASCADE).
 */
async function deleteStudentDependentRows(studentId) {
  const sid = String(studentId || '').trim();
  if (!sid) return;
  const runners = [
    () => supabaseAdmin.from('weekly_planner_entries').delete().eq('student_id', sid),
    () => supabaseAdmin.from('weekly_entries').delete().eq('student_id', sid),
    () => supabaseAdmin.from('book_readings').delete().eq('student_id', sid),
    () => supabaseAdmin.from('written_exams').delete().eq('student_id', sid),
    () => supabaseAdmin.from('exam_results').delete().eq('student_id', sid),
    () => supabaseAdmin.from('exam_results_v2').delete().eq('student_id', sid),
    () => supabaseAdmin.from('student_topic_progress').delete().eq('student_id', sid),
    () => supabaseAdmin.from('analysis_details').delete().eq('student_id', sid),
    () => supabaseAdmin.from('topic_progress').delete().eq('student_id', sid),
    () => supabaseAdmin.from('ai_exam_analysis').delete().eq('student_id', sid)
  ];
  for (const run of runners) {
    try {
      const { error } = await run();
      if (error) console.warn('[students DELETE] bağımlı tablo:', error.message || String(error));
    } catch (e) {
      console.warn('[students DELETE] bağımlı tablo:', e instanceof Error ? e.message : e);
    }
  }
}

/** users.created_by FK — yalnızca actor gerçekten users’ta varsa */
async function resolveCreatedByFkForStudent(actor) {
  const sub = actor?.sub;
  if (!sub || sub === 'anonymous') return null;
  const { data, error } = await supabaseAdmin.from('users').select('id').eq('id', sub).maybeSingle();
  if (error || !data?.id) return null;
  return data.id;
}

/**
 * Öğrenci paneli girişi public.users üzerinden; yalnızca students satırı users’ta yansımaz.
 * Şifre (auth_password / password) ≥6 ise users upsert + students.user_id / platform_user_id bağlar.
 */
async function linkStudentToPlatformUser(actor, { studentRow, payload, institutionId, loginPwd }) {
  const sid = studentRow?.id;
  if (!sid) return studentRow;
  const pwd = String(loginPwd || '').trim();
  if (pwd.length < 6) return studentRow;

  const em = String(payload.email || '')
    .toLowerCase()
    .trim();
  if (!em) return studentRow;

  try {
    const { data: uExist, error: qErr } = await supabaseAdmin
      .from('users')
      .select('id, role, roles')
      .eq('email', em)
      .maybeSingle();
    if (qErr) throw qErr;

    if (uExist?.id) {
      const roleLower = String(uExist.role || '').toLowerCase();
      if (roleLower && roleLower !== 'student') {
        console.warn(
          '[students POST] Aynı e-posta student dışı bir hesaba ait; public.users yeni satırı/ bağlantı atlandı.'
        );
        return studentRow;
      }
    }

    let platformId = uExist?.id || null;
    const createdByFk = await resolveCreatedByFkForStudent(actor);
    const now = new Date().toISOString();

    if (!platformId) {
      const uid = normalizeUuidOrGenerate(null);
      const ins = {
        id: uid,
        email: em,
        name: payload.name,
        phone: payload.phone ?? null,
        role: 'student',
        roles: ['student'],
        password_hash: pwd,
        institution_id: institutionId || null,
        is_active: true,
        package: 'trial',
        start_date: now,
        end_date: null,
        created_by: createdByFk,
        created_at: now,
        updated_at: now
      };
      const { data: uNew, error: insErr } = await supabaseAdmin.from('users').insert(ins).select().single();
      if (insErr) throw insErr;
      platformId = uNew?.id || null;
    } else {
      const patch = {
        name: payload.name,
        phone: payload.phone ?? null,
        password_hash: pwd,
        institution_id: institutionId ?? undefined,
        updated_at: now
      };
      if (String(uExist?.role || '').toLowerCase() === 'student') {
        patch.role = 'student';
        patch.roles = ['student'];
      }
      await supabaseAdmin.from('users').update(patch).eq('id', platformId);
    }

    if (platformId) {
      const { data: linked, error: linkErr } = await supabaseAdmin
        .from('students')
        .update({
          platform_user_id: platformId,
          user_id: platformId,
          updated_at: new Date().toISOString()
        })
        .eq('id', sid)
        .select()
        .single();
      if (!linkErr && linked) return linked;
    }
  } catch (e) {
    console.warn('[students POST] public.users eşlemesi:', e instanceof Error ? e.message : e);
  }
  return studentRow;
}

/** Öğretmen + koç aynı hesapta: birleşik görünürlük */
async function assertStudentVisibilityResolved(actor, student) {
  const rs = await actorRoleSet(actor);

  if (rs.has('super_admin')) return true;
  if (rs.has('admin') && hasInstitutionAccess(actor, student.institution_id)) return true;

  if (rs.has('student')) {
    if (actor.student_id && student.id === actor.student_id) return true;
    if (actor.sub && student.platform_user_id && String(student.platform_user_id) === String(actor.sub))
      return true;
    if (actor.sub && student.user_id && String(student.user_id) === String(actor.sub)) return true;
  }

  let ok = false;
  const instOk = actor.institution_id ? String(student.institution_id || '') === String(actor.institution_id) : true;

  if (rs.has('teacher') && instOk && actor.institution_id) {
    const { ids } = await getTeacherGroupClassStudentScope(actor.sub);
    if (ids.includes(String(student.id || '').trim())) ok = true;
  }

  if (rs.has('coach') && actor.coach_id && String(student.coach_id || '') === String(actor.coach_id)) ok = true;

  return ok;
}

async function listStudentsMergedCoachTeacher(actor, roleSet) {
  const rowsMap = new Map();
  const inst = actor.institution_id || null;

  if (roleSet.has('teacher') && inst) {
    const { ids } = await getTeacherGroupClassStudentScope(actor.sub);
    if (ids.length) {
      const { data, error } = await supabaseAdmin
        .from('students')
        .select('*')
        .in('id', ids)
        .eq('institution_id', inst)
        .order('created_at', { ascending: false });
      if (error) throw error;
      (data || []).forEach((row) => rowsMap.set(row.id, row));
    }
  }

  if (roleSet.has('coach') && actor.coach_id) {
    const { data, error } = await supabaseAdmin
      .from('students')
      .select('*')
      .eq('coach_id', actor.coach_id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    (data || []).forEach((row) => rowsMap.set(row.id, row));
  }

  return [...rowsMap.values()].sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );
}

export default async function handler(req, res) {
  try {
    let actor = requireAuth(req);
    actor = await enrichStudentActor(actor);

    if (req.method === 'GET') {
      const rs = await actorRoleSet(actor);

      if (rs.has('super_admin')) {
        const { data, error } = await supabaseAdmin
          .from('students')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        return res.status(200).json({ data: data || [] });
      }

      if (rs.has('student')) {
        if (!actor.student_id) {
          const { data: linkOnly } = await supabaseAdmin
            .from('students')
            .select('*')
            .or(`platform_user_id.eq.${actor.sub},user_id.eq.${actor.sub}`)
            .maybeSingle();
          if (linkOnly) return res.status(200).json({ data: [linkOnly] });
          return res.status(200).json({ data: [] });
        }
        const { data, error } = await supabaseAdmin.from('students').select('*').eq('id', actor.student_id);
        if (error) throw error;
        return res.status(200).json({ data: data || [] });
      }

      /** Öğretmen/koç: kurumdaki tüm liste değil — sınıf veya koç ataması (admin ile birlikte de önce dar kapsam) */
      if (rs.has('teacher') || rs.has('coach')) {
        const merged = await listStudentsMergedCoachTeacher(actor, rs);
        return res.status(200).json({ data: merged });
      }

      if (rs.has('admin')) {
        if (!actor.institution_id) return res.status(403).json({ error: 'institution_missing' });
        const { data, error } = await supabaseAdmin
          .from('students')
          .select('*')
          .eq('institution_id', actor.institution_id)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return res.status(200).json({ data: data || [] });
      }

      return res.status(200).json({ data: [] });
    }

    if (req.method === 'POST') {
      if (
        actor.role !== 'super_admin' &&
        actor.role !== 'admin' &&
        actor.role !== 'coach' &&
        actor.role !== 'teacher'
      ) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const body = req.body || {};

      let institutionId = body.institution_id || actor.institution_id || null;
      if (actor.role === 'teacher') {
        if (!actor.institution_id) return res.status(403).json({ error: 'institution_missing' });
        if (!body.coach_id) return res.status(400).json({ error: 'coach_id_required_for_teacher' });
        institutionId = actor.institution_id;
      }

      if (actor.role === 'admin' && !hasInstitutionAccess(actor, institutionId)) {
        return res.status(403).json({ error: 'institution_forbidden' });
      }

      if (actor.role === 'coach' && !actor.coach_id) {
        return res.status(403).json({ error: 'coach_profile_missing' });
      }

      if (actor.role === 'teacher' && body.coach_id) {
        const { data: ch } = await supabaseAdmin
          .from('coaches')
          .select('institution_id')
          .eq('id', body.coach_id)
          .maybeSingle();
        if (!ch || ch.institution_id !== actor.institution_id) {
          return res.status(403).json({ error: 'coach_forbidden' });
        }
      }

      let resolvedCoachId =
        actor.role === 'coach' ? actor.coach_id : body.coach_id != null ? body.coach_id : null;

      await enforceStudentInsertQuotas({
        institutionId,
        coachId: resolvedCoachId || null
      });

      const payload = {
        id: normalizeUuidOrGenerate(body.id),
        name: body.name,
        email: body.email,
        phone: body.phone ?? null,
        birth_date: body.birth_date ?? null,
        class_level: body.class_level,
        school: body.school ?? null,
        parent_name: body.parent_name ?? null,
        parent_phone: body.parent_phone ?? null,
        coach_id: resolvedCoachId,
        program_id: body.program_id ?? null,
        institution_id: institutionId,
        created_at: body.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      let { data, error } = await supabaseAdmin.from('students').insert(payload).select().single();
      if (error) throw error;

      const authPw =
        body.auth_password != null ? String(body.auth_password).trim() : '';
      const syncAuth =
        body.sync_supabase_auth === true &&
        authPw.length >= 6 &&
        Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

      if (syncAuth && data?.id) {
        try {
          const sb = getSupabaseAdmin();
          const em = String(payload.email || '')
            .toLowerCase()
            .trim();
          const { data: auData, error: auErr } = await sb.auth.admin.createUser({
            email: em,
            password: authPw,
            email_confirm: true
          });
          if (!auErr && auData?.user?.id) {
            const { data: patched, error: pe } = await supabaseAdmin
              .from('students')
              .update({
                auth_user_id: auData.user.id,
                updated_at: new Date().toISOString()
              })
              .eq('id', data.id)
              .select()
              .single();
            if (!pe && patched) data = patched;
          }
        } catch (e) {
          console.warn('[students POST] Supabase Auth provision:', e);
        }
      }

      const loginPwdForPlatform = String(
        body.password ?? body.password_hash ?? body.auth_password ?? ''
      ).trim();
      if (data?.id) {
        data = await linkStudentToPlatformUser(actor, {
          studentRow: data,
          payload,
          institutionId,
          loginPwd: loginPwdForPlatform
        });
      }

      const cidNew = payload.coach_id || null;
      if (cidNew) await rebuildCoachStudentIdsFromFk(cidNew);
      return res.status(200).json({ data });
    }

    if (req.method === 'PATCH') {
      const id = String(req.query.id || '');
      const { data: existing } = await supabaseAdmin.from('students').select('*').eq('id', id).single();
      if (!existing || !(await assertStudentVisibilityResolved(actor, existing)))
        return res.status(403).json({ error: 'forbidden' });

      const body = req.body || {};
      const patchBody = { ...body };
      if (actor.role === 'coach') {
        delete patchBody.coach_id;
      }
      const prevCoachId = existing.coach_id || null;
      const nextCoachId = patchBody.coach_id !== undefined ? patchBody.coach_id : existing.coach_id;

      if (String(prevCoachId || '') !== String(nextCoachId || '') && nextCoachId) {
        await enforceCoachStudentQuota(nextCoachId);
      }

      if (actor.role === 'teacher') {
        if (!hasInstitutionAccess(actor, existing.institution_id)) {
          return res.status(403).json({ error: 'forbidden' });
        }
        if (body.coach_id !== undefined && body.coach_id) {
          const { data: ch } = await supabaseAdmin
            .from('coaches')
            .select('institution_id')
            .eq('id', body.coach_id)
            .maybeSingle();
          if (!ch || ch.institution_id !== actor.institution_id) {
            return res.status(403).json({ error: 'coach_forbidden' });
          }
        }
      }

      const { data, error } = await supabaseAdmin
        .from('students')
        .update({ ...patchBody, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      const coachChanged = String(prevCoachId || '') !== String((data?.coach_id ?? '') || '');
      if (coachChanged) {
        await rebuildCoachStudentIdsFromFk(prevCoachId);
        await rebuildCoachStudentIdsFromFk(data?.coach_id ?? null);
      }
      return res.status(200).json({ data });
    }

    if (req.method === 'DELETE') {
      if (actor.role === 'teacher') return res.status(403).json({ error: 'forbidden' });

      const id = String(req.query.id || '');
      const { data: existing } = await supabaseAdmin.from('students').select('*').eq('id', id).single();
      if (!existing || !(await assertStudentVisibilityResolved(actor, existing)))
        return res.status(403).json({ error: 'forbidden' });
      const prevCoachDel = existing.coach_id || null;
      await deleteStudentDependentRows(id);
      const { error } = await supabaseAdmin.from('students').delete().eq('id', id);
      if (error) throw error;
      if (prevCoachDel) await rebuildCoachStudentIdsFromFk(prevCoachDel);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    if (e instanceof QuotaError) {
      return res.status(403).json({ error: e.userMessage || 'Kullanıcı limitiniz doldu' });
    }
    if (e && typeof e === 'object') {
      const maybe = e;
      if (maybe.code === '23505' && String(maybe.message || '').includes('students_email_key')) {
        return res.status(409).json({ error: 'Bu e-posta ile kayıtlı öğrenci zaten var.' });
      }
    }
    const message =
      e instanceof Error
        ? e.message
        : typeof e === 'object' && e
          ? e.message || e.error_description || e.details || e.hint || JSON.stringify(e)
          : 'students_api_failed';
    if (message === 'Missing token' || message === 'Invalid token' || message === 'Invalid signature' || message === 'Token expired') {
      return res.status(401).json({ error: message });
    }
    return res.status(500).json({ error: message });
  }
}

