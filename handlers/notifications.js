import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  canRoleSendNotifications,
  validateCreateNotificationPayload,
  notificationMatchesRecipient
} from '../api/_lib/platform-notifications.js';
import { normalizedUserRolesFromDb } from '../api/_lib/user-roles-fetch.js';
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

function getNotificationIdFromReq(req) {
  const qid = req.query?.id;
  if (qid !== undefined && qid !== null && String(qid).trim()) {
    return String(Array.isArray(qid) ? qid[0] : qid).trim();
  }
  const extra = req.apiExtraSegments;
  if (Array.isArray(extra) && extra[0]) return String(extra[0]).trim();
  if (typeof req.url === 'string') {
    try {
      const pathOnly = req.url.split('?')[0] || '';
      const tail = pathOnly.replace(/^.*\/api\/notifications\/?/i, '').replace(/^\/+|\/+$/g, '');
      if (tail) return tail.split('/').filter(Boolean)[0] || '';
    } catch {
      /* ignore */
    }
  }
  return '';
}

async function loadActorUserRow(actor) {
  const { data } = await supabaseAdmin
    .from('users')
    .select('id, role, institution_id, name, email')
    .eq('id', actor.sub)
    .maybeSingle();
  return data;
}

/** JWT + users + students — kurum ve rol eşleşmesi için */
async function loadRecipientContext(actor) {
  const primaryRole = String(actor.role || '').trim();
  const { data: u } = await supabaseAdmin
    .from('users')
    .select('id, role, institution_id')
    .eq('id', actor.sub)
    .maybeSingle();

  const roles = new Set(await normalizedUserRolesFromDb(actor.sub));
  if (primaryRole) roles.add(primaryRole);
  if (u?.role) roles.add(String(u.role).trim());

  let institutionId = u?.institution_id || actor.institution_id || null;
  const altUserIds = new Set();

  const studentId = actor.student_id ? String(actor.student_id).trim() : '';
  if (studentId) altUserIds.add(studentId);

  let stQuery = supabaseAdmin.from('students').select('id, institution_id, user_id, platform_user_id');

  if (studentId) {
    stQuery = stQuery.eq('id', studentId);
  } else {
    stQuery = stQuery.or(`user_id.eq.${actor.sub},platform_user_id.eq.${actor.sub}`);
  }

  const { data: st } = await stQuery.maybeSingle();
  if (st) {
    if (st.id) altUserIds.add(String(st.id));
    if (st.user_id) altUserIds.add(String(st.user_id));
    if (st.platform_user_id) altUserIds.add(String(st.platform_user_id));
    if (st.institution_id) institutionId = st.institution_id;
    roles.add('student');
  }

  return {
    userId: actor.sub,
    role: primaryRole || (u?.role ? String(u.role) : 'student'),
    roles: [...roles],
    institutionId: institutionId ? String(institutionId) : null,
    altUserIds: [...altUserIds],
    coachId: actor.coach_id || null
  };
}

async function coachStudentUserIds(coachId) {
  if (!coachId) return new Set();
  const { data: sts } = await supabaseAdmin
    .from('students')
    .select('user_id, platform_user_id')
    .eq('coach_id', coachId);
  const ids = new Set();
  for (const s of sts || []) {
    if (s.user_id) ids.add(String(s.user_id));
    if (s.platform_user_id) ids.add(String(s.platform_user_id));
  }
  return ids;
}

async function assertCoachCanTargetUser(actor, targetUserId) {
  const coachId = actor.coach_id;
  if (!coachId) return 'coach_profile_missing';
  const allowed = await coachStudentUserIds(coachId);
  if (!allowed.has(String(targetUserId))) return 'not_your_student';
  return null;
}

async function assertAdminCanTargetUser(actor, targetUserId) {
  const inst = actor.institution_id ? String(actor.institution_id) : '';
  if (!inst) return 'institution_required';
  const { data: u } = await supabaseAdmin
    .from('users')
    .select('institution_id, role')
    .eq('id', targetUserId)
    .maybeSingle();
  if (!u) return 'user_not_found';
  if (String(u.role || '') === 'super_admin') return 'forbidden_target_user';
  if (String(u.institution_id || '') !== inst) return 'institution_mismatch';
  return null;
}

function isNotificationsSchemaError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  const code = String(error?.code || '');
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    code === '22P02' ||
    msg.includes('invalid input syntax for type uuid') ||
    (msg.includes('platform_notification') &&
      (msg.includes('does not exist') ||
        msg.includes('schema cache') ||
        msg.includes('could not find')))
  );
}

function schemaMissingResponse(res, { forWrite = false } = {}) {
  const body = {
    warning: 'notifications_schema_missing',
    hint:
      'Supabase SQL Editor: sql/2026-05-36-platform-notifications.sql ve ardından sql/2026-05-36b-platform-notifications-text-ids.sql (users.id TEXT uyumu).',
    data: [],
    unread_count: 0
  };
  if (forWrite) {
    body.error = 'notifications_schema_missing';
  }
  return res.status(forWrite ? 503 : 200).json(body);
}

async function senderCanManageNotification(actor, role, note) {
  const tags = await normalizedUserRolesFromDb(actor.sub);
  const roleSet = new Set(tags.map((r) => String(r || '').trim().toLowerCase()));
  const primary = String(role || '').trim().toLowerCase();
  if (primary) roleSet.add(primary);

  const canSend = [...roleSet].some((r) => canRoleSendNotifications(r));
  if (!canSend) return false;

  if (String(note.sender_user_id) === String(actor.sub)) return true;
  if (roleSet.has('super_admin')) return true;

  if (roleSet.has('admin')) {
    let inst = actor.institution_id ? String(actor.institution_id) : '';
    if (!inst) {
      const { data: u } = await supabaseAdmin
        .from('users')
        .select('institution_id')
        .eq('id', actor.sub)
        .maybeSingle();
      inst = u?.institution_id ? String(u.institution_id) : '';
    }
    return Boolean(inst && String(note.institution_id || '') === inst);
  }
  return false;
}

function buildNotificationUpdatePatch(body) {
  const patch = {};
  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) return { error: 'title_required' };
    if (title.length > 200) return { error: 'title_too_long' };
    patch.title = title;
  }
  if (body.body !== undefined) {
    const text = String(body.body).trim();
    if (!text) return { error: 'body_required' };
    if (text.length > 4000) return { error: 'body_too_long' };
    patch.body = text;
  }
  if (body.priority !== undefined) {
    const p = String(body.priority).trim();
    if (!['low', 'normal', 'high'].includes(p)) return { error: 'invalid_priority' };
    patch.priority = p;
  }
  if (body.link_url !== undefined) {
    patch.link_url = body.link_url ? String(body.link_url).trim() || null : null;
  }
  if (!Object.keys(patch).length) return { error: 'nothing_to_update' };
  return { patch };
}

async function enrichWithReadState(rows, userId) {
  if (!rows.length) return [];
  const uid = String(userId || '').trim();
  if (!uid) return rows.map((r) => ({ ...r, read_at: null }));
  const ids = rows.map((r) => r.id);
  const { data: reads, error } = await supabaseAdmin
    .from('platform_notification_reads')
    .select('notification_id, read_at')
    .eq('user_id', uid)
    .in('notification_id', ids);
  if (error) {
    if (isNotificationsSchemaError(error)) {
      return rows.map((r) => ({ ...r, read_at: null }));
    }
    throw error;
  }
  const readMap = new Map((reads || []).map((r) => [r.notification_id, r.read_at]));
  return rows.map((r) => ({
    ...r,
    read_at: readMap.get(r.id) || null
  }));
}

export default async function handler(req, res) {
  try {
    const actor = requireAuthenticatedActor(req);
    const role = String(actor.role || '').trim();
    const notificationId = getNotificationIdFromReq(req);

    if (notificationId) {
      if (req.method === 'PATCH') {
        const body = parseBody(req);
        const markRead = body?.mark_read === true || body?.action === 'mark_read';

        const { data: note } = await supabaseAdmin
          .from('platform_notifications')
          .select('*')
          .eq('id', notificationId)
          .maybeSingle();
        if (!note) return res.status(404).json({ error: 'not_found' });

        if (markRead) {
          const recipient = await loadRecipientContext(actor);
          if (!notificationMatchesRecipient(note, recipient)) {
            return res.status(403).json({ error: 'forbidden' });
          }

          const { error } = await supabaseAdmin.from('platform_notification_reads').upsert(
            {
              notification_id: notificationId,
              user_id: actor.sub,
              read_at: new Date().toISOString()
            },
            { onConflict: 'notification_id,user_id' }
          );
          if (error) throw error;
          return res.status(200).json({ ok: true });
        }

        if (!(await senderCanManageNotification(actor, role, note))) {
          return res.status(403).json({ error: 'forbidden' });
        }

        const built = buildNotificationUpdatePatch(body);
        if (built.error) return res.status(400).json({ error: built.error });

        const { data, error } = await supabaseAdmin
          .from('platform_notifications')
          .update(built.patch)
          .eq('id', notificationId)
          .select()
          .single();
        if (error) {
          if (isNotificationsSchemaError(error)) {
            return schemaMissingResponse(res, { forWrite: true });
          }
          throw error;
        }
        return res.status(200).json({ data });
      }

      if (req.method === 'DELETE') {
        const { data: note } = await supabaseAdmin
          .from('platform_notifications')
          .select('sender_user_id, institution_id')
          .eq('id', notificationId)
          .maybeSingle();
        if (!note) return res.status(404).json({ error: 'not_found' });
        if (!(await senderCanManageNotification(actor, role, note))) {
          return res.status(403).json({ error: 'forbidden' });
        }
        const { error: delErr } = await supabaseAdmin
          .from('platform_notifications')
          .delete()
          .eq('id', notificationId);
        if (delErr) {
          if (isNotificationsSchemaError(delErr)) {
            return schemaMissingResponse(res, { forWrite: true });
          }
          throw delErr;
        }
        return res.status(200).json({ ok: true });
      }

      return res.status(405).json({ error: 'method_not_allowed' });
    }

    if (req.method === 'GET') {
      const scope = String(req.query?.scope || 'inbox').trim();
      const limit = Math.min(Number(req.query?.limit) || 80, 120);

      if (scope === 'sent' && canRoleSendNotifications(role)) {
        let q = supabaseAdmin
          .from('platform_notifications')
          .select('*')
          .eq('sender_user_id', actor.sub)
          .order('created_at', { ascending: false })
          .limit(limit);
        if (role === 'admin' && actor.institution_id) {
          q = q.eq('institution_id', actor.institution_id);
        }
        const { data, error } = await q;
        if (error) {
          if (isNotificationsSchemaError(error)) return schemaMissingResponse(res, { forWrite: false });
          throw error;
        }
        return res.status(200).json({ data: data || [] });
      }

      const recipient = await loadRecipientContext(actor);

      const { data, error } = await supabaseAdmin
        .from('platform_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(250);

      if (error) {
        if (isNotificationsSchemaError(error)) return schemaMissingResponse(res, { forWrite: false });
        return res.status(500).json({
          error: error.message,
          code: error.code,
          hint: 'Supabase: sql/2026-05-36b-platform-notifications-text-ids.sql (users.id TEXT)'
        });
      }

      let rows = (data || []).filter((n) => notificationMatchesRecipient(n, recipient));

      if (role === 'coach' || recipient.roles.includes('coach')) {
        const coachId = actor.coach_id || recipient.coachId;
        const studentIds = await coachStudentUserIds(coachId);
        rows = rows.filter((n) => {
          if (n.target_type === 'user') {
            const tid = String(n.target_user_id || '');
            return studentIds.has(tid) || recipient.altUserIds.includes(tid);
          }
          if (n.target_type === 'role' && n.target_role === 'student') {
            return true;
          }
          return false;
        });
      }

      rows = await enrichWithReadState(rows.slice(0, limit), actor.sub);
      const unreadCount = rows.filter((r) => !r.read_at).length;
      return res.status(200).json({ data: rows, unread_count: unreadCount });
    }

    if (req.method === 'POST') {
      if (!canRoleSendNotifications(role)) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const body = parseBody(req);
      const userRow = await loadActorUserRow(actor);
      const senderInstitutionId = actor.institution_id || userRow?.institution_id || null;

      const validationErr = validateCreateNotificationPayload(role, senderInstitutionId, body);
      if (validationErr) {
        return res.status(400).json({ error: validationErr });
      }

      const targetType = String(body.target_type).trim();
      const targetUserId = body.target_user_id ? String(body.target_user_id).trim() : null;

      if (role === 'coach' && targetType === 'user' && targetUserId) {
        const coachErr = await assertCoachCanTargetUser(actor, targetUserId);
        if (coachErr) return res.status(403).json({ error: coachErr });
      }

      if (role === 'admin' && targetType === 'user' && targetUserId) {
        const adminErr = await assertAdminCanTargetUser(
          { ...actor, institution_id: senderInstitutionId },
          targetUserId
        );
        if (adminErr) return res.status(403).json({ error: adminErr });
      }

      let institutionId = senderInstitutionId;
      if (body.target_institution_id && role === 'super_admin') {
        institutionId = String(body.target_institution_id).trim() || institutionId;
      }

      const insertRow = {
        sender_user_id: actor.sub,
        sender_role: role,
        sender_name: userRow?.name || userRow?.email || null,
        institution_id: institutionId,
        title: String(body.title).trim(),
        body: String(body.body).trim(),
        target_type: targetType,
        target_role: body.target_role ? String(body.target_role).trim() : null,
        target_user_id: targetUserId,
        target_institution_id:
          targetType === 'broadcast' || targetType === 'role'
            ? institutionId
            : null,
        priority: ['low', 'normal', 'high'].includes(String(body.priority))
          ? String(body.priority)
          : 'normal',
        link_url: body.link_url ? String(body.link_url).trim() || null : null
      };

      const { data, error } = await supabaseAdmin
        .from('platform_notifications')
        .insert(insertRow)
        .select()
        .single();
      if (error) {
        if (isNotificationsSchemaError(error)) {
          return schemaMissingResponse(res, { forWrite: true });
        }
        throw error;
      }
      return res.status(201).json({ data });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    const msg = errorMessage(e);
    if (msg === 'Missing token' || msg === 'Token expired' || msg === 'Invalid token') {
      return res.status(401).json({ error: msg });
    }
    if (isNotificationsSchemaError(e)) {
      return schemaMissingResponse(res, { forWrite: req.method !== 'GET' });
    }
    const pgCode = e && typeof e === 'object' && 'code' in e ? String(e.code) : undefined;
    return res.status(500).json({
      error: msg,
      ...(pgCode ? { code: pgCode } : {}),
      hint: 'Supabase: sql/2026-05-36b-platform-notifications-text-ids.sql (users.id TEXT)'
    });
  }
}
