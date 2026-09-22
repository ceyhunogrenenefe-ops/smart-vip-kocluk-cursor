/**
 * CRM Admin API — /api/crm-admin?op=...
 * Create CRM-only users, promote existing users to crm_agent, manage assignments.
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { actorRoleSet, actorIsAdminLike } from '../api/_lib/actor-roles.js';
import crypto from 'crypto';
import { PLATFORM_PRIMARY_INSTITUTION_ID } from '../api/_lib/quota-enforce.js';

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


function userHasRole(user, role) {
  const want = String(role || '').toLowerCase();
  if (!want) return false;
  if (String(user?.role || '').toLowerCase() === want) return true;
  const roles = user?.roles;
  if (Array.isArray(roles)) return roles.some((r) => String(r || '').toLowerCase() === want);
  return false;
}

function softInstitutionMatch(rowInst, filterInst) {
  if (!filterInst) return true;
  const a = String(rowInst || '').trim();
  if (!a) return true; // kurum boş kullanıcıları da aday göster
  return a === String(filterInst);
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
      // Kurumsuz süper admin oluşturursa temsilci kurumsuz kalıyor, CRM ekranları 400 veriyordu
      const institutionId =
        String(body.institution_id || actor.institution_id || '').trim() || PLATFORM_PRIMARY_INSTITUTION_ID;
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

    // FAZ 2 — otomatik dağıtım ayarları
    // Vardiya (nöbet) yönetimi — kim hangi gün/saat görevde
    if (op === 'shifts') {
      const inst = String(body.institution_id || req.query?.institution_id || actor.institution_id || '').trim() || PLATFORM_PRIMARY_INSTITUTION_ID;
      const { listShifts, saveShift, deleteShift, onDutyUserIdsAt } = await import('../api/_lib/crm-shifts.js');
      const action = String(body.action || '').trim();
      if (req.method === 'POST') {
        if (action === 'save') {
          const r = await saveShift({
            institutionId: inst,
            id: body.id,
            userId: body.user_id,
            dayOfWeek: body.day_of_week,
            startTime: body.start_time,
            endTime: body.end_time,
            isActive: body.is_active !== false,
            note: body.note,
            actorId: actor.sub
          });
          if (r?.error) return res.status(400).json({ error: 'invalid', message: r.error });
        } else if (action === 'delete') {
          const id = String(body.id || '').trim();
          if (!id) return res.status(400).json({ error: 'id_required' });
          await deleteShift(inst, id);
        }
      }
      const shifts = await listShifts(inst);
      const ids = [...new Set(shifts.map((s) => String(s.user_id)))];
      const { data: users } = ids.length
        ? await supabaseAdmin.from('users').select('id, name').in('id', ids)
        : { data: [] };
      const names = Object.fromEntries((users || []).map((u) => [String(u.id), u.name || '']));
      return res.status(200).json({
        data: {
          shifts: shifts.map((s) => ({ ...s, user_name: names[String(s.user_id)] || '' })),
          on_duty: shifts.length ? onDutyUserIdsAt(shifts) : null
        }
      });
    }

    // FAZ 7 — personel WhatsApp bildirimi (resmî Meta şablonu)
    if (op === 'staff_alerts') {
      const inst = String(body.institution_id || req.query?.institution_id || actor.institution_id || '').trim() || PLATFORM_PRIMARY_INSTITUTION_ID;
      const { getCrmSettings, updateCrmSettings } = await import('../api/_lib/crm-assignment.js');
      const { sendStaffAlert } = await import('../api/_lib/crm-staff-alerts.js');
      const { crmGatewayStatus } = await import('../api/_lib/crm-gateway-send.js');
      const action = String(body.action || '').trim();
      if (req.method === 'POST') {
        if (action === 'settings') {
          const patch = {};
          if (typeof body.enabled === 'boolean') patch.staff_wa_enabled = body.enabled;
          if (body.admin_user_id !== undefined) patch.staff_wa_admin_user_id = String(body.admin_user_id || '').trim() || null;
          if (Object.keys(patch).length) await updateCrmSettings(inst, patch, actor.sub);
        } else if (action === 'agent') {
          const uid = String(body.user_id || '').trim();
          if (!uid) return res.status(400).json({ error: 'user_id_required' });
          const { error } = await supabaseAdmin
            .from('crm_user_assignments')
            .update({ wa_alerts_enabled: Boolean(body.wa_alerts_enabled) })
            .eq('user_id', uid);
          if (error) throw error;
        } else if (action === 'test') {
          const r = await sendStaffAlert({
            institutionId: inst,
            userId: actor.sub,
            eventType: 'test',
            dedupeKey: `test:${actor.sub}:${Date.now()}`,
            summary: 'Test bildirimi',
            detail: 'Personel WhatsApp bildirimleri çalışıyor',
            ignoreQuiet: true
          });
          if (r.status !== 'sent') {
            const hint = {
              recipient_not_eligible: 'Hesabınız CRM temsilci listesinde değil, bildirimi kapalı ya da telefon numaranız kayıtlı değil.',
              rate_limited: 'Son 1 saatte 6 mesaj sınırına ulaşıldı.'
            }[r.error] || r.error || r.status;
            return res.status(400).json({ error: 'test_failed', message: `Test gönderilemedi: ${hint}` });
          }
        }
      }
      const settings = await getCrmSettings(inst);
      const { data: assigns } = await supabaseAdmin
        .from('crm_user_assignments')
        .select('user_id, is_active, wa_alerts_enabled');
      const ids = (assigns || []).map((a) => String(a.user_id));
      const { data: users } = ids.length
        ? await supabaseAdmin.from('users').select('id, name, phone').in('id', ids)
        : { data: [] };
      const byId = Object.fromEntries((users || []).map((u) => [String(u.id), u]));
      const { data: log } = await supabaseAdmin
        .from('crm_staff_alert_log')
        .select('id, user_id, event_type, summary, status, error, created_at')
        .eq('institution_id', inst)
        .order('created_at', { ascending: false })
        .limit(30);
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const { count: sentThisMonth } = await supabaseAdmin
        .from('crm_staff_alert_log')
        .select('id', { count: 'exact', head: true })
        .eq('institution_id', inst)
        .eq('status', 'sent')
        .gte('created_at', monthStart.toISOString());
      const gateway = await crmGatewayStatus().catch(() => ({ connected: false, status: 'error' }));
      return res.status(200).json({
        data: {
          channel: 'gateway_super_admin',
          gateway_connected: Boolean(gateway.connected),
          gateway_status: gateway.status || null,
          enabled: settings.staff_wa_enabled === true,
          admin_user_id: settings.staff_wa_admin_user_id || null,
          template_status: settings.staff_wa_template_status || null,
          template_checked_at: settings.staff_wa_template_checked_at || null,
          template_error: settings.staff_wa_template_error || null,
          sent_this_month: sentThisMonth || 0,
          agents: (assigns || [])
            .filter((a) => a.is_active !== false && byId[String(a.user_id)])
            .map((a) => ({
              user_id: String(a.user_id),
              name: byId[String(a.user_id)]?.name || '',
              has_phone: Boolean(String(byId[String(a.user_id)]?.phone || '').trim()),
              wa_alerts_enabled: a.wa_alerts_enabled !== false
            }))
            .sort((x, y) => x.name.localeCompare(y.name, 'tr')),
          log: (log || []).map((l) => ({ ...l, user_name: byId[String(l.user_id)]?.name || '' }))
        }
      });
    }

    if (op === 'assignment_settings') {
      const inst = String(body.institution_id || req.query?.institution_id || actor.institution_id || '').trim() || PLATFORM_PRIMARY_INSTITUTION_ID;
      const { getCrmSettings, updateCrmSettings, listRoundRobinAgents } = await import('../api/_lib/crm-assignment.js');
      if (req.method === 'POST' && typeof body.round_robin_enabled === 'boolean') {
        await updateCrmSettings(inst, { round_robin_enabled: body.round_robin_enabled }, actor.sub);
      }
      const settings = await getCrmSettings(inst);
      const pool = await listRoundRobinAgents(inst);
      const { count: unassignedLeads } = await supabaseAdmin
        .from('registration_leads')
        .select('id', { count: 'exact', head: true })
        .eq('institution_id', inst)
        .eq('primary_status', 'tracking')
        .eq('is_internal', false)
        .is('assigned_user_id', null)
        .is('deleted_at', null);
      const { count: unassignedConvs } = await supabaseAdmin
        .from('crm_conversations')
        .select('id', { count: 'exact', head: true })
        .eq('institution_id', inst)
        .eq('is_internal', false)
        .in('status', ['open', 'pending'])
        .is('assigned_user_id', null);
      return res.status(200).json({
        data: {
          round_robin_enabled: settings.round_robin_enabled !== false,
          next_after_user_id: settings.rr_last_user_id || null,
          pool,
          unassigned_leads: unassignedLeads || 0,
          unassigned_conversations: unassignedConvs || 0
        }
      });
    }

    if (op === 'set_round_robin' && req.method === 'POST') {
      const userId = String(body.user_id || '').trim();
      if (!userId) return res.status(400).json({ error: 'user_id_required' });
      const { error: rrErr } = await supabaseAdmin
        .from('crm_user_assignments')
        .update({ in_round_robin: body.in_round_robin !== false, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (rrErr) throw rrErr;
      return res.status(200).json({ ok: true });
    }

    if (op === 'distribute_unassigned' && req.method === 'POST') {
      const inst = String(body.institution_id || actor.institution_id || '').trim() || PLATFORM_PRIMARY_INSTITUTION_ID;
      const { distributeUnassigned } = await import('../api/_lib/crm-assignment.js');
      const result = await distributeUnassigned(inst);
      return res.status(result.ok ? 200 : 400).json(result.ok ? { data: result } : { error: result.error });
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
            'id, user_id, institution_id, can_access_unassigned_pool, is_active, in_round_robin, notes, users:user_id(id, name, email, role, roles, is_active)'
          )
          .order('created_at', { ascending: false });
        // institution_id null atamaları da getir (filtreyi JS'te yumuşat)
        const { data, error } = await aq.limit(300);
        if (error) throw error;
        assignments = (data || []).filter(
          (a) => softInstitutionMatch(a.institution_id, institutionId) && a.is_active !== false
        );
      } catch (e) {
        if (!/crm_user_assignments|does not exist/i.test(e?.message || '')) throw e;
      }

      // PostgREST roles.cs.{"crm_agent"} jsonb'de kırılıyor → JS filtre
      const { data: staffRows, error: staffErr } = await supabaseAdmin
        .from('users')
        .select('id, name, email, role, roles, institution_id, is_active')
        .in('role', ['crm_agent', 'coach', 'admin', 'super_admin', 'teacher'])
        .limit(500);
      if (staffErr) throw staffErr;

      const roleUsersMap = new Map();
      for (const u of staffRows || []) {
        if (!userHasRole(u, 'crm_agent')) continue;
        if (u.is_active === false) continue;
        if (!softInstitutionMatch(u.institution_id, institutionId)) continue;
        roleUsersMap.set(u.id, u);
      }
      // Atama tablosundan gelenleri de aktif ajan say
      for (const a of assignments) {
        const u = a.users;
        if (u?.id && !roleUsersMap.has(u.id)) {
          roleUsersMap.set(u.id, {
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            roles: u.roles,
            institution_id: a.institution_id,
            is_active: u.is_active !== false
          });
        }
      }
      const roleUsers = [...roleUsersMap.values()];

      const coaches = (staffRows || []).filter((u) => {
        if (u.is_active === false) return false;
        if (!userHasRole(u, 'coach')) return false;
        if (userHasRole(u, 'crm_agent')) return false; // zaten ajan
        if (!softInstitutionMatch(u.institution_id, institutionId)) return false;
        return true;
      });

      return res.status(200).json({
        data: {
          assignments,
          role_users: roleUsers,
          coach_candidates: coaches
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
