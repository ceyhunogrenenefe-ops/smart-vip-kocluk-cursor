/**
 * CRM Admin API — /api/crm-admin?op=...
 * Create CRM-only users, promote existing users to crm_agent, manage assignments.
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { actorRoleSet, actorIsAdminLike } from '../api/_lib/actor-roles.js';
import crypto from 'crypto';

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

function normalizeRoles(primary, rolesArr) {
  const set = new Set();
  if (primary) set.add(String(primary).toLowerCase());
  if (Array.isArray(rolesArr)) {
    for (const r of rolesArr) {
      const t = String(r || '').toLowerCase().trim();
      if (t) set.add(t);
    }
  }
  return [...set];
}

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const roleSet = await actorRoleSet(actor);
  if (!actorIsAdminLike(actor, roleSet)) {
    return res.status(403).json({ error: 'admin_only' });
  }

  const body = req.method === 'GET' ? {} : parseBody(req);
  const op = String(req.query?.op || body.op || '').trim();

  try {
    if (op === 'create_crm_user' && req.method === 'POST') {
      const email = String(body.email || '')
        .toLowerCase()
        .trim();
      const name = String(body.name || body.full_name || '').trim();
      const password = String(body.password || body.password_hash || '').trim();
      const institutionId =
        String(body.institution_id || actor.institution_id || '').trim() || null;
      const canPool = body.can_access_unassigned_pool !== false;

      if (!email) return res.status(400).json({ error: 'email_required' });
      if (!name) return res.status(400).json({ error: 'name_required' });
      if (password.length < 6) return res.status(400).json({ error: 'password_min_6' });

      const { data: existing } = await supabaseAdmin
        .from('users')
        .select('id, email, role, roles')
        .eq('email', email)
        .maybeSingle();
      if (existing?.id) {
        return res.status(409).json({ error: 'email_exists', user_id: existing.id });
      }

      const id = crypto.randomUUID();
      const row = {
        id,
        email,
        name,
        role: 'crm_agent',
        roles: ['crm_agent'],
        password_hash: password,
        institution_id: institutionId,
        is_active: true,
        created_at: new Date().toISOString()
      };
      const { data: created, error } = await supabaseAdmin
        .from('users')
        .insert(row)
        .select('id, name, email, role, roles, institution_id, is_active')
        .maybeSingle();
      if (error) throw error;

      try {
        await supabaseAdmin.from('crm_user_assignments').upsert(
          {
            user_id: id,
            institution_id: institutionId,
            can_access_unassigned_pool: canPool,
            is_active: true,
            created_by: actor.sub,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'user_id,institution_id' }
        );
      } catch (e) {
        console.warn('[crm-admin] assignment upsert:', e?.message || e);
      }

      return res.status(201).json({ data: created });
    }

    if (op === 'promote_agent' && req.method === 'POST') {
      const userId = String(body.user_id || '').trim();
      const institutionId =
        String(body.institution_id || actor.institution_id || '').trim() || null;
      const canPool = body.can_access_unassigned_pool !== false;
      if (!userId) return res.status(400).json({ error: 'user_id_required' });

      const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('id, name, email, role, roles, institution_id')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      if (!user) return res.status(404).json({ error: 'user_not_found' });

      const roles = normalizeRoles(user.role, user.roles);
      if (!roles.includes('crm_agent')) roles.push('crm_agent');

      // Keep primary role if they already have coach/admin; otherwise set crm_agent
      const keepPrimary = ['super_admin', 'admin', 'coach', 'teacher'].includes(
        String(user.role || '').toLowerCase()
      );
      const patch = {
        roles,
        updated_at: new Date().toISOString()
      };
      if (!keepPrimary) patch.role = 'crm_agent';

      const { data: updated, error: upErr } = await supabaseAdmin
        .from('users')
        .update(patch)
        .eq('id', userId)
        .select('id, name, email, role, roles, institution_id')
        .maybeSingle();
      if (upErr) throw upErr;

      try {
        await supabaseAdmin.from('crm_user_assignments').upsert(
          {
            user_id: userId,
            institution_id: institutionId || user.institution_id || null,
            can_access_unassigned_pool: canPool,
            is_active: true,
            created_by: actor.sub,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'user_id,institution_id' }
        );
      } catch (e) {
        console.warn('[crm-admin] assignment upsert:', e?.message || e);
      }

      return res.status(200).json({ data: updated });
    }

    if (op === 'demote_agent' && req.method === 'POST') {
      const userId = String(body.user_id || '').trim();
      if (!userId) return res.status(400).json({ error: 'user_id_required' });

      const { data: user } = await supabaseAdmin
        .from('users')
        .select('id, role, roles')
        .eq('id', userId)
        .maybeSingle();
      if (!user) return res.status(404).json({ error: 'user_not_found' });

      const roles = normalizeRoles(user.role, user.roles).filter((r) => r !== 'crm_agent');
      const patch = {
        roles,
        updated_at: new Date().toISOString()
      };
      if (String(user.role).toLowerCase() === 'crm_agent') {
        patch.role = roles[0] || 'crm_agent';
        if (patch.role === 'crm_agent' && roles.length === 0) {
          // deactivate instead of orphaning
          patch.is_active = false;
        }
      }

      const { data: updated, error } = await supabaseAdmin
        .from('users')
        .update(patch)
        .eq('id', userId)
        .select('id, name, email, role, roles, is_active')
        .maybeSingle();
      if (error) throw error;

      await supabaseAdmin
        .from('crm_user_assignments')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('user_id', userId);

      return res.status(200).json({ data: updated });
    }

    if (op === 'list_agents' || op === 'list') {
      const institutionId = String(
        req.query?.institution_id || body.institution_id || actor.institution_id || ''
      ).trim();

      let assignments = [];
      try {
        let aq = supabaseAdmin
          .from('crm_user_assignments')
          .select(
            'id, user_id, institution_id, can_access_unassigned_pool, is_active, notes, users:user_id(id, name, email, role, roles, is_active)'
          )
          .order('created_at', { ascending: false });
        if (institutionId) aq = aq.eq('institution_id', institutionId);
        const { data, error } = await aq;
        if (error) throw error;
        assignments = data || [];
      } catch (e) {
        if (!/crm_user_assignments|does not exist/i.test(e?.message || '')) throw e;
      }

      let q = supabaseAdmin
        .from('users')
        .select('id, name, email, role, roles, institution_id, is_active')
        .or('role.eq.crm_agent,roles.cs.{"crm_agent"}')
        .limit(200);
      if (institutionId) q = q.eq('institution_id', institutionId);
      const { data: roleUsers } = await q;

      // Candidate coaches for promotion
      let coachesQ = supabaseAdmin
        .from('users')
        .select('id, name, email, role, roles, institution_id')
        .eq('role', 'coach')
        .eq('is_active', true)
        .limit(100);
      if (institutionId) coachesQ = coachesQ.eq('institution_id', institutionId);
      const { data: coaches } = await coachesQ;

      return res.status(200).json({
        data: {
          assignments,
          role_users: roleUsers || [],
          coach_candidates: coaches || []
        }
      });
    }

    if (op === 'update_assignment' && req.method === 'POST') {
      const userId = String(body.user_id || '').trim();
      const institutionId =
        String(body.institution_id || actor.institution_id || '').trim() || null;
      if (!userId) return res.status(400).json({ error: 'user_id_required' });
      const patch = {
        updated_at: new Date().toISOString()
      };
      if (typeof body.can_access_unassigned_pool === 'boolean') {
        patch.can_access_unassigned_pool = body.can_access_unassigned_pool;
      }
      if (typeof body.is_active === 'boolean') patch.is_active = body.is_active;
      if (body.notes != null) patch.notes = String(body.notes);

      const { data, error } = await supabaseAdmin
        .from('crm_user_assignments')
        .upsert(
          {
            user_id: userId,
            institution_id: institutionId,
            can_access_unassigned_pool: body.can_access_unassigned_pool !== false,
            is_active: body.is_active !== false,
            created_by: actor.sub,
            ...patch
          },
          { onConflict: 'user_id,institution_id' }
        )
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    return res.status(400).json({ error: 'unknown_op', op });
  } catch (e) {
    console.error('[crm-admin]', e);
    return res.status(500).json({ error: e instanceof Error ? e.message : 'server_error' });
  }
}
