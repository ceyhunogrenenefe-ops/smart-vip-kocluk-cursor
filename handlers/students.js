import { requireAuth, hasInstitutionAccess } from '../api/_lib/auth.js';
import { enrichStudentActor } from '../api/_lib/enrich-student-actor.js';
import { getSupabaseAdmin, supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { normalizeUuidOrGenerate } from '../api/_lib/uuid.js';
import { rebuildCoachStudentIdsFromFk } from '../api/_lib/sync-coach-students.js';
import { enforceStudentInsertQuotas, enforceCoachStudentQuota, QuotaError } from '../api/_lib/quota-enforce.js';

const assertStudentVisibility = (actor, student) => {
  if (actor.role === 'super_admin') return true;
  if (actor.role === 'admin') return hasInstitutionAccess(actor, student.institution_id);
  if (actor.role === 'teacher') return hasInstitutionAccess(actor, student.institution_id);
  if (actor.role === 'coach') return Boolean(actor.coach_id && student.coach_id === actor.coach_id);
  if (actor.role === 'student') {
    if (actor.student_id && student.id === actor.student_id) return true;
    if (actor.sub && student.platform_user_id && String(student.platform_user_id) === String(actor.sub))
      return true;
    if (actor.sub && student.user_id && String(student.user_id) === String(actor.sub)) return true;
    return false;
  }
  return false;
};

export default async function handler(req, res) {
  try {
    let actor = requireAuth(req);
    actor = await enrichStudentActor(actor);

    if (req.method === 'GET') {
      let query = supabaseAdmin.from('students').select('*').order('created_at', { ascending: false });
      if (actor.role === 'admin' || actor.role === 'teacher') query = query.eq('institution_id', actor.institution_id);
      if (actor.role === 'coach') {
        if (!actor.coach_id) return res.status(200).json({ data: [] });
        query = query.eq('coach_id', actor.coach_id);
      }
      if (actor.role === 'student') {
        if (!actor.student_id) {
          const { data: linkOnly } = await supabaseAdmin
            .from('students')
            .select('*')
            .or(`platform_user_id.eq.${actor.sub},user_id.eq.${actor.sub}`)
            .maybeSingle();
          if (linkOnly) return res.status(200).json({ data: [linkOnly] });
          return res.status(200).json({ data: [] });
        }
        query = query.eq('id', actor.student_id);
      }
      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json({ data: data || [] });
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

      const cidNew = payload.coach_id || null;
      if (cidNew) await rebuildCoachStudentIdsFromFk(cidNew);
      return res.status(200).json({ data });
    }

    if (req.method === 'PATCH') {
      const id = String(req.query.id || '');
      const { data: existing } = await supabaseAdmin.from('students').select('*').eq('id', id).single();
      if (!existing || !assertStudentVisibility(actor, existing)) return res.status(403).json({ error: 'forbidden' });

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
      if (!existing || !assertStudentVisibility(actor, existing)) return res.status(403).json({ error: 'forbidden' });
      const prevCoachDel = existing.coach_id || null;
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

