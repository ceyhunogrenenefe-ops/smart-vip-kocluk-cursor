import { requireAuth, hasInstitutionAccess } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { getTeacherGroupClassStudentScope } from '../api/_lib/teacher-class-scope.js';
import { applyStudentIdsToCoachFk, rebuildCoachStudentIdsFromFk } from '../api/_lib/sync-coach-students.js';
import { enforceOrganizationCoachQuota, QuotaError, getInstitutionAdminUserId } from '../api/_lib/quota-enforce.js';
import { normalizeUuidOrGenerate, isUuid } from '../api/_lib/uuid.js';

/** Eski projelerde `coaches.managed_by_admin_id` yoksa Supabase şeması bu hatayı verir — tekrarsız olarak sütunu düşürüp yeniden deneriz. */
function errText(error) {
  if (!error) return '';
  if (typeof error.message === 'string') return error.message;
  if (typeof error.details === 'string') return error.details;
  return '';
}

function isMissingCoachesColumn(error, column) {
  const t = errText(error);
  return t.includes(`'${column}'`) && t.includes('schema cache');
}

async function insertCoachRow(payload) {
  let p = { ...payload };
  for (let step = 0; step < 3; step += 1) {
    const { data, error } = await supabaseAdmin.from('coaches').insert(p).select().single();
    if (!error) return { data, error: null };
    if (
      isMissingCoachesColumn(error, 'managed_by_admin_id') &&
      Object.prototype.hasOwnProperty.call(p, 'managed_by_admin_id')
    ) {
      const { managed_by_admin_id: _drop, ...rest } = p;
      p = rest;
      continue;
    }
    return { data, error };
  }
  return { data: null, error: { message: 'coaches insert failed' } };
}

async function updateCoachRow(id, patchFields) {
  let p = { ...patchFields, updated_at: new Date().toISOString() };
  for (let step = 0; step < 3; step += 1) {
    const { data, error } = await supabaseAdmin.from('coaches').update(p).eq('id', id).select().single();
    if (!error) return { data, error: null };
    if (isMissingCoachesColumn(error, 'managed_by_admin_id') && 'managed_by_admin_id' in p) {
      const { managed_by_admin_id: _d, ...rest } = p;
      p = { ...rest, updated_at: new Date().toISOString() };
      continue;
    }
    return { data, error };
  }
  return { data: null, error: { message: 'coaches update failed' } };
}

const assertCoachVisibility = (actor, coach) => {
  if (actor.role === 'super_admin') return true;
  if (actor.role === 'admin') return hasInstitutionAccess(actor, coach.institution_id);
  if (actor.role === 'teacher') return hasInstitutionAccess(actor, coach.institution_id);
  if (actor.role === 'coach') return Boolean(actor.coach_id && coach.id === actor.coach_id);
  return false;
};

export default async function handler(req, res) {
  try {
    const actor = requireAuth(req);

    if (actor.role === 'teacher' && req.method !== 'GET') {
      return res.status(403).json({ error: 'forbidden' });
    }

    if (req.method === 'GET') {
      let query = supabaseAdmin.from('coaches').select('*').order('created_at', { ascending: false });
      if (actor.role === 'admin') {
        if (!actor.institution_id) return res.status(200).json({ data: [] });
        query = query.eq('institution_id', actor.institution_id);
      }
      if (actor.role === 'teacher') {
        if (!actor.institution_id) return res.status(200).json({ data: [] });
        const { ids: studentIds } = await getTeacherGroupClassStudentScope(actor.sub);
        if (!studentIds.length) return res.status(200).json({ data: [] });
        const { data: studs, error: se } = await supabaseAdmin
          .from('students')
          .select('coach_id')
          .in('id', studentIds)
          .eq('institution_id', actor.institution_id);
        if (se) throw se;
        const coachIds = [...new Set((studs || []).map((s) => s.coach_id).filter(Boolean))];
        if (!coachIds.length) return res.status(200).json({ data: [] });
        query = query.eq('institution_id', actor.institution_id).in('id', coachIds);
      }
      if (actor.role === 'coach') query = query.eq('id', actor.coach_id);
      if (actor.role === 'student') return res.status(403).json({ error: 'forbidden' });
      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json({ data: data || [] });
    }

    if (req.method === 'POST') {
      if (actor.role !== 'super_admin' && actor.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
      const body = req.body || {};
      const institutionId = body.institution_id || actor.institution_id || null;
      if (actor.role === 'admin' && !hasInstitutionAccess(actor, institutionId)) {
        return res.status(403).json({ error: 'institution_forbidden' });
      }

      const specialties = Array.isArray(body.specialties)
        ? body.specialties
        : Array.isArray(body.subjects)
          ? body.subjects
          : [];

      const emailNorm = String(body.email || '')
        .toLowerCase()
        .trim();
      if (!emailNorm) return res.status(400).json({ error: 'email required' });

      /** Aynı e-posta (users + coaches senkronu): INSERT yerine mevcut satırı güncelle */
      const { data: existingByEmail } = await supabaseAdmin
        .from('coaches')
        .select('*')
        .eq('email', emailNorm)
        .maybeSingle();

      if (existingByEmail) {
        const canMerge =
          assertCoachVisibility(actor, existingByEmail) ||
          (actor.role === 'admin' &&
            actor.institution_id &&
            (existingByEmail.institution_id == null ||
              String(existingByEmail.institution_id) === String(actor.institution_id)) &&
            (!institutionId || String(institutionId) === String(actor.institution_id)));
        if (!canMerge) {
          return res.status(409).json({ error: 'coach_email_exists', email: emailNorm });
        }

        const patch = {
          name: String(body.name || existingByEmail.name || '').trim() || existingByEmail.name,
          phone: body.phone !== undefined ? body.phone : existingByEmail.phone,
          specialties
        };
        if (institutionId && (existingByEmail.institution_id == null || existingByEmail.institution_id === '')) {
          patch.institution_id = institutionId;
        }
        if (Array.isArray(body.student_ids)) {
          patch.student_ids = body.student_ids.map(String);
        }

        const { data: merged, error: mergeErr } = await updateCoachRow(existingByEmail.id, patch);
        if (mergeErr) throw mergeErr;

        const maxStudentsQuota = Number(body.max_students_quota);
        const { error: limErr2 } = await supabaseAdmin.from('coach_limits').upsert(
          {
            coach_id: merged.id,
            max_students:
              Number.isFinite(maxStudentsQuota) && maxStudentsQuota >= 0 ? Math.floor(maxStudentsQuota) : 30,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'coach_id' }
        );
        if (limErr2) {
          console.warn('[coaches] coach_limits (merge):', errText(limErr2));
        }

        if (merged?.id && Array.isArray(body.student_ids) && body.student_ids.length > 0) {
          await applyStudentIdsToCoachFk(String(merged.id), body.student_ids.map(String));
        } else if (merged?.id) {
          await rebuildCoachStudentIdsFromFk(String(merged.id));
        }
        return res.status(200).json({ data: merged, merged_existing: true });
      }

      await enforceOrganizationCoachQuota(institutionId);

      let managedBy = null;
      if (actor.role === 'admin' && actor.sub && isUuid(actor.sub)) {
        managedBy = actor.sub;
      } else if (actor.role === 'super_admin') {
        const fromBody =
          typeof body.managed_by_admin_id === 'string' && isUuid(body.managed_by_admin_id)
            ? body.managed_by_admin_id
            : null;
        managedBy =
          fromBody || (institutionId ? await getInstitutionAdminUserId(institutionId) : null);
        if (!isUuid(String(managedBy || ''))) managedBy = null;
      }

      const resolvedId = normalizeUuidOrGenerate(body.id);

      const payload = {
        id: resolvedId,
        name: String(body.name || ''),
        email: emailNorm,
        phone: body.phone ?? null,
        specialties,
        student_ids: Array.isArray(body.student_ids) ? body.student_ids.map(String) : [],
        institution_id: institutionId,
        managed_by_admin_id: managedBy,
        created_at: body.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await insertCoachRow(payload);
      if (error) throw error;

      const maxStudentsQuota = Number(body.max_students_quota);
      const { error: limErr } = await supabaseAdmin.from('coach_limits').upsert(
        {
          coach_id: data.id,
          max_students:
            Number.isFinite(maxStudentsQuota) && maxStudentsQuota >= 0 ? Math.floor(maxStudentsQuota) : 30,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'coach_id' }
      );
      if (limErr) {
        console.warn('[coaches] coach_limits:', errText(limErr));
      }

      if (data?.id && Array.isArray(payload.student_ids) && payload.student_ids.length > 0) {
        await applyStudentIdsToCoachFk(String(data.id), payload.student_ids.map(String));
      }
      return res.status(200).json({ data });
    }

    if (req.method === 'PATCH') {
      const id = String(req.query.id || '');
      const { data: existing } = await supabaseAdmin.from('coaches').select('*').eq('id', id).single();
      if (!existing || !assertCoachVisibility(actor, existing)) return res.status(403).json({ error: 'forbidden' });
      const body = req.body || {};
      const { data, error } = await updateCoachRow(id, body);
      if (error) throw error;
      if (Array.isArray(body.student_ids)) {
        await applyStudentIdsToCoachFk(id, body.student_ids.map(String));
      } else {
        await rebuildCoachStudentIdsFromFk(id);
      }
      return res.status(200).json({ data });
    }

    if (req.method === 'DELETE') {
      const id = String(req.query.id || '');
      const { data: existing } = await supabaseAdmin.from('coaches').select('*').eq('id', id).single();
      if (!existing || !assertCoachVisibility(actor, existing)) return res.status(403).json({ error: 'forbidden' });
      const { error } = await supabaseAdmin.from('coaches').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    if (e instanceof QuotaError) {
      return res.status(403).json({ error: e.userMessage || 'Kullanıcı limitiniz doldu' });
    }
    let message = 'coaches_api_failed';
    if (e instanceof Error) message = e.message;
    else if (e && typeof e === 'object') {
      const o = /** @type {Record<string, unknown>} */ (e);
      message =
        (typeof o.message === 'string' && o.message) ||
        (typeof o.details === 'string' && o.details) ||
        (typeof o.hint === 'string' && o.hint) ||
        '';
      if (!message) {
        try {
          message = JSON.stringify(e);
        } catch {
          message = 'coaches_api_failed';
        }
      }
    }
    if (message === 'Missing token' || message === 'Invalid token' || message === 'Invalid signature' || message === 'Token expired') {
      return res.status(401).json({ error: message });
    }
    return res.status(500).json({ error: message });
  }
}

