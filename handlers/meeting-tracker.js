/**
 * Toplantı ve Gündem Takip API
 * GET/POST/PATCH/DELETE /api/meeting-tracker?op=...
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { parseAgendaPasteText } from '../api/_lib/meeting-agenda-parse.js';

const PLATFORM_PRIMARY_INSTITUTION_ID = '73323d75-eea1-4552-8bba-d50555423589';

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

function roleOf(actor) {
  return String(actor?.role || '').trim().toLowerCase();
}

async function loadRoleTags(userId) {
  if (!userId) return [];
  try {
    const { data } = await supabaseAdmin.from('users').select('role, roles').eq('id', userId).maybeSingle();
    const tags = new Set();
    const r = String(data?.role || '').toLowerCase();
    if (r) tags.add(r);
    if (Array.isArray(data?.roles)) {
      for (const x of data.roles) {
        const t = String(x || '').toLowerCase();
        if (t) tags.add(t);
      }
    }
    return [...tags];
  } catch {
    return [];
  }
}

async function resolveInstitutionId(actor) {
  if (actor.institution_id) return String(actor.institution_id);
  const { data: u } = await supabaseAdmin
    .from('users')
    .select('institution_id')
    .eq('id', actor.sub)
    .maybeSingle();
  if (u?.institution_id) return String(u.institution_id);
  if (roleOf(actor) === 'super_admin') return PLATFORM_PRIMARY_INSTITUTION_ID;
  return null;
}

async function logActivity({
  institutionId,
  meetingId,
  entityType,
  entityId,
  action,
  actorUserId,
  oldValue,
  newValue
}) {
  try {
    await supabaseAdmin.from('mt_activity_logs').insert({
      institution_id: institutionId,
      meeting_id: meetingId || null,
      entity_type: entityType,
      entity_id: String(entityId),
      action,
      actor_user_id: actorUserId || null,
      old_value: oldValue ?? null,
      new_value: newValue ?? null
    });
  } catch {
    /* audit best-effort */
  }
}

async function notifyUser({ title, body, targetUserId, linkUrl, senderId, institutionId, senderRole }) {
  if (!targetUserId) return;
  try {
    await supabaseAdmin.from('platform_notifications').insert({
      title: String(title).slice(0, 200),
      body: String(body).slice(0, 4000),
      target_type: 'user',
      target_user_id: targetUserId,
      sender_user_id: senderId || 'system',
      sender_role: senderRole || 'admin',
      institution_id: institutionId || null,
      priority: 'normal',
      link_url: linkUrl || null
    });
  } catch {
    /* optional */
  }
}

async function ensureDefaultTypes() {
  const defaults = [
    ['yonetim_kurulu', 'Yönetim Kurulu Toplantısı', 'admin', true, 10],
    ['rehberlik_koc', 'Rehberlik/Koç Toplantısı', 'coach', false, 20],
    ['ogretmen', 'Öğretmen Toplantısı', 'teacher', false, 30]
  ];
  for (const [code, name, audience, isBoard, sort] of defaults) {
    const { data } = await supabaseAdmin
      .from('mt_meeting_types')
      .select('id')
      .is('institution_id', null)
      .eq('code', code)
      .maybeSingle();
    if (!data) {
      await supabaseAdmin.from('mt_meeting_types').insert({
        institution_id: null,
        code,
        name,
        audience_role: audience,
        is_board: isBoard,
        sort_order: sort,
        is_active: true
      });
    }
  }
}

async function listTypesForActor(actor, institutionId) {
  await ensureDefaultTypes();
  const { data, error } = await supabaseAdmin
    .from('mt_meeting_types')
    .select('*')
    .eq('is_active', true)
    .or(`institution_id.is.null,institution_id.eq.${institutionId}`)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  const role = roleOf(actor);
  const tags = await loadRoleTags(actor.sub);
  return (data || []).filter((t) => {
    if (t.is_board) return role === 'super_admin';
    if (role === 'super_admin' || role === 'admin') return true;
    if (tags.includes('coach') || role === 'coach') {
      return t.audience_role === 'coach' || t.code === 'rehberlik_koc';
    }
    if (tags.includes('teacher') || role === 'teacher') {
      return t.audience_role === 'teacher' || t.code === 'ogretmen';
    }
    return false;
  });
}

async function getMeetingType(typeId) {
  const { data, error } = await supabaseAdmin
    .from('mt_meeting_types')
    .select('*')
    .eq('id', typeId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function canManageType(actor, typeRow, roleTags) {
  const role = roleOf(actor);
  if (!typeRow) return false;
  if (typeRow.is_board) return role === 'super_admin';
  if (role === 'super_admin') return true;
  if (role === 'admin') return !typeRow.is_board;
  return false;
}

async function userCanSeeMeeting(actor, meeting, typeRow, roleTags) {
  const role = roleOf(actor);
  if (!meeting || meeting.archived_at) return false;
  if (typeRow?.is_board && role !== 'super_admin') return false;
  if (role === 'super_admin') return true;
  if (role === 'admin') return !typeRow?.is_board;

  const isCoach = role === 'coach' || roleTags.includes('coach');
  const isTeacher = role === 'teacher' || roleTags.includes('teacher');

  if (isCoach && (typeRow?.audience_role === 'coach' || typeRow?.code === 'rehberlik_koc')) {
    if (meeting.open_to_role) return true;
    const { data } = await supabaseAdmin
      .from('mt_meeting_participants')
      .select('id')
      .eq('meeting_id', meeting.id)
      .eq('user_id', actor.sub)
      .maybeSingle();
    return Boolean(data);
  }
  if (isTeacher && (typeRow?.audience_role === 'teacher' || typeRow?.code === 'ogretmen')) {
    if (meeting.open_to_role) return true;
    const { data } = await supabaseAdmin
      .from('mt_meeting_participants')
      .select('id')
      .eq('meeting_id', meeting.id)
      .eq('user_id', actor.sub)
      .maybeSingle();
    return Boolean(data);
  }
  return false;
}

async function markOverdueTasks(institutionId, notifySenderId) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: dueRows } = await supabaseAdmin
    .from('mt_tasks')
    .select('id, title, meeting_id')
    .eq('institution_id', institutionId)
    .lt('due_date', today)
    .in('status', ['todo', 'in_progress', 'deferred']);
  if (!dueRows?.length) return;
  const ids = dueRows.map((t) => t.id);
  await supabaseAdmin
    .from('mt_tasks')
    .update({ status: 'overdue', updated_at: new Date().toISOString() })
    .in('id', ids);
  const { data: assignees } = await supabaseAdmin
    .from('mt_task_assignees')
    .select('task_id, user_id')
    .in('task_id', ids);
  for (const row of dueRows) {
    const uids = (assignees || []).filter((a) => a.task_id === row.id).map((a) => a.user_id);
    for (const uid of uids) {
      await notifyUser({
        title: 'Görev gecikti',
        body: `"${row.title}" son tarihi geçti.`,
        targetUserId: uid,
        linkUrl: `/toplantilarim?id=${row.meeting_id}`,
        senderId: notifySenderId || 'system',
        institutionId,
        senderRole: 'admin'
      });
    }
  }
}

async function loadMeetingBundle(meetingId) {
  const { data: meeting, error } = await supabaseAdmin
    .from('mt_meetings')
    .select('*')
    .eq('id', meetingId)
    .maybeSingle();
  if (error) throw error;
  if (!meeting) return null;
  const typeRow = await getMeetingType(meeting.meeting_type_id);
  const [
    { data: participants },
    { data: agenda },
    { data: decisions },
    { data: tasks },
    { data: notes },
    { data: attachments },
    { data: logs }
  ] = await Promise.all([
    supabaseAdmin.from('mt_meeting_participants').select('*').eq('meeting_id', meetingId),
    supabaseAdmin.from('mt_agenda_items').select('*').eq('meeting_id', meetingId).order('sort_order'),
    supabaseAdmin.from('mt_decisions').select('*').eq('meeting_id', meetingId).order('created_at'),
    supabaseAdmin.from('mt_tasks').select('*').eq('meeting_id', meetingId).order('created_at'),
    supabaseAdmin.from('mt_meeting_notes').select('*').eq('meeting_id', meetingId).order('created_at', { ascending: false }),
    supabaseAdmin.from('mt_attachments').select('*').eq('meeting_id', meetingId),
    supabaseAdmin
      .from('mt_activity_logs')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: false })
      .limit(200)
  ]);
  const taskIds = (tasks || []).map((t) => t.id);
  let assignees = [];
  if (taskIds.length) {
    const { data } = await supabaseAdmin.from('mt_task_assignees').select('*').in('task_id', taskIds);
    assignees = data || [];
  }
  return {
    meeting,
    type: typeRow,
    participants: participants || [],
    agenda: agenda || [],
    decisions: decisions || [],
    tasks: (tasks || []).map((t) => ({
      ...t,
      assignees: assignees.filter((a) => a.task_id === t.id)
    })),
    notes: notes || [],
    attachments: attachments || [],
    activity: logs || []
  };
}

export default async function handler(req, res) {
  let actor;
  try {
    actor = await requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const role = roleOf(actor);
  const roleTags = await loadRoleTags(actor.sub);
  const institutionId = await resolveInstitutionId(actor);
  if (!institutionId) return res.status(400).json({ error: 'institution_required' });

  const op = String(req.query?.op || req.query?.scope || '').trim();
  const body = parseBody(req);

  try {
    if (req.method === 'GET' && (op === 'types' || !op)) {
      if (op === 'types' || op === '') {
        /* fall through for types when op=types; dashboard when empty uses dashboard below */
      }
    }

    if (req.method === 'GET' && op === 'types') {
      const types = await listTypesForActor(actor, institutionId);
      return res.status(200).json({ data: types });
    }

    if (req.method === 'POST' && op === 'parse-agenda') {
      const items = parseAgendaPasteText(body.text || body.raw || '');
      return res.status(200).json({ data: items });
    }

    if (req.method === 'GET' && (op === 'dashboard' || op === 'summary')) {
      await markOverdueTasks(institutionId, actor.sub);
      const types = await listTypesForActor(actor, institutionId);
      const typeIds = types.map((t) => t.id);
      if (!typeIds.length) {
        return res.status(200).json({
          data: {
            upcoming: [],
            this_month: 0,
            open_tasks: 0,
            overdue_tasks: 0,
            done_tasks: 0,
            deferred_agenda: 0,
            tasks: [],
            meetings: []
          }
        });
      }

      const today = new Date().toISOString().slice(0, 10);
      const monthStart = `${today.slice(0, 7)}-01`;

      let meetingsQ = supabaseAdmin
        .from('mt_meetings')
        .select('*, mt_meeting_types(*)')
        .eq('institution_id', institutionId)
        .is('archived_at', null)
        .in('meeting_type_id', typeIds)
        .order('meeting_date', { ascending: false })
        .limit(100);
      const { data: meetingsRaw, error: mErr } = await meetingsQ;
      if (mErr) throw mErr;

      const visible = [];
      for (const m of meetingsRaw || []) {
        const typeRow = m.mt_meeting_types || (await getMeetingType(m.meeting_type_id));
        if (await userCanSeeMeeting(actor, m, typeRow, roleTags)) {
          visible.push({ ...m, type: typeRow });
        }
      }

      const meetingIds = visible.map((m) => m.id);
      let tasks = [];
      if (meetingIds.length) {
        const { data: taskRows } = await supabaseAdmin
          .from('mt_tasks')
          .select('*, mt_task_assignees(user_id)')
          .in('meeting_id', meetingIds)
          .order('due_date', { ascending: true })
          .limit(300);
        tasks = taskRows || [];
        if (role === 'coach' || role === 'teacher' || roleTags.includes('coach') || roleTags.includes('teacher')) {
          if (role !== 'super_admin' && role !== 'admin') {
            tasks = tasks.filter((t) =>
              (t.mt_task_assignees || []).some((a) => String(a.user_id) === String(actor.sub))
            );
          }
        }
      }

      const upcoming = visible.filter(
        (m) => m.meeting_date >= today && ['draft', 'planned'].includes(m.status)
      );
      const thisMonth = visible.filter((m) => m.meeting_date >= monthStart && m.status === 'held').length;
      const openTasks = tasks.filter((t) => ['todo', 'in_progress', 'deferred'].includes(t.status)).length;
      const overdueTasks = tasks.filter((t) => t.status === 'overdue').length;
      const doneTasks = tasks.filter((t) => t.status === 'done').length;

      let deferredAgenda = 0;
      if (meetingIds.length) {
        const { count } = await supabaseAdmin
          .from('mt_agenda_items')
          .select('id', { count: 'exact', head: true })
          .in('meeting_id', meetingIds)
          .eq('status', 'deferred');
        deferredAgenda = count || 0;
      }

      return res.status(200).json({
        data: {
          upcoming: upcoming.slice(0, 10),
          this_month: thisMonth,
          open_tasks: openTasks,
          overdue_tasks: overdueTasks,
          done_tasks: doneTasks,
          deferred_agenda: deferredAgenda,
          tasks,
          meetings: visible.slice(0, 50)
        }
      });
    }

    if (req.method === 'GET' && op === 'meeting') {
      const id = String(req.query.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id_required' });
      await markOverdueTasks(institutionId, actor.sub);
      const bundle = await loadMeetingBundle(id);
      if (!bundle) return res.status(404).json({ error: 'not_found' });
      if (bundle.meeting.institution_id !== institutionId && role !== 'super_admin') {
        return res.status(403).json({ error: 'forbidden' });
      }
      if (!(await userCanSeeMeeting(actor, bundle.meeting, bundle.type, roleTags))) {
        return res.status(403).json({ error: 'forbidden' });
      }
      return res.status(200).json({ data: bundle });
    }

    if (req.method === 'GET' && op === 'reports') {
      if (role !== 'super_admin' && role !== 'admin') {
        return res.status(403).json({ error: 'forbidden' });
      }
      await markOverdueTasks(institutionId, actor.sub);
      const types = await listTypesForActor(actor, institutionId);
      const typeIds = types.map((t) => t.id);
      const { data: meetings } = await supabaseAdmin
        .from('mt_meetings')
        .select('id, status, meeting_type_id, meeting_date')
        .eq('institution_id', institutionId)
        .is('archived_at', null)
        .in('meeting_type_id', typeIds);
      const { data: tasks } = await supabaseAdmin
        .from('mt_tasks')
        .select('id, status, meeting_id, mt_task_assignees(user_id)')
        .eq('institution_id', institutionId);
      const byType = {};
      for (const t of types) {
        byType[t.code] = { name: t.name, planned: 0, held: 0, total: 0 };
      }
      for (const m of meetings || []) {
        const t = types.find((x) => x.id === m.meeting_type_id);
        if (!t) continue;
        byType[t.code].total += 1;
        if (m.status === 'planned' || m.status === 'draft') byType[t.code].planned += 1;
        if (m.status === 'held' || m.status === 'closed') byType[t.code].held += 1;
      }
      const open = (tasks || []).filter((t) => ['todo', 'in_progress', 'deferred', 'overdue'].includes(t.status)).length;
      const done = (tasks || []).filter((t) => t.status === 'done').length;
      const overdue = (tasks || []).filter((t) => t.status === 'overdue').length;
      return res.status(200).json({
        data: {
          by_type: byType,
          open_tasks: open,
          done_tasks: done,
          overdue_tasks: overdue,
          meeting_count: (meetings || []).length
        }
      });
    }

    if (req.method === 'GET' && op === 'templates') {
      if (role !== 'super_admin' && role !== 'admin') {
        return res.status(403).json({ error: 'forbidden' });
      }
      const { data, error } = await supabaseAdmin
        .from('mt_meeting_templates')
        .select('*')
        .eq('institution_id', institutionId)
        .order('name');
      if (error) throw error;
      return res.status(200).json({ data: data || [] });
    }

    if (req.method === 'GET' && op === 'users') {
      if (role !== 'super_admin' && role !== 'admin') {
        return res.status(403).json({ error: 'forbidden' });
      }
      let q = supabaseAdmin.from('users').select('id, name, email, role, roles').order('name').limit(500);
      if (role === 'admin') q = q.eq('institution_id', institutionId);
      const { data, error } = await q;
      if (error) throw error;
      const STAFF = new Set(['super_admin', 'admin', 'coach', 'teacher']);
      const staff = (data || []).filter((u) => {
        const r = String(u.role || '').toLowerCase();
        const tags = Array.isArray(u.roles) ? u.roles.map((x) => String(x || '').toLowerCase()) : [];
        return STAFF.has(r) || tags.some((t) => STAFF.has(t));
      });
      return res.status(200).json({ data: staff });
    }

    // ——— POST create meeting ———
    if (req.method === 'POST' && op === 'create-meeting') {
      if (role !== 'super_admin' && role !== 'admin') {
        return res.status(403).json({ error: 'forbidden' });
      }
      const typeId = String(body.meeting_type_id || '').trim();
      const typeRow = await getMeetingType(typeId);
      if (!canManageType(actor, typeRow, roleTags)) {
        return res.status(403).json({ error: 'forbidden_meeting_type' });
      }
      const title = String(body.title || '').trim();
      const meetingDate = String(body.meeting_date || '').trim().slice(0, 10);
      if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)) {
        return res.status(400).json({ error: 'title_and_date_required' });
      }
      const status = String(body.status || 'planned');
      const allowedStatus = ['draft', 'planned', 'held', 'closed', 'cancelled'];
      if (!allowedStatus.includes(status)) return res.status(400).json({ error: 'invalid_status' });

      const { data: meeting, error } = await supabaseAdmin
        .from('mt_meetings')
        .insert({
          institution_id: institutionId,
          meeting_type_id: typeId,
          title,
          description: String(body.description || '').trim() || null,
          meeting_date: meetingDate,
          start_time: body.start_time || null,
          end_time: body.end_time || null,
          location_or_link: String(body.location_or_link || '').trim() || null,
          manager_user_id: String(body.manager_user_id || actor.sub).trim() || null,
          open_to_role: Boolean(body.open_to_role),
          status,
          reminder_at: body.reminder_at || null,
          created_by: actor.sub
        })
        .select('*')
        .maybeSingle();
      if (error) throw error;

      const participantIds = Array.isArray(body.participant_user_ids)
        ? body.participant_user_ids.map((x) => String(x).trim()).filter(Boolean)
        : [];
      if (participantIds.length) {
        await supabaseAdmin.from('mt_meeting_participants').insert(
          participantIds.map((uid) => ({
            meeting_id: meeting.id,
            user_id: uid,
            role_scope: null
          }))
        );
      }

      const agendaItems = Array.isArray(body.agenda_items) ? body.agenda_items : [];
      if (agendaItems.length) {
        await supabaseAdmin.from('mt_agenda_items').insert(
          agendaItems.map((it, idx) => ({
            meeting_id: meeting.id,
            institution_id: institutionId,
            title: String(it.title || '').trim().slice(0, 300),
            description: String(it.description || '').trim() || null,
            sort_order: Number.isFinite(Number(it.sort_order)) ? Number(it.sort_order) : idx,
            priority: it.priority || 'normal',
            created_by: actor.sub
          }))
        );
      }

      await logActivity({
        institutionId,
        meetingId: meeting.id,
        entityType: 'meeting',
        entityId: meeting.id,
        action: 'created',
        actorUserId: actor.sub,
        newValue: { title, meeting_date: meetingDate, type: typeRow?.code }
      });

      for (const uid of participantIds) {
        await notifyUser({
          title: 'Yeni toplantı',
          body: `"${title}" toplantısına eklendiniz (${meetingDate}).`,
          targetUserId: uid,
          linkUrl: `/toplantilarim?id=${meeting.id}`,
          senderId: actor.sub,
          institutionId
        });
      }

      const bundle = await loadMeetingBundle(meeting.id);
      return res.status(201).json({ data: bundle });
    }

    if (req.method === 'POST' && op === 'save-template') {
      if (role !== 'super_admin' && role !== 'admin') {
        return res.status(403).json({ error: 'forbidden' });
      }
      const name = String(body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'name_required' });
      const { data, error } = await supabaseAdmin
        .from('mt_meeting_templates')
        .insert({
          institution_id: institutionId,
          meeting_type_id: body.meeting_type_id || null,
          name,
          description: body.description || null,
          agenda_json: Array.isArray(body.agenda_json) ? body.agenda_json : [],
          created_by: actor.sub
        })
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return res.status(201).json({ data });
    }

    if (req.method === 'POST' && op === 'add-agenda') {
      const meetingId = String(body.meeting_id || '').trim();
      const bundle = await loadMeetingBundle(meetingId);
      if (!bundle) return res.status(404).json({ error: 'not_found' });
      if (!(await userCanSeeMeeting(actor, bundle.meeting, bundle.type, roleTags))) {
        return res.status(403).json({ error: 'forbidden' });
      }
      if (!canManageType(actor, bundle.type, roleTags)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const items = Array.isArray(body.items) ? body.items : [{ title: body.title, description: body.description }];
      const maxOrder = Math.max(0, ...(bundle.agenda || []).map((a) => Number(a.sort_order) || 0));
      const rows = items
        .map((it, idx) => ({
          meeting_id: meetingId,
          institution_id: institutionId,
          title: String(it.title || '').trim().slice(0, 300),
          description: String(it.description || '').trim() || null,
          sort_order: maxOrder + idx + 1,
          priority: it.priority || 'normal',
          created_by: actor.sub
        }))
        .filter((r) => r.title);
      if (!rows.length) return res.status(400).json({ error: 'items_required' });
      const { data, error } = await supabaseAdmin.from('mt_agenda_items').insert(rows).select('*');
      if (error) throw error;
      await logActivity({
        institutionId,
        meetingId,
        entityType: 'agenda',
        entityId: meetingId,
        action: 'agenda_added',
        actorUserId: actor.sub,
        newValue: { count: rows.length }
      });
      return res.status(201).json({ data });
    }

    if (req.method === 'POST' && op === 'create-task') {
      const meetingId = String(body.meeting_id || '').trim();
      const bundle = await loadMeetingBundle(meetingId);
      if (!bundle) return res.status(404).json({ error: 'not_found' });
      if (!(await userCanSeeMeeting(actor, bundle.meeting, bundle.type, roleTags))) {
        return res.status(403).json({ error: 'forbidden' });
      }
      if (!canManageType(actor, bundle.type, roleTags)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const title = String(body.title || '').trim();
      if (!title) return res.status(400).json({ error: 'title_required' });
      const { data: task, error } = await supabaseAdmin
        .from('mt_tasks')
        .insert({
          institution_id: institutionId,
          meeting_id: meetingId,
          agenda_item_id: body.agenda_item_id || null,
          decision_id: body.decision_id || null,
          title,
          description: String(body.description || '').trim() || null,
          status: 'todo',
          priority: body.priority || 'normal',
          start_date: body.start_date || null,
          due_date: body.due_date || null,
          reviewer_user_id: body.reviewer_user_id || null,
          created_by: actor.sub
        })
        .select('*')
        .maybeSingle();
      if (error) throw error;
      const assignees = Array.isArray(body.assignee_user_ids)
        ? body.assignee_user_ids.map((x) => String(x).trim()).filter(Boolean)
        : [];
      if (assignees.length) {
        await supabaseAdmin.from('mt_task_assignees').insert(
          assignees.map((uid) => ({ task_id: task.id, user_id: uid }))
        );
        for (const uid of assignees) {
          await notifyUser({
            title: 'Yeni görev atandı',
            body: `"${title}" görevi size atandı.`,
            targetUserId: uid,
            linkUrl: `/toplantilarim?id=${meetingId}`,
            senderId: actor.sub,
            institutionId
          });
        }
      }
      await logActivity({
        institutionId,
        meetingId,
        entityType: 'task',
        entityId: task.id,
        action: 'task_created',
        actorUserId: actor.sub,
        newValue: { title, assignees }
      });
      return res.status(201).json({ data: task });
    }

    if (req.method === 'POST' && op === 'add-note') {
      const meetingId = String(body.meeting_id || '').trim();
      const bundle = await loadMeetingBundle(meetingId);
      if (!bundle) return res.status(404).json({ error: 'not_found' });
      if (!(await userCanSeeMeeting(actor, bundle.meeting, bundle.type, roleTags))) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const noteBody = String(body.body || '').trim();
      if (!noteBody) return res.status(400).json({ error: 'body_required' });
      const { data, error } = await supabaseAdmin
        .from('mt_meeting_notes')
        .insert({
          meeting_id: meetingId,
          institution_id: institutionId,
          body: noteBody,
          created_by: actor.sub
        })
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return res.status(201).json({ data });
    }

    if (req.method === 'POST' && op === 'add-decision') {
      const meetingId = String(body.meeting_id || '').trim();
      const bundle = await loadMeetingBundle(meetingId);
      if (!bundle) return res.status(404).json({ error: 'not_found' });
      if (!canManageType(actor, bundle.type, roleTags)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const title = String(body.title || '').trim() || 'Karar';
      const { data, error } = await supabaseAdmin
        .from('mt_decisions')
        .insert({
          meeting_id: meetingId,
          agenda_item_id: body.agenda_item_id || null,
          institution_id: institutionId,
          title,
          body: String(body.body || '').trim() || null,
          created_by: actor.sub
        })
        .select('*')
        .maybeSingle();
      if (error) throw error;
      if (body.agenda_item_id && body.body) {
        await supabaseAdmin
          .from('mt_agenda_items')
          .update({ decision_text: String(body.body).trim(), updated_at: new Date().toISOString() })
          .eq('id', body.agenda_item_id);
      }
      await logActivity({
        institutionId,
        meetingId,
        entityType: 'decision',
        entityId: data.id,
        action: 'decision_added',
        actorUserId: actor.sub,
        newValue: { title }
      });
      return res.status(201).json({ data });
    }

    if (req.method === 'POST' && op === 'carry-forward') {
      if (role !== 'super_admin' && role !== 'admin') {
        return res.status(403).json({ error: 'forbidden' });
      }
      const targetMeetingId = String(body.target_meeting_id || '').trim();
      const sourceAgendaId = String(body.agenda_item_id || '').trim();
      const sourceTaskId = String(body.task_id || '').trim();
      const target = await loadMeetingBundle(targetMeetingId);
      if (!target) return res.status(404).json({ error: 'target_not_found' });
      if (!canManageType(actor, target.type, roleTags)) {
        return res.status(403).json({ error: 'forbidden' });
      }

      if (sourceAgendaId) {
        const { data: src } = await supabaseAdmin
          .from('mt_agenda_items')
          .select('*')
          .eq('id', sourceAgendaId)
          .maybeSingle();
        if (!src) return res.status(404).json({ error: 'agenda_not_found' });
        const maxOrder = Math.max(0, ...(target.agenda || []).map((a) => Number(a.sort_order) || 0));
        const { data: created, error } = await supabaseAdmin
          .from('mt_agenda_items')
          .insert({
            meeting_id: targetMeetingId,
            institution_id: institutionId,
            title: src.title,
            description: src.description,
            sort_order: maxOrder + 1,
            priority: src.priority,
            status: 'pending',
            discussion_note: src.discussion_note,
            decision_text: src.decision_text,
            created_by: actor.sub,
            carried_from_meeting_id: src.meeting_id,
            carried_from_agenda_id: src.id,
            is_carried_forward: true
          })
          .select('*')
          .maybeSingle();
        if (error) throw error;
        await supabaseAdmin
          .from('mt_agenda_items')
          .update({ status: 'deferred', updated_at: new Date().toISOString() })
          .eq('id', src.id);
        await logActivity({
          institutionId,
          meetingId: targetMeetingId,
          entityType: 'agenda',
          entityId: created.id,
          action: 'carried_forward',
          actorUserId: actor.sub,
          oldValue: { from_meeting: src.meeting_id, from_agenda: src.id }
        });
        return res.status(201).json({ data: created });
      }

      if (sourceTaskId) {
        const { data: src } = await supabaseAdmin.from('mt_tasks').select('*').eq('id', sourceTaskId).maybeSingle();
        if (!src) return res.status(404).json({ error: 'task_not_found' });
        await supabaseAdmin
          .from('mt_tasks')
          .update({
            carried_to_meeting_id: targetMeetingId,
            status: src.status === 'done' ? 'done' : 'deferred',
            updated_at: new Date().toISOString()
          })
          .eq('id', src.id);
        await logActivity({
          institutionId,
          meetingId: targetMeetingId,
          entityType: 'task',
          entityId: src.id,
          action: 'task_linked_forward',
          actorUserId: actor.sub,
          newValue: { meeting_id: targetMeetingId }
        });
        return res.status(200).json({ data: { ...src, carried_to_meeting_id: targetMeetingId } });
      }
      return res.status(400).json({ error: 'agenda_or_task_required' });
    }

    // ——— PATCH ———
    if (req.method === 'PATCH' && op === 'update-meeting') {
      const id = String(body.id || req.query.id || '').trim();
      const bundle = await loadMeetingBundle(id);
      if (!bundle) return res.status(404).json({ error: 'not_found' });
      if (!canManageType(actor, bundle.type, roleTags)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const patch = {};
      for (const k of [
        'title',
        'description',
        'meeting_date',
        'start_time',
        'end_time',
        'location_or_link',
        'manager_user_id',
        'status',
        'reminder_at'
      ]) {
        if (body[k] !== undefined) patch[k] = body[k];
      }
      if (body.open_to_role !== undefined) patch.open_to_role = Boolean(body.open_to_role);
      patch.updated_at = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from('mt_meetings')
        .update(patch)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      if (Array.isArray(body.participant_user_ids)) {
        await supabaseAdmin.from('mt_meeting_participants').delete().eq('meeting_id', id);
        const ids = body.participant_user_ids.map((x) => String(x).trim()).filter(Boolean);
        if (ids.length) {
          await supabaseAdmin.from('mt_meeting_participants').insert(
            ids.map((uid) => ({ meeting_id: id, user_id: uid }))
          );
        }
      }
      await logActivity({
        institutionId,
        meetingId: id,
        entityType: 'meeting',
        entityId: id,
        action: 'updated',
        actorUserId: actor.sub,
        oldValue: bundle.meeting,
        newValue: patch
      });
      return res.status(200).json({ data });
    }

    if (req.method === 'PATCH' && op === 'update-agenda') {
      const id = String(body.id || '').trim();
      const { data: item } = await supabaseAdmin.from('mt_agenda_items').select('*').eq('id', id).maybeSingle();
      if (!item) return res.status(404).json({ error: 'not_found' });
      const bundle = await loadMeetingBundle(item.meeting_id);
      if (!canManageType(actor, bundle?.type, roleTags)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const patch = {};
      for (const k of [
        'title',
        'description',
        'sort_order',
        'priority',
        'status',
        'discussion_note',
        'decision_text',
        'related_user_ids'
      ]) {
        if (body[k] !== undefined) patch[k] = body[k];
      }
      patch.updated_at = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from('mt_agenda_items')
        .update(patch)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      await logActivity({
        institutionId,
        meetingId: item.meeting_id,
        entityType: 'agenda',
        entityId: id,
        action: 'agenda_updated',
        actorUserId: actor.sub,
        oldValue: { status: item.status },
        newValue: patch
      });
      return res.status(200).json({ data });
    }

    if (req.method === 'PATCH' && op === 'reorder-agenda') {
      const meetingId = String(body.meeting_id || '').trim();
      const order = Array.isArray(body.ordered_ids) ? body.ordered_ids : [];
      const bundle = await loadMeetingBundle(meetingId);
      if (!canManageType(actor, bundle?.type, roleTags)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      for (let i = 0; i < order.length; i++) {
        await supabaseAdmin
          .from('mt_agenda_items')
          .update({ sort_order: i, updated_at: new Date().toISOString() })
          .eq('id', order[i])
          .eq('meeting_id', meetingId);
      }
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'PATCH' && op === 'update-task') {
      const id = String(body.id || '').trim();
      const { data: task } = await supabaseAdmin.from('mt_tasks').select('*').eq('id', id).maybeSingle();
      if (!task) return res.status(404).json({ error: 'not_found' });
      const bundle = await loadMeetingBundle(task.meeting_id);
      if (!(await userCanSeeMeeting(actor, bundle.meeting, bundle.type, roleTags))) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const isManager = canManageType(actor, bundle.type, roleTags);
      const { data: myAssign } = await supabaseAdmin
        .from('mt_task_assignees')
        .select('id')
        .eq('task_id', id)
        .eq('user_id', actor.sub)
        .maybeSingle();
      const isAssignee = Boolean(myAssign);

      if (!isManager && !isAssignee) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const patch = {};
      if (isManager) {
        for (const k of [
          'title',
          'description',
          'priority',
          'start_date',
          'due_date',
          'reviewer_user_id',
          'status',
          'completion_note'
        ]) {
          if (body[k] !== undefined) patch[k] = body[k];
        }
      } else {
        // assignee: only own status + completion note
        if (body.status !== undefined) {
          const allowed = ['todo', 'in_progress', 'done', 'deferred'];
          if (!allowed.includes(body.status)) {
            return res.status(400).json({ error: 'invalid_status' });
          }
          patch.status = body.status;
        }
        if (body.completion_note !== undefined) patch.completion_note = body.completion_note;
      }
      if (patch.status === 'done') {
        patch.completed_by = actor.sub;
        patch.completed_at = new Date().toISOString();
      }
      patch.updated_at = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from('mt_tasks')
        .update(patch)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) throw error;

      if (isManager && Array.isArray(body.assignee_user_ids)) {
        await supabaseAdmin.from('mt_task_assignees').delete().eq('task_id', id);
        const ids = body.assignee_user_ids.map((x) => String(x).trim()).filter(Boolean);
        if (ids.length) {
          await supabaseAdmin.from('mt_task_assignees').insert(ids.map((uid) => ({ task_id: id, user_id: uid })));
        }
      }

      await logActivity({
        institutionId,
        meetingId: task.meeting_id,
        entityType: 'task',
        entityId: id,
        action: 'task_updated',
        actorUserId: actor.sub,
        oldValue: { status: task.status },
        newValue: patch
      });

      if (patch.status === 'done' && task.reviewer_user_id) {
        await notifyUser({
          title: 'Görev tamamlandı',
          body: `"${task.title}" tamamlandı — kontrol bekliyor.`,
          targetUserId: task.reviewer_user_id,
          linkUrl: `/toplanti-takip?id=${task.meeting_id}`,
          senderId: actor.sub,
          institutionId
        });
      }
      return res.status(200).json({ data });
    }

    if (req.method === 'PATCH' && op === 'close-meeting') {
      const id = String(body.id || '').trim();
      const bundle = await loadMeetingBundle(id);
      if (!bundle) return res.status(404).json({ error: 'not_found' });
      if (!canManageType(actor, bundle.type, roleTags)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const warnings = [];
      for (const a of bundle.agenda || []) {
        if (['pending', 'in_discussion'].includes(a.status)) {
          warnings.push({ type: 'agenda_undiscussed', id: a.id, title: a.title });
        }
        if (a.status === 'discussed' && !String(a.decision_text || '').trim()) {
          warnings.push({ type: 'agenda_no_decision', id: a.id, title: a.title });
        }
      }
      for (const t of bundle.tasks || []) {
        if (!(t.assignees || []).length) {
          warnings.push({ type: 'task_no_assignee', id: t.id, title: t.title });
        }
        if (!t.due_date && t.status !== 'cancelled') {
          warnings.push({ type: 'task_no_due', id: t.id, title: t.title });
        }
      }
      if (warnings.length && !body.force) {
        return res.status(409).json({ error: 'close_warnings', warnings });
      }
      const { data, error } = await supabaseAdmin
        .from('mt_meetings')
        .update({
          status: 'closed',
          closed_by: actor.sub,
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      await logActivity({
        institutionId,
        meetingId: id,
        entityType: 'meeting',
        entityId: id,
        action: 'closed',
        actorUserId: actor.sub,
        newValue: { warnings_count: warnings.length }
      });
      return res.status(200).json({ data, warnings });
    }

    if (req.method === 'DELETE' && op === 'archive-meeting') {
      const id = String(req.query.id || body.id || '').trim();
      const bundle = await loadMeetingBundle(id);
      if (!bundle) return res.status(404).json({ error: 'not_found' });
      if (!canManageType(actor, bundle.type, roleTags)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const { error } = await supabaseAdmin
        .from('mt_meetings')
        .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      await logActivity({
        institutionId,
        meetingId: id,
        entityType: 'meeting',
        entityId: id,
        action: 'archived',
        actorUserId: actor.sub
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'unknown_op', op, method: req.method });
  } catch (e) {
    console.error('[meeting-tracker]', e);
    return res.status(500).json({ error: e instanceof Error ? e.message : 'server_error' });
  }
}
