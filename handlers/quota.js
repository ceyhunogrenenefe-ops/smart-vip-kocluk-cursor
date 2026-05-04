import { requireAuthenticatedActor, hasInstitutionAccess } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import {
  getInstitutionAdminUserId,
  getAdminLimits,
  getCoachLimitRow
} from '../api/_lib/quota-enforce.js';

async function countWhere(table, filters) {
  let q = supabaseAdmin.from(table).select('id', { count: 'exact', head: true });
  for (const [k, v] of Object.entries(filters)) {
    if (v !== null && v !== undefined) q = q.eq(k, v);
  }
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

function pct(current, max) {
  if (max == null || max <= 0) return null;
  return Math.min(100, Math.round((current / max) * 1000) / 10);
}

async function institutionSnapshot(institutionId) {
  const adminUserId = await getInstitutionAdminUserId(institutionId);
  const limits = adminUserId ? await getAdminLimits(adminUserId) : null;
  const students = await countWhere('students', { institution_id: institutionId });
  const coaches = await countWhere('coaches', { institution_id: institutionId });
  return {
    institution_id: institutionId,
    admin_user_id: adminUserId,
    admin_limits: limits,
    counts: { students, coaches },
    usage_pct: {
      students: pct(students, limits?.max_students ?? null),
      coaches: pct(coaches, limits?.max_coaches ?? null)
    }
  };
}

export default async function handler(req, res) {
  try {
    const actor = requireAuthenticatedActor(req);

    if (req.method === 'GET') {
      const adminLimitsFor =
        actor.role === 'super_admin' ? String(req.query.admin_limits_for || '').trim() : '';

      if (adminLimitsFor) {
        const { data: u } = await supabaseAdmin
          .from('users')
          .select('id, role, institution_id')
          .eq('id', adminLimitsFor)
          .maybeSingle();
        if (!u || u.role !== 'admin') {
          return res.status(404).json({ error: 'admin_not_found' });
        }
        const limits = await getAdminLimits(adminLimitsFor);
        return res.status(200).json({
          data: {
            admin_user_id: adminLimitsFor,
            institution_id: u.institution_id,
            admin_limits: limits
          }
        });
      }

      const coachLimitFor =
        actor.role === 'super_admin' || actor.role === 'admin'
          ? String(req.query.coach_limit_for || '').trim()
          : '';

      if (coachLimitFor) {
        const { data: coach } = await supabaseAdmin
          .from('coaches')
          .select('id, institution_id')
          .eq('id', coachLimitFor)
          .maybeSingle();
        if (!coach) return res.status(404).json({ error: 'coach_not_found' });
        if (actor.role === 'admin' && !hasInstitutionAccess(actor, coach.institution_id)) {
          return res.status(403).json({ error: 'forbidden' });
        }
        const row = await getCoachLimitRow(coachLimitFor);
        const assigned = await countWhere('students', { coach_id: coachLimitFor });
        return res.status(200).json({
          data: {
            coach_id: coachLimitFor,
            max_students: row?.max_students ?? null,
            assigned_students: assigned
          }
        });
      }

      const instFromQuery =
        actor.role === 'super_admin' ? String(req.query.institution_id || '').trim() || null : null;

      const institutionId =
        instFromQuery || actor.institution_id || null;

      if (!institutionId) {
        return res.status(400).json({ error: 'institution_required' });
      }

      if (actor.role !== 'super_admin' && !hasInstitutionAccess(actor, institutionId)) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const base = await institutionSnapshot(institutionId);

      if (actor.role === 'coach' && actor.coach_id) {
        const assigned = await countWhere('students', { coach_id: actor.coach_id });
        const row = await getCoachLimitRow(actor.coach_id);
        base.coach = {
          coach_id: actor.coach_id,
          max_students: row?.max_students ?? null,
          assigned_students: assigned,
          usage_pct: pct(assigned, row?.max_students ?? null)
        };
      } else if (actor.role === 'coach') {
        base.coach = null;
      }

      return res.status(200).json({ data: base });
    }

    if (req.method === 'PATCH') {
      const body = req.body || {};
      const scope = body.scope;

      if (scope === 'admin') {
        if (!(actor.role === 'super_admin' || actor.role === 'admin')) {
          return res.status(403).json({ error: 'forbidden' });
        }

        let adminUserId = String(body.admin_user_id || '').trim();
        const maxStudents = Number(body.max_students);
        const maxCoaches = Number(body.max_coaches);

        if (actor.role === 'admin') {
          const canonical = await getInstitutionAdminUserId(actor.institution_id);
          if (!canonical || canonical !== actor.sub) {
            return res.status(403).json({ error: 'not_institution_admin' });
          }
          adminUserId = actor.sub;
        }

        if (!adminUserId) return res.status(400).json({ error: 'admin_user_id_required' });

        await supabaseAdmin.from('admin_limits').upsert(
          {
            admin_id: adminUserId,
            max_students:
              Number.isFinite(maxStudents) && maxStudents >= 0 ? Math.floor(maxStudents) : 50,
            max_coaches:
              Number.isFinite(maxCoaches) && maxCoaches >= 0 ? Math.floor(maxCoaches) : 10,
            package_label:
              typeof body.package_label === 'string' && body.package_label.trim()
                ? body.package_label.trim()
                : 'professional',
            updated_at: new Date().toISOString()
          },
          { onConflict: 'admin_id' }
        );

        return res.status(200).json({ ok: true });
      }

      if (scope === 'coach') {
        if (!(actor.role === 'super_admin' || actor.role === 'admin')) {
          return res.status(403).json({ error: 'forbidden' });
        }

        const coachId = String(body.coach_id || '').trim();
        const coachMax = Number(body.max_students);
        if (!coachId) return res.status(400).json({ error: 'coach_id_required' });

        const { data: coach } = await supabaseAdmin.from('coaches').select('id, institution_id').eq('id', coachId).maybeSingle();
        if (!coach) return res.status(404).json({ error: 'coach_not_found' });
        if (actor.role === 'admin' && !hasInstitutionAccess(actor, coach.institution_id)) {
          return res.status(403).json({ error: 'forbidden' });
        }

        await supabaseAdmin.from('coach_limits').upsert(
          {
            coach_id: coachId,
            max_students:
              Number.isFinite(coachMax) && coachMax >= 0 ? Math.floor(coachMax) : 30,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'coach_id' }
        );

        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: 'invalid_scope' });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.message
        : typeof e === 'object' && e
          ? e.message || JSON.stringify(e)
          : 'quota_api_failed';
    if (
      msg === 'Missing token' ||
      msg === 'Invalid token' ||
      msg === 'Invalid signature' ||
      msg === 'Token expired'
    ) {
      return res.status(401).json({ error: msg });
    }
    return res.status(500).json({ error: msg });
  }
}

