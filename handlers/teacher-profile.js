/**
 * Öğretmen kendi vitrin profili
 * GET  /api/teacher-profile
 * PATCH /api/teacher-profile
 * POST  /api/teacher-profile?op=submit
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { actorRoleSet } from '../api/_lib/actor-roles.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  applyPatchToWorking,
  completionPercent,
  deriveStatusAfterEdit,
  ensureTeacherProfileForUser,
  missingRequiredFields,
  workingPayloadFromRow,
  writeAuditLog
} from '../api/_lib/teacher-profile.js';

function jwtHasRole(actor, role) {
  const want = String(role || '').toLowerCase();
  if (String(actor?.role || '').toLowerCase() === want) return true;
  if (Array.isArray(actor?.roles) && actor.roles.some((r) => String(r || '').toLowerCase() === want)) return true;
  return false;
}

async function isTeacherActor(actor) {
  if (jwtHasRole(actor, 'teacher') || String(actor.role) === 'teacher') return true;
  try {
    const roles = await actorRoleSet(actor);
    if (roles instanceof Set) return roles.has('teacher');
    if (Array.isArray(roles)) return roles.map((r) => String(r || '').toLowerCase()).includes('teacher');
  } catch (_) { /* ignore */ }
  return false;
}

function clientIp(req) {
  return (
    String(req.headers['x-forwarded-for'] || '')
      .split(',')[0]
      .trim() ||
    req.socket?.remoteAddress ||
    null
  );
}

export default async function handler(req, res) {
  try {
    const actor = requireAuthenticatedActor(req);
    const teacherOk = await isTeacherActor(actor);
    const adminOk = jwtHasRole(actor, 'admin') || jwtHasRole(actor, 'super_admin');
    if (!teacherOk && !adminOk) {
      return res.status(403).json({ error: 'forbidden' });
    }
    if (!teacherOk) return res.status(403).json({ error: 'teacher_only' });

    const uid = String(actor.sub || '').trim();
    const { data: user, error: uErr } = await supabaseAdmin
      .from('users')
      .select('id, name, email, phone, role, roles, institution_id, is_active')
      .eq('id', uid)
      .maybeSingle();
    if (uErr) throw uErr;
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    let profile = await ensureTeacherProfileForUser(user, { actorId: uid });
    if (!profile) return res.status(400).json({ error: 'not_a_teacher' });

    const op = String(req.query.op || '').trim();

    if (req.method === 'GET') {
      const { data: pendingRev } = await supabaseAdmin
        .from('teacher_profile_revisions')
        .select('*')
        .eq('profile_id', profile.id)
        .in('status', ['draft', 'pending_approval'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const working = workingPayloadFromRow(profile);
      const missing = missingRequiredFields(working);
      return res.status(200).json({
        profile,
        working,
        missing_required: missing,
        completion_pct: completionPercent(working),
        can_submit: missing.length === 0 && ['draft', 'incomplete', 'rejected', 'published', 'changes_pending'].includes(profile.status),
        pending_revision: pendingRev || null,
        account: { id: user.id, name: user.name, email: user.email, phone: user.phone }
      });
    }

    if (req.method === 'POST' && op === 'submit') {
      const working = workingPayloadFromRow(profile);
      const missing = missingRequiredFields(working);
      if (missing.length) {
        return res.status(400).json({
          error: 'profile_incomplete',
          missing_required: missing,
          completion_pct: completionPercent(working)
        });
      }

      const prev = { status: profile.status };
      let nextStatus = 'pending_approval';
      let revision = null;

      if (profile.status === 'published' || profile.status === 'changes_pending') {
        // Yayındaki profil: revizyon oluştur, published_snapshot korunur
        const { data: openRev } = await supabaseAdmin
          .from('teacher_profile_revisions')
          .select('id')
          .eq('profile_id', profile.id)
          .eq('status', 'pending_approval')
          .maybeSingle();

        if (openRev?.id) {
          const { data: rev, error: rErr } = await supabaseAdmin
            .from('teacher_profile_revisions')
            .update({
              payload: working,
              submitted_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', openRev.id)
            .select('*')
            .single();
          if (rErr) throw rErr;
          revision = rev;
        } else {
          const { data: rev, error: rErr } = await supabaseAdmin
            .from('teacher_profile_revisions')
            .insert({
              profile_id: profile.id,
              status: 'pending_approval',
              payload: working,
              submitted_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .select('*')
            .single();
          if (rErr) throw rErr;
          revision = rev;
        }
        nextStatus = 'changes_pending';
      }

      const { data: updated, error } = await supabaseAdmin
        .from('teacher_profiles')
        .update({
          status: nextStatus,
          submitted_at: new Date().toISOString(),
          rejection_reason: null,
          completion_pct: 100,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id)
        .select('*')
        .single();
      if (error) throw error;

      await writeAuditLog({
        profileId: profile.id,
        actorUserId: uid,
        action: 'submit_for_approval',
        previousValue: prev,
        newValue: { status: nextStatus, revision_id: revision?.id || null },
        ip: clientIp(req)
      });

      return res.status(200).json({ profile: updated, revision });
    }

    if (req.method === 'PATCH') {
      const body = req.body || {};
      if (profile.status === 'passive') {
        return res.status(403).json({ error: 'profile_passive' });
      }

      const nextWorking = applyPatchToWorking(profile, body);
      const pct = completionPercent(nextWorking);
      const nextStatus = deriveStatusAfterEdit(profile, pct);

      const patch = {
        ...nextWorking,
        completion_pct: pct,
        status: nextStatus,
        updated_at: new Date().toISOString()
      };

      // Yayında iken düzenleme → changes_pending; snapshot dokunulmaz
      if (profile.status === 'published' || profile.status === 'changes_pending') {
        patch.status = 'changes_pending';
        const { data: openRev } = await supabaseAdmin
          .from('teacher_profile_revisions')
          .select('id')
          .eq('profile_id', profile.id)
          .in('status', ['draft', 'pending_approval'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (openRev?.id) {
          await supabaseAdmin
            .from('teacher_profile_revisions')
            .update({
              payload: nextWorking,
              status: 'draft',
              updated_at: new Date().toISOString()
            })
            .eq('id', openRev.id);
        } else {
          await supabaseAdmin.from('teacher_profile_revisions').insert({
            profile_id: profile.id,
            status: 'draft',
            payload: nextWorking,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      }

      const { data: updated, error } = await supabaseAdmin
        .from('teacher_profiles')
        .update(patch)
        .eq('id', profile.id)
        .select('*')
        .single();
      if (error) throw error;

      await writeAuditLog({
        profileId: profile.id,
        actorUserId: uid,
        action: 'teacher_profile_patch',
        previousValue: { status: profile.status, completion_pct: profile.completion_pct },
        newValue: { status: updated.status, completion_pct: updated.completion_pct },
        ip: clientIp(req)
      });

      return res.status(200).json({
        profile: updated,
        missing_required: missingRequiredFields(nextWorking),
        completion_pct: pct
      });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    const msg = errorMessage(e);
    if (msg.includes('Unauthorized') || msg.includes('auth')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('[teacher-profile]', msg);
    return res.status(500).json({ error: 'server_error' });
  }
}
