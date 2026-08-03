/**
 * Öğretmen/koç kendi vitrin profili
 * GET  /api/teacher-profile
 * PATCH /api/teacher-profile  (pasif/silinmiş hariç her zaman düzenlenebilir)
 * POST  /api/teacher-profile?op=submit  (onaya gönder; yayına admin onayı gerekir)
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { actorRoleSet } from '../api/_lib/actor-roles.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  applyPatchToWorking,
  canEditProfile,
  completionPercent,
  deriveStatusAfterEdit,
  ensureTeacherProfileForUser,
  isUpdatePendingStatus,
  missingRequiredFields,
  workingPayloadFromRow,
  writeAuditLog
} from '../api/_lib/teacher-profile.js';
import { notifyTeacherProfileEvent } from '../api/_lib/teacher-profile-notify.js';

function jwtHasRole(actor, role) {
  const want = String(role || '').toLowerCase();
  if (String(actor?.role || '').toLowerCase() === want) return true;
  if (Array.isArray(actor?.roles) && actor.roles.some((r) => String(r || '').toLowerCase() === want)) return true;
  return false;
}

async function isVitrineActor(actor) {
  if (jwtHasRole(actor, 'teacher') || jwtHasRole(actor, 'coach')) return true;
  if (String(actor.role) === 'teacher' || String(actor.role) === 'coach') return true;
  try {
    const roles = await actorRoleSet(actor);
    const list =
      roles instanceof Set
        ? [...roles]
        : Array.isArray(roles)
          ? roles.map((r) => String(r || '').toLowerCase())
          : [];
    return list.includes('teacher') || list.includes('coach');
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
    const vitrineOk = await isVitrineActor(actor);
    if (!vitrineOk) return res.status(403).json({ error: 'teacher_or_coach_only' });

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

    // Yalnızca kendi profili (ensure zaten user_id ile)
    if (String(profile.user_id) !== uid) {
      return res.status(403).json({ error: 'forbidden_other_profile' });
    }

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
      const editable = canEditProfile(profile);
      const submitStatuses = [
        'draft',
        'incomplete',
        'rejected',
        'published',
        'update_pending',
        'changes_pending',
        'pending_approval'
      ];
      return res.status(200).json({
        profile,
        working,
        approved_data: profile.published_snapshot || null,
        pending_data: profile.pending_data || pendingRev?.payload || null,
        missing_required: missing,
        completion_pct: completionPercent(working),
        editing_enabled: editable,
        can_edit: editable,
        can_submit: editable && missing.length === 0 && submitStatuses.includes(profile.status),
        awaiting_approval:
          profile.status === 'pending_approval' || isUpdatePendingStatus(profile.status),
        pending_revision: pendingRev || null,
        account: { id: user.id, name: user.name, email: user.email, phone: user.phone }
      });
    }

    if (req.method === 'POST' && op === 'submit') {
      if (!canEditProfile(profile)) {
        return res.status(403).json({ error: 'editing_disabled' });
      }
      const working = workingPayloadFromRow(profile);
      const missing = missingRequiredFields(working);
      if (missing.length) {
        return res.status(400).json({
          error: 'profile_incomplete',
          missing_required: missing,
          completion_pct: completionPercent(working)
        });
      }
      if (!String(working.photo_url || working.photo_path || '').trim()) {
        return res.status(400).json({
          error: 'profile_incomplete',
          missing_required: ['photo'],
          message: 'Profil fotoğrafı zorunludur'
        });
      }

      const prev = { status: profile.status };
      const hadPublished = !!(profile.published_snapshot && Object.keys(profile.published_snapshot).length);
      let nextStatus = hadPublished || profile.status === 'published' || isUpdatePendingStatus(profile.status)
        ? 'update_pending'
        : 'pending_approval';
      let revision = null;

      if (hadPublished || profile.status === 'published' || isUpdatePendingStatus(profile.status)) {
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
        nextStatus = 'update_pending';
      }

      const now = new Date().toISOString();
      const { data: updated, error } = await supabaseAdmin
        .from('teacher_profiles')
        .update({
          status: nextStatus,
          submitted_at: now,
          last_submitted_at: now,
          pending_data: working,
          editing_enabled: true,
          rejection_reason: null,
          completion_pct: 100,
          updated_at: now
        })
        .eq('id', profile.id)
        .eq('user_id', uid)
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

      await notifyTeacherProfileEvent({
        event: 'submitted',
        targetUserId: uid,
        senderUserId: uid,
        institutionId: user.institution_id,
        notifyAdmins: true
      });

      return res.status(200).json({
        profile: updated,
        revision,
        message: 'Profiliniz yönetici onayına gönderildi'
      });
    }

    if (req.method === 'PATCH') {
      if (!canEditProfile(profile)) {
        return res.status(403).json({ error: 'editing_disabled' });
      }

      const body = req.body || {};
      const nextWorking = applyPatchToWorking(profile, body);
      const pct = completionPercent(nextWorking);
      let nextStatus = deriveStatusAfterEdit(profile, pct);

      const patch = {
        ...nextWorking,
        completion_pct: pct,
        status: nextStatus,
        updated_at: new Date().toISOString(),
        editing_enabled: true
      };

      const inApprovalQueue =
        profile.status === 'pending_approval' ||
        profile.status === 'published' ||
        isUpdatePendingStatus(profile.status);
      const hadPublished = !!(profile.published_snapshot && Object.keys(profile.published_snapshot).length);

      // Yayındaki / onay kuyruğundaki: published_snapshot dokunulmaz
      if (inApprovalQueue) {
        patch.status = hadPublished || profile.status === 'published' || isUpdatePendingStatus(profile.status)
          ? 'update_pending'
          : 'pending_approval';
        // Onay beklerken yapılan değişiklikler pending_data'ya yazılır; site snapshot'ı korunur
        if (profile.status === 'pending_approval' || isUpdatePendingStatus(profile.status)) {
          patch.pending_data = nextWorking;
        }
        const { data: openRev } = await supabaseAdmin
          .from('teacher_profile_revisions')
          .select('id,status')
          .eq('profile_id', profile.id)
          .in('status', ['draft', 'pending_approval'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (openRev?.id) {
          const revStatus =
            openRev.status === 'pending_approval' || profile.status === 'pending_approval'
              ? 'pending_approval'
              : 'draft';
          await supabaseAdmin
            .from('teacher_profile_revisions')
            .update({
              payload: nextWorking,
              status: revStatus,
              updated_at: new Date().toISOString()
            })
            .eq('id', openRev.id);
        } else if (hadPublished || isUpdatePendingStatus(profile.status) || profile.status === 'published') {
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
        .eq('user_id', uid)
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
