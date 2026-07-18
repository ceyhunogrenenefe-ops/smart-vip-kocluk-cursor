/**
 * Admin öğretmen vitrin profil onayları
 * GET    /api/teacher-profiles-admin
 * GET    /api/teacher-profiles-admin?id=
 * POST   /api/teacher-profiles-admin?op=approve&id=
 * POST   /api/teacher-profiles-admin?op=reject&id=
 * POST   /api/teacher-profiles-admin?op=deactivate&id=
 * POST   /api/teacher-profiles-admin?op=activate&id=
 * POST   /api/teacher-profiles-admin?op=retry-sync&id=
 * PATCH  /api/teacher-profiles-admin?id=  (admin edit)
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { actorRoleSet, roleSetHasAdmin, roleSetHasSuperAdmin } from '../api/_lib/actor-roles.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  applyPatchToWorking,
  completionPercent,
  ensureTeacherProfileForUser,
  missingRequiredFields,
  publicDetailFromSnapshot,
  pushSiteSync,
  workingPayloadFromRow,
  writeAuditLog
} from '../api/_lib/teacher-profile.js';

async function requireAdmin(actor) {
  const roles = await actorRoleSet(actor);
  return roleSetHasAdmin(roles) || roleSetHasSuperAdmin(roles);
}

function clientIp(req) {
  return (
    String(req.headers['x-forwarded-for'] || '')
      .split(',')[0]
      .trim() || null
  );
}

async function loadProfile(id) {
  const { data, error } = await supabaseAdmin
    .from('teacher_profiles')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export default async function handler(req, res) {
  try {
    const actor = requireAuthenticatedActor(req);
    if (!(await requireAdmin(actor))) return res.status(403).json({ error: 'forbidden' });

    const id = String(req.query.id || '').trim();
    const op = String(req.query.op || '').trim();
    const statusFilter = String(req.query.status || '').trim();

    if (req.method === 'GET' && !id) {
      let q = supabaseAdmin
        .from('teacher_profiles')
        .select('*')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(200);
      if (statusFilter) q = q.eq('status', statusFilter);
      const { data, error } = await q;
      if (error) throw error;

      const userIds = [...new Set((data || []).map((r) => r.user_id).filter(Boolean))];
      let usersById = {};
      if (userIds.length) {
        const { data: users } = await supabaseAdmin
          .from('users')
          .select('id, name, email, phone, is_active')
          .in('id', userIds);
        for (const u of users || []) usersById[u.id] = u;
      }

      return res.status(200).json({
        data: (data || []).map((p) => ({
          ...p,
          user: usersById[p.user_id] || null,
          missing_required: missingRequiredFields(workingPayloadFromRow(p))
        }))
      });
    }

    if (req.method === 'GET' && id) {
      const profile = await loadProfile(id);
      if (!profile) return res.status(404).json({ error: 'not_found' });
      const { data: revisions } = await supabaseAdmin
        .from('teacher_profile_revisions')
        .select('*')
        .eq('profile_id', id)
        .order('created_at', { ascending: false })
        .limit(20);
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('id, name, email, phone, is_active, role, roles')
        .eq('id', profile.user_id)
        .maybeSingle();
      return res.status(200).json({
        profile,
        user,
        revisions: revisions || [],
        published_preview: profile.published_snapshot
          ? publicDetailFromSnapshot(profile)
          : null,
        working: workingPayloadFromRow(profile)
      });
    }

    if (req.method === 'POST' && op === 'ensure' && id) {
      // id = user_id
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('id, name, email, role, roles')
        .eq('id', id)
        .maybeSingle();
      if (!user) return res.status(404).json({ error: 'user_not_found' });
      const profile = await ensureTeacherProfileForUser(user, { actorId: actor.sub });
      return res.status(200).json({ profile });
    }

    if (req.method === 'POST' && id && (op === 'approve' || op === 'reject' || op === 'deactivate' || op === 'activate' || op === 'retry-sync')) {
      const profile = await loadProfile(id);
      if (!profile) return res.status(404).json({ error: 'not_found' });
      const body = req.body || {};

      if (op === 'retry-sync') {
        const result = await pushSiteSync(profile, 'teacher_profile_upsert');
        const fresh = await loadProfile(id);
        return res.status(200).json({ profile: fresh, sync: result });
      }

      if (op === 'deactivate') {
        const { data: updated, error } = await supabaseAdmin
          .from('teacher_profiles')
          .update({
            status: 'passive',
            is_active: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
          .select('*')
          .single();
        if (error) throw error;
        await writeAuditLog({
          profileId: id,
          actorUserId: actor.sub,
          action: 'deactivate',
          previousValue: { status: profile.status },
          newValue: { status: 'passive' },
          ip: clientIp(req)
        });
        await pushSiteSync(updated, 'teacher_profile_deactivate');
        return res.status(200).json({ profile: updated });
      }

      if (op === 'activate') {
        const canPublish = profile.published_snapshot && Object.keys(profile.published_snapshot).length;
        const { data: updated, error } = await supabaseAdmin
          .from('teacher_profiles')
          .update({
            status: canPublish ? 'published' : profile.completion_pct >= 100 ? 'draft' : 'incomplete',
            is_active: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
          .select('*')
          .single();
        if (error) throw error;
        await writeAuditLog({
          profileId: id,
          actorUserId: actor.sub,
          action: 'activate',
          previousValue: { status: profile.status },
          newValue: { status: updated.status },
          ip: clientIp(req)
        });
        if (updated.status === 'published') await pushSiteSync(updated, 'teacher_profile_upsert');
        return res.status(200).json({ profile: updated });
      }

      if (op === 'reject') {
        const reason = String(body.rejection_reason || body.reason || '').trim();
        if (!reason) return res.status(400).json({ error: 'rejection_reason_required' });

        const { data: pendingRev } = await supabaseAdmin
          .from('teacher_profile_revisions')
          .select('id')
          .eq('profile_id', id)
          .eq('status', 'pending_approval')
          .maybeSingle();
        if (pendingRev?.id) {
          await supabaseAdmin
            .from('teacher_profile_revisions')
            .update({
              status: 'rejected',
              rejection_reason: reason,
              reviewed_at: new Date().toISOString(),
              reviewed_by: actor.sub,
              updated_at: new Date().toISOString()
            })
            .eq('id', pendingRev.id);
        }

        const nextStatus = profile.published_snapshot ? 'published' : 'rejected';
        const { data: updated, error } = await supabaseAdmin
          .from('teacher_profiles')
          .update({
            status: nextStatus,
            rejection_reason: reason,
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
          .select('*')
          .single();
        if (error) throw error;

        await writeAuditLog({
          profileId: id,
          actorUserId: actor.sub,
          action: 'reject',
          previousValue: { status: profile.status },
          newValue: { status: nextStatus, rejection_reason: reason },
          ip: clientIp(req)
        });
        return res.status(200).json({ profile: updated });
      }

      if (op === 'approve') {
        let snapshot = workingPayloadFromRow(profile);
        const { data: pendingRev } = await supabaseAdmin
          .from('teacher_profile_revisions')
          .select('*')
          .eq('profile_id', id)
          .in('status', ['pending_approval', 'draft'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (pendingRev?.payload && typeof pendingRev.payload === 'object') {
          snapshot = { ...snapshot, ...pendingRev.payload };
          await supabaseAdmin
            .from('teacher_profile_revisions')
            .update({
              status: 'approved',
              reviewed_at: new Date().toISOString(),
              reviewed_by: actor.sub,
              updated_at: new Date().toISOString()
            })
            .eq('id', pendingRev.id);
        }

        const missing = missingRequiredFields(snapshot);
        if (missing.length) {
          return res.status(400).json({ error: 'profile_incomplete', missing_required: missing });
        }

        const { data: updated, error } = await supabaseAdmin
          .from('teacher_profiles')
          .update({
            ...snapshot,
            published_snapshot: snapshot,
            status: 'published',
            is_active: true,
            private_lesson_enabled: snapshot.private_lesson_enabled !== false,
            completion_pct: 100,
            rejection_reason: null,
            approved_at: new Date().toISOString(),
            approved_by: actor.sub,
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
          .select('*')
          .single();
        if (error) throw error;

        await writeAuditLog({
          profileId: id,
          actorUserId: actor.sub,
          action: 'approve',
          previousValue: { status: profile.status },
          newValue: { status: 'published', slug: updated.slug },
          ip: clientIp(req)
        });

        const sync = await pushSiteSync(updated, 'teacher_profile_upsert');
        return res.status(200).json({ profile: updated, sync });
      }
    }

    if (req.method === 'PATCH' && id) {
      const profile = await loadProfile(id);
      if (!profile) return res.status(404).json({ error: 'not_found' });
      const body = req.body || {};
      const nextWorking = applyPatchToWorking(profile, body);
      const pct = completionPercent(nextWorking);
      const { data: updated, error } = await supabaseAdmin
        .from('teacher_profiles')
        .update({
          ...nextWorking,
          completion_pct: pct,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      await writeAuditLog({
        profileId: id,
        actorUserId: actor.sub,
        action: 'admin_patch',
        previousValue: { completion_pct: profile.completion_pct },
        newValue: { completion_pct: pct },
        ip: clientIp(req)
      });
      return res.status(200).json({ profile: updated });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    const msg = errorMessage(e);
    if (
      msg.includes('Unauthorized') ||
      msg.includes('Missing token') ||
      msg.includes('Invalid token') ||
      msg.includes('Invalid signature') ||
      msg.includes('Token expired') ||
      /\bauth\b/i.test(msg)
    ) {
      return res.status(401).json({ error: 'Unauthorized', message: msg });
    }
    // Supabase: tablo yok / schema cache
    if (/teacher_profiles/i.test(msg) || /schema cache/i.test(msg) || msg.includes('42P01') || msg.includes('PGRST')) {
      return res.status(503).json({
        error: 'teacher_profiles_unavailable',
        message: msg,
        hint: 'Supabase SQL Editor\'da sql/2026-07-18-teacher-public-profiles.sql calistirildi mi?'
      });
    }
    console.error('[teacher-profiles-admin]', msg);
    return res.status(500).json({ error: 'server_error', message: msg });
  }
}
