/**
 * Admin öğretmen vitrin profil onayları
 * GET    /api/teacher-profiles-admin
 * GET    /api/teacher-profiles-admin?id=
 * POST   /api/teacher-profiles-admin?op=approve&id=
 * POST   /api/teacher-profiles-admin?op=reject&id=
 * POST   /api/teacher-profiles-admin?op=deactivate&id=
 * POST   /api/teacher-profiles-admin?op=activate&id=
 * POST   /api/teacher-profiles-admin?op=republish&id=
 * POST   /api/teacher-profiles-admin?op=retry-sync&id=
 * POST   /api/teacher-profiles-admin?op=enable-editing&id=
 * POST   /api/teacher-profiles-admin?op=soft-delete&id=
 * POST   /api/teacher-profiles-admin?op=restore&id=
 * POST   /api/teacher-profiles-admin?op=hard-delete&id=
 * PATCH  /api/teacher-profiles-admin?id=  (admin edit)
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { actorRoleSet, roleSetHasAdmin, roleSetHasSuperAdmin } from '../api/_lib/actor-roles.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  applyPatchToWorking,
  completionPercent,
  EDITABLE_FIELDS,
  ensureTeacherProfileForUser,
  isUpdatePendingStatus,
  missingRequiredFields,
  publicDetailFromSnapshot,
  pushSiteSync,
  workingPayloadFromRow,
  writeAuditLog
} from '../api/_lib/teacher-profile.js';
import { notifyTeacherProfileEvent } from '../api/_lib/teacher-profile-notify.js';
import {
  SITE_TEACHER_CATALOG,
  findSiteCatalogBySlug,
  mapCatalogToProfilePatch
} from '../api/_lib/site-teacher-catalog.js';

/** JWT rollerinden senkron admin kontrolu (Promise/Set hatasi uretmez). */
function rolesFromActorJwt(actor) {
  const roles = new Set();
  const add = (r) => {
    const v = String(r || '').trim().toLowerCase();
    if (v) roles.add(v);
  };
  add(actor?.role);
  if (Array.isArray(actor?.roles)) actor.roles.forEach(add);
  return roles;
}

function isAdminFromJwt(actor) {
  const roles = rolesFromActorJwt(actor);
  return roles.has('admin') || roles.has('super_admin');
}

function isSuperAdminFromJwt(actor) {
  return rolesFromActorJwt(actor).has('super_admin');
}

async function isAdminActor(actor) {
  if (isAdminFromJwt(actor)) return true;
  try {
    const dbRoles = await actorRoleSet(actor);
    if (dbRoles instanceof Set) {
      return roleSetHasAdmin(dbRoles) || roleSetHasSuperAdmin(dbRoles);
    }
    if (Array.isArray(dbRoles)) {
      return dbRoles.map((r) => String(r || '').toLowerCase()).some((r) => r === 'admin' || r === 'super_admin');
    }
  } catch (e) {
    console.warn('[teacher-profiles-admin] actorRoleSet failed', e?.message || e);
  }
  return false;
}

async function isSuperAdminActor(actor) {
  if (isSuperAdminFromJwt(actor)) return true;
  try {
    const dbRoles = await actorRoleSet(actor);
    return roleSetHasSuperAdmin(dbRoles);
  } catch (e) {
    console.warn('[teacher-profiles-admin] super_admin check failed', e?.message || e);
  }
  return false;
}

function clientIp(req) {
  return (
    String(req.headers['x-forwarded-for'] || '')
      .split(',')[0]
      .trim() || null
  );
}

async function loadProfile(id, { includeDeleted = false } = {}) {
  let q = supabaseAdmin.from('teacher_profiles').select('*').eq('id', id);
  if (!includeDeleted) q = q.is('deleted_at', null);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data;
}

async function loadActorInstitutionId(actor) {
  if (actor?.institution_id) return actor.institution_id;
  const { data } = await supabaseAdmin
    .from('users')
    .select('institution_id')
    .eq('id', actor.sub)
    .maybeSingle();
  return data?.institution_id || null;
}

function jsonEq(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Field-level diff keys between published snapshot and working/pending payload. */
function fieldDiffKeys(published, pendingOrWorking) {
  const a = published && typeof published === 'object' ? published : {};
  const b = pendingOrWorking && typeof pendingOrWorking === 'object' ? pendingOrWorking : {};
  const keys = new Set([...EDITABLE_FIELDS, ...Object.keys(a), ...Object.keys(b)]);
  const changed = [];
  for (const k of keys) {
    if (k === 'id' || k === 'user_id' || k === 'slug') continue;
    if (!jsonEq(a[k], b[k])) changed.push(k);
  }
  return changed;
}

const MUTATION_OPS = new Set([
  'approve',
  'reject',
  'deactivate',
  'activate',
  'republish',
  'retry-sync',
  'enable-editing',
  'soft-delete',
  'restore',
  'hard-delete'
]);

export default async function handler(req, res) {
  try {
    const actor = requireAuthenticatedActor(req);
    if (!(await isAdminActor(actor))) return res.status(403).json({ error: 'forbidden' });

    const id = String(req.query.id || '').trim();
    const op = String(req.query.op || '').trim();
    let statusFilter = String(req.query.status || '').trim();
    if (statusFilter === 'changes_pending') statusFilter = 'update_pending';

    const actorIsSuper = await isSuperAdminActor(actor);

    // Sitedeki statik kadro listesi + panel eşleşme durumu
    if (req.method === 'GET' && op === 'site-catalog') {
      const { data: profiles } = await supabaseAdmin
        .from('teacher_profiles')
        .select('id, user_id, slug, status, display_name, deleted_at')
        .is('deleted_at', null)
        .limit(500);
      const bySlug = {};
      for (const p of profiles || []) {
        if (p.slug) bySlug[String(p.slug).toLowerCase()] = p;
      }
      const userIds = [...new Set((profiles || []).map((p) => p.user_id).filter(Boolean))];
      let usersById = {};
      if (userIds.length) {
        const { data: users } = await supabaseAdmin
          .from('users')
          .select('id, name, email')
          .in('id', userIds);
        for (const u of users || []) usersById[u.id] = u;
      }
      return res.status(200).json({
        catalog: SITE_TEACHER_CATALOG.map((t) => {
          const linked = bySlug[t.slug] || null;
          return {
            ...t,
            photo_url: t.photo
              ? `${String(process.env.SITE_PUBLIC_ORIGIN || 'https://onlinevipdershane.com').replace(/\/$/, '')}/${String(t.photo).replace(/^\//, '')}`
              : null,
            linked_profile: linked
              ? {
                  id: linked.id,
                  user_id: linked.user_id,
                  status: linked.status,
                  display_name: linked.display_name,
                  user: usersById[linked.user_id] || null
                }
              : null
          };
        })
      });
    }

    if (req.method === 'GET' && !id) {
      let q = supabaseAdmin
        .from('teacher_profiles')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(200);

      if (statusFilter === 'deleted') {
        q = q.or('deleted_at.not.is.null,status.eq.deleted');
      } else {
        q = q.is('deleted_at', null);
        if (statusFilter === 'update_pending') {
          q = q.in('status', ['update_pending', 'changes_pending']);
        } else if (statusFilter) {
          q = q.eq('status', statusFilter);
        }
      }

      if (!actorIsSuper) {
        const instId = await loadActorInstitutionId(actor);
        if (!instId) {
          return res.status(200).json({ data: [] });
        }
        const { data: instUsers, error: uErr } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('institution_id', instId);
        if (uErr) throw uErr;
        const userIdsScoped = (instUsers || []).map((u) => u.id).filter(Boolean);
        if (!userIdsScoped.length) {
          return res.status(200).json({ data: [] });
        }
        q = q.in('user_id', userIdsScoped);
      }

      const { data, error } = await q;
      if (error) {
        const em = String(error.message || error.code || error);
        console.error('[teacher-profiles-admin] list error', em);
        if (/teacher_profiles/i.test(em) || /schema cache/i.test(em) || /42P01|PGRST/i.test(em)) {
          return res.status(200).json({
            data: [],
            warning: 'teacher_profiles_unavailable',
            message: em,
            hint: 'Supabase SQL Editor: sql/2026-07-18-teacher-public-profiles.sql'
          });
        }
        throw error;
      }

      const userIds = [...new Set((data || []).map((r) => r.user_id).filter(Boolean))];
      let usersById = {};
      if (userIds.length) {
        const { data: users } = await supabaseAdmin
          .from('users')
          .select('id, name, email, phone, is_active, institution_id')
          .in('id', userIds);
        for (const u of users || []) usersById[u.id] = u;
      }

      return res.status(200).json({
        data: (data || []).map((p) => ({
          ...p,
          user: usersById[p.user_id] || null,
          missing_required: missingRequiredFields(workingPayloadFromRow(p)),
          status: isUpdatePendingStatus(p.status) ? 'update_pending' : p.status
        }))
      });
    }

    if (req.method === 'GET' && id) {
      let profile = await loadProfile(id);
      if (!profile) {
        profile = await loadProfile(id, { includeDeleted: true });
        if (!profile || (profile.status !== 'deleted' && !profile.deleted_at)) {
          return res.status(404).json({ error: 'not_found' });
        }
      }
      const { data: revisions } = await supabaseAdmin
        .from('teacher_profile_revisions')
        .select('*')
        .eq('profile_id', id)
        .order('created_at', { ascending: false })
        .limit(20);
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('id, name, email, phone, is_active, role, roles, institution_id')
        .eq('id', profile.user_id)
        .maybeSingle();

      const working = workingPayloadFromRow(profile);
      const pending =
        profile.pending_data ||
        (revisions || []).find((r) => r.status === 'pending_approval' || r.status === 'draft')?.payload ||
        null;
      const publishedPreview = profile.published_snapshot
        ? publicDetailFromSnapshot(profile)
        : null;
      const compareTarget = pending || working;
      const publishedForDiff =
        profile.published_snapshot && typeof profile.published_snapshot === 'object'
          ? profile.published_snapshot
          : {};

      return res.status(200).json({
        profile,
        user,
        revisions: revisions || [],
        published_preview: publishedPreview,
        working,
        approved_data: profile.published_snapshot || null,
        pending_data: pending,
        changed_fields: fieldDiffKeys(publishedForDiff, compareTarget)
      });
    }

    if (req.method === 'POST' && op === 'ensure' && id) {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('id, name, email, role, roles')
        .eq('id', id)
        .maybeSingle();
      if (!user) return res.status(404).json({ error: 'user_not_found' });
      const profile = await ensureTeacherProfileForUser(user, { actorId: actor.sub });
      return res.status(200).json({ profile });
    }

    // id = user_id (veya body.user_id / body.user_email) — sitedeki kadro bilgisini profile ön-doldur
    if (req.method === 'POST' && op === 'import-site-catalog') {
      const body = req.body || {};
      const slug = String(body.slug || '').trim().toLowerCase();
      const fillEmptyOnly = body.fill_empty_only !== false;
      const enableEditing = body.enable_editing !== false;
      const catalog = findSiteCatalogBySlug(slug);
      if (!catalog) return res.status(404).json({ error: 'catalog_slug_not_found' });

      let userId = id || String(body.user_id || '').trim();
      if (!userId && body.user_email) {
        const email = String(body.user_email || '').trim().toLowerCase();
        const { data: byEmail } = await supabaseAdmin
          .from('users')
          .select('id, name, email, role, roles, institution_id')
          .ilike('email', email)
          .maybeSingle();
        if (!byEmail) return res.status(404).json({ error: 'user_not_found', message: 'E-posta ile kullanıcı bulunamadı' });
        userId = byEmail.id;
      }
      if (!userId) return res.status(400).json({ error: 'user_id_or_email_required' });

      const { data: user } = await supabaseAdmin
        .from('users')
        .select('id, name, email, role, roles, institution_id')
        .eq('id', userId)
        .maybeSingle();
      if (!user) return res.status(404).json({ error: 'user_not_found' });

      if (!actorIsSuper) {
        const instId = await loadActorInstitutionId(actor);
        if (!instId || String(user.institution_id || '') !== String(instId)) {
          return res.status(403).json({ error: 'institution_mismatch' });
        }
      }

      let profile = await ensureTeacherProfileForUser(user, { actorId: actor.sub });
      if (!profile) return res.status(400).json({ error: 'user_not_teacher_or_coach' });

      const { data: slugOwner } = await supabaseAdmin
        .from('teacher_profiles')
        .select('id, user_id')
        .eq('slug', slug)
        .is('deleted_at', null)
        .maybeSingle();
      if (slugOwner && String(slugOwner.user_id) !== String(user.id)) {
        return res.status(409).json({
          error: 'slug_taken',
          message: `Slug /${slug} başka bir profile bağlı`,
          profile_id: slugOwner.id
        });
      }

      const { patch, applied } = mapCatalogToProfilePatch(catalog, profile, { fillEmptyOnly });
      if (!profile.published_snapshot || String(profile.slug) === slug || !slugOwner) {
        if (!slugOwner || String(slugOwner.user_id) === String(user.id)) {
          patch.slug = slug;
          if (!applied.includes('slug')) applied.push('slug');
        }
      }

      const now = new Date().toISOString();
      const nextWorking = { ...workingPayloadFromRow(profile), ...patch };
      const pct = completionPercent(nextWorking);
      const updateRow = {
        ...patch,
        completion_pct: pct,
        updated_at: now
      };
      if (enableEditing) {
        updateRow.editing_enabled = true;
        updateRow.editing_enabled_at = now;
        updateRow.editing_enabled_by = actor.sub;
      }
      if (!profile.published_snapshot) {
        updateRow.status = pct >= 100 ? 'draft' : 'incomplete';
      }

      const { data: updated, error } = await supabaseAdmin
        .from('teacher_profiles')
        .update(updateRow)
        .eq('id', profile.id)
        .select('*')
        .single();
      if (error) throw error;

      await writeAuditLog({
        profileId: profile.id,
        actorUserId: actor.sub,
        action: 'import_site_catalog',
        previousValue: { slug: profile.slug, status: profile.status },
        newValue: { slug: updated.slug, applied_fields: applied, catalog_slug: slug },
        ip: clientIp(req)
      });

      if (enableEditing) {
        await notifyTeacherProfileEvent({
          event: 'editing_enabled',
          targetUserId: user.id,
          senderUserId: actor.sub,
          institutionId: user.institution_id,
          extraBody: `Sitedeki «${catalog.name}» kartındaki bilgiler profilinize aktarıldı. Eksik alanları tamamlayıp onaya gönderin.`
        });
      }

      return res.status(200).json({
        profile: updated,
        applied_fields: applied,
        missing_required: missingRequiredFields(workingPayloadFromRow(updated)),
        catalog
      });
    }

    if (req.method === 'POST' && id && MUTATION_OPS.has(op)) {
      const needsDeleted =
        op === 'restore' || op === 'hard-delete' || op === 'soft-delete';
      const profile = await loadProfile(id, { includeDeleted: needsDeleted || op === 'hard-delete' });
      if (!profile) return res.status(404).json({ error: 'not_found' });
      const body = req.body || {};

      const { data: teacherUser } = await supabaseAdmin
        .from('users')
        .select('id, institution_id')
        .eq('id', profile.user_id)
        .maybeSingle();
      const teacherInstitutionId = teacherUser?.institution_id || null;

      if (op === 'retry-sync') {
        const result = await pushSiteSync(profile, 'teacher_profile_upsert');
        const fresh = await loadProfile(id);
        return res.status(200).json({ profile: fresh, sync: result });
      }

      if (op === 'enable-editing') {
        const now = new Date().toISOString();
        const deadlineRaw = body.editing_deadline;
        const patch = {
          editing_enabled: true,
          editing_enabled_at: now,
          editing_enabled_by: actor.sub,
          updated_at: now
        };
        if (deadlineRaw !== undefined) {
          patch.editing_deadline = deadlineRaw ? new Date(deadlineRaw).toISOString() : null;
        }
        const { data: updated, error } = await supabaseAdmin
          .from('teacher_profiles')
          .update(patch)
          .eq('id', id)
          .select('*')
          .single();
        if (error) throw error;
        await writeAuditLog({
          profileId: id,
          actorUserId: actor.sub,
          action: 'enable_editing',
          previousValue: {
            editing_enabled: profile.editing_enabled,
            editing_deadline: profile.editing_deadline
          },
          newValue: {
            editing_enabled: true,
            editing_deadline: updated.editing_deadline
          },
          ip: clientIp(req)
        });
        await notifyTeacherProfileEvent({
          event: 'editing_enabled',
          targetUserId: profile.user_id,
          senderUserId: actor.sub,
          institutionId: teacherInstitutionId,
          extraBody: updated.editing_deadline
            ? `Son tarih: ${updated.editing_deadline}`
            : ''
        });
        return res.status(200).json({ profile: updated });
      }

      if (op === 'deactivate') {
        const reason = String(body.passivation_reason || body.reason || '').trim() || null;
        const now = new Date().toISOString();
        const { data: updated, error } = await supabaseAdmin
          .from('teacher_profiles')
          .update({
            status: 'passive',
            is_active: false,
            passivated_at: now,
            passivated_by: actor.sub,
            passivation_reason: reason,
            updated_at: now
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
          newValue: { status: 'passive', passivation_reason: reason },
          ip: clientIp(req)
        });
        await pushSiteSync(updated, 'teacher_profile_deactivate');
        await notifyTeacherProfileEvent({
          event: 'passive',
          targetUserId: profile.user_id,
          senderUserId: actor.sub,
          institutionId: teacherInstitutionId,
          extraBody: reason || ''
        });
        return res.status(200).json({ profile: updated });
      }

      if (op === 'activate' || op === 'republish') {
        const canPublish = profile.published_snapshot && Object.keys(profile.published_snapshot).length;
        const now = new Date().toISOString();
        const { data: updated, error } = await supabaseAdmin
          .from('teacher_profiles')
          .update({
            status: canPublish ? 'published' : profile.completion_pct >= 100 ? 'draft' : 'incomplete',
            is_active: true,
            passivated_at: null,
            passivated_by: null,
            passivation_reason: null,
            updated_at: now
          })
          .eq('id', id)
          .select('*')
          .single();
        if (error) throw error;
        await writeAuditLog({
          profileId: id,
          actorUserId: actor.sub,
          action: op === 'republish' ? 'republish' : 'activate',
          previousValue: { status: profile.status },
          newValue: { status: updated.status },
          ip: clientIp(req)
        });
        if (updated.status === 'published') {
          await pushSiteSync(updated, 'teacher_profile_upsert');
          await notifyTeacherProfileEvent({
            event: 'republished',
            targetUserId: profile.user_id,
            senderUserId: actor.sub,
            institutionId: teacherInstitutionId
          });
        }
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
        const now = new Date().toISOString();
        const { data: updated, error } = await supabaseAdmin
          .from('teacher_profiles')
          .update({
            status: nextStatus,
            rejection_reason: reason,
            rejected_at: now,
            rejected_by: actor.sub,
            updated_at: now
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
        await notifyTeacherProfileEvent({
          event: 'rejected',
          targetUserId: profile.user_id,
          senderUserId: actor.sub,
          institutionId: teacherInstitutionId,
          extraBody: reason
        });
        return res.status(200).json({ profile: updated });
      }

      if (op === 'approve') {
        let snapshot = workingPayloadFromRow(profile);
        if (profile.pending_data && typeof profile.pending_data === 'object') {
          snapshot = { ...snapshot, ...profile.pending_data };
        }
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

        const wasUpdatePending = isUpdatePendingStatus(profile.status);

        const missing = missingRequiredFields(snapshot);
        if (missing.length) {
          return res.status(400).json({ error: 'profile_incomplete', missing_required: missing });
        }

        const now = new Date().toISOString();
        const { data: updated, error } = await supabaseAdmin
          .from('teacher_profiles')
          .update({
            ...snapshot,
            published_snapshot: snapshot,
            pending_data: null,
            status: 'published',
            is_active: true,
            private_lesson_enabled: snapshot.private_lesson_enabled !== false,
            completion_pct: 100,
            rejection_reason: null,
            editing_enabled: false,
            approved_at: now,
            approved_by: actor.sub,
            updated_at: now
          })
          .eq('id', id)
          .select('*')
          .single();
        if (error) throw error;

        await writeAuditLog({
          profileId: id,
          actorUserId: actor.sub,
          action: 'approve',
          previousValue: { status: profile.status, update_pending: wasUpdatePending },
          newValue: { status: 'published', slug: updated.slug },
          ip: clientIp(req)
        });

        const sync = await pushSiteSync(updated, 'teacher_profile_upsert');
        await notifyTeacherProfileEvent({
          event: 'approved',
          targetUserId: profile.user_id,
          senderUserId: actor.sub,
          institutionId: teacherInstitutionId
        });
        return res.status(200).json({ profile: updated, sync });
      }

      if (op === 'soft-delete') {
        if (profile.deleted_at || profile.status === 'deleted') {
          return res.status(400).json({ error: 'already_deleted' });
        }
        const now = new Date().toISOString();
        const { data: updated, error } = await supabaseAdmin
          .from('teacher_profiles')
          .update({
            status: 'deleted',
            deleted_at: now,
            deleted_by: actor.sub,
            is_active: false,
            updated_at: now
          })
          .eq('id', id)
          .select('*')
          .single();
        if (error) throw error;
        await writeAuditLog({
          profileId: id,
          actorUserId: actor.sub,
          action: 'soft_delete',
          previousValue: { status: profile.status },
          newValue: { status: 'deleted' },
          ip: clientIp(req)
        });
        await pushSiteSync(updated, 'teacher_profile_deactivate');
        await notifyTeacherProfileEvent({
          event: 'deleted',
          targetUserId: profile.user_id,
          senderUserId: actor.sub,
          institutionId: teacherInstitutionId
        });
        return res.status(200).json({ profile: updated });
      }

      if (op === 'restore') {
        if (!profile.deleted_at && profile.status !== 'deleted') {
          return res.status(400).json({ error: 'not_deleted' });
        }
        const now = new Date().toISOString();
        const { data: updated, error } = await supabaseAdmin
          .from('teacher_profiles')
          .update({
            status: 'passive',
            deleted_at: null,
            deleted_by: null,
            is_active: false,
            updated_at: now
          })
          .eq('id', id)
          .select('*')
          .single();
        if (error) throw error;
        await writeAuditLog({
          profileId: id,
          actorUserId: actor.sub,
          action: 'restore',
          previousValue: { status: profile.status, deleted_at: profile.deleted_at },
          newValue: { status: 'passive' },
          ip: clientIp(req)
        });
        await notifyTeacherProfileEvent({
          event: 'restored',
          targetUserId: profile.user_id,
          senderUserId: actor.sub,
          institutionId: teacherInstitutionId
        });
        return res.status(200).json({ profile: updated });
      }

      if (op === 'hard-delete') {
        if (!(await isSuperAdminActor(actor))) {
          return res.status(403).json({ error: 'super_admin_required' });
        }
        const { count: bookingCount, error: bErr } = await supabaseAdmin
          .from('teacher_private_bookings')
          .select('id', { count: 'exact', head: true })
          .or(`profile_id.eq.${id},teacher_id.eq.${profile.user_id}`);
        if (bErr) throw bErr;
        if (bookingCount && bookingCount > 0) {
          return res.status(409).json({
            error: 'bookings_exist',
            message: 'Profil hard-delete engellendi: teacher_private_bookings kaydı var'
          });
        }
        await writeAuditLog({
          profileId: id,
          actorUserId: actor.sub,
          action: 'hard_delete',
          previousValue: { status: profile.status, user_id: profile.user_id, slug: profile.slug },
          newValue: { deleted: true },
          ip: clientIp(req)
        });
        const { error: delErr } = await supabaseAdmin
          .from('teacher_profiles')
          .delete()
          .eq('id', id);
        if (delErr) throw delErr;
        return res.status(200).json({ ok: true, deleted_id: id });
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
