/**
 * CRM Dashboard / görev / toplu şablon — registration-tracking ops
 */
import { supabaseAdmin } from './supabase-admin.js';
import { GRADE_PROGRAMS, istanbulDayBounds } from './registration-tracking-utils.js';
import {
  computeFirstResponseAvgMs,
  CRM_BULK_PIPELINE_COLUMNS,
  CRM_OPS_SEGMENTS,
  filterBulkAudience,
  formatFirstResponse,
  inIsoRange,
  isTrialLessonLead,
  resolveOpsDateRange,
  summarizeLeadSources
} from './crm-ops-metrics.js';

function boundsFromRange(fromYmd, toYmd) {
  const a = istanbulDayBounds(fromYmd);
  const b = istanbulDayBounds(toYmd);
  return {
    start: a?.start || new Date(`${fromYmd}T00:00:00+03:00`).toISOString(),
    end: b?.end || new Date(`${toYmd}T23:59:59.999+03:00`).toISOString()
  };
}

async function loadCoaches(institutionId) {
  const { data } = await supabaseAdmin
    .from('users')
    .select('id, name, email, role, roles, institution_id')
    .or(`institution_id.eq.${institutionId},role.eq.super_admin`)
    .limit(200);
  const rows = data || [];
  return rows
    .filter((u) => {
      const roles = Array.isArray(u.roles) ? u.roles : [u.role];
      return roles.some((r) => ['admin', 'super_admin', 'coach', 'crm_agent'].includes(String(r)));
    })
    .map((u) => ({ id: u.id, name: u.name || u.email || 'Ajan', email: u.email, kind: u.role }));
}

export async function handleOpsDashboard(institutionId, filters = {}) {
  const range = resolveOpsDateRange(filters.preset, filters.date_from, filters.date_to);
  const { start, end } = boundsFromRange(range.from, range.to);
  const fromMs = new Date(start).getTime();
  const toMs = new Date(end).getTime();
  const assignee = String(filters.assigned_user_id || filters.agent_id || '').trim();

  let leadQ = supabaseAdmin
    .from('registration_leads')
    .select(
      'id, first_name, last_name, full_name, assigned_user_id, primary_status, stage, confirmed_at, created_at, last_contact_at, last_inbound_at, first_contact_at, source, last_inbound_channel'
    )
    .eq('institution_id', institutionId)
    .is('deleted_at', null);
  if (assignee) leadQ = leadQ.eq('assigned_user_id', assignee);
  const { data: leads, error } = await leadQ.limit(8000);
  let all = leads || [];
  if (error) {
    if (/last_inbound_channel|column/i.test(error.message || '')) {
      let q2 = supabaseAdmin
        .from('registration_leads')
        .select(
          'id, first_name, last_name, full_name, assigned_user_id, primary_status, stage, confirmed_at, created_at, last_contact_at, last_inbound_at, first_contact_at, source'
        )
        .eq('institution_id', institutionId)
        .is('deleted_at', null);
      if (assignee) q2 = q2.eq('assigned_user_id', assignee);
      const { data: leads2, error: e2 } = await q2.limit(8000);
      if (e2) throw e2;
      all = leads2 || [];
    } else {
      throw error;
    }
  }

  const contacts = all.filter(
    (l) =>
      inIsoRange(l.last_contact_at, fromMs, toMs) ||
      inIsoRange(l.last_inbound_at, fromMs, toMs) ||
      inIsoRange(l.first_contact_at, fromMs, toMs)
  );
  const trials = all.filter(
    (l) =>
      isTrialLessonLead(l) &&
      (inIsoRange(l.last_contact_at, fromMs, toMs) ||
        inIsoRange(l.confirmed_at, fromMs, toMs) ||
        inIsoRange(l.created_at, fromMs, toMs) ||
        l.stage === 'trial_lesson_scheduled' ||
        l.stage === 'trial_lesson_completed')
  );
  const confirmed = all.filter(
    (l) => l.primary_status === 'confirmed' && inIsoRange(l.confirmed_at || l.created_at, fromMs, toMs)
  );

  let messages = [];
  try {
    let mq = supabaseAdmin
      .from('registration_channel_messages')
      .select('lead_id, direction, occurred_at, normalized_phone, phone')
      .eq('institution_id', institutionId)
      .gte('occurred_at', start)
      .lte('occurred_at', end)
      .limit(8000);
    const { data: msgs } = await mq;
    messages = msgs || [];
    if (assignee) {
      const allow = new Set(all.map((l) => l.id));
      messages = messages.filter((m) => allow.has(m.lead_id));
    }
  } catch {
    messages = [];
  }

  const fr = computeFirstResponseAvgMs(messages);
  const coaches = await loadCoaches(institutionId);
  const nameById = Object.fromEntries(coaches.map((c) => [c.id, c.name]));

  const byAgent = new Map();
  const ensure = (id, name) => {
    if (!byAgent.has(id)) {
      byAgent.set(id, {
        id,
        name,
        leads: 0,
        contacts: 0,
        trial_lessons: 0,
        confirmed: 0,
        response_ms: [],
        conversion_rate: 0
      });
    }
    return byAgent.get(id);
  };

  for (const l of all) {
    const id = l.assigned_user_id || '_unassigned';
    const row = ensure(id, id === '_unassigned' ? 'Atanmamış' : nameById[id] || 'Temsilci');
    row.leads += 1;
    if (contacts.some((c) => c.id === l.id)) row.contacts += 1;
    if (trials.some((c) => c.id === l.id)) row.trial_lessons += 1;
    if (confirmed.some((c) => c.id === l.id)) row.confirmed += 1;
  }

  const frByLead = new Map();
  const sorted = [...messages].sort(
    (a, b) => new Date(a.occurred_at || 0).getTime() - new Date(b.occurred_at || 0).getTime()
  );
  const pending = new Map();
  for (const m of sorted) {
    const lid = m.lead_id;
    if (!lid) continue;
    if (m.direction === 'inbound' && !pending.has(lid)) pending.set(lid, new Date(m.occurred_at).getTime());
    else if (m.direction === 'outbound' && pending.has(lid)) {
      const d = new Date(m.occurred_at).getTime() - pending.get(lid);
      if (d >= 0) frByLead.set(lid, d);
      pending.delete(lid);
    }
  }
  const leadOwner = Object.fromEntries(all.map((l) => [l.id, l.assigned_user_id || '_unassigned']));
  for (const [lid, ms] of frByLead) {
    const uid = leadOwner[lid];
    if (!uid || !byAgent.has(uid)) continue;
    byAgent.get(uid).response_ms.push(ms);
  }

  const agents = [...byAgent.values()]
    .map((a) => {
      const avg = a.response_ms.length
        ? Math.round(a.response_ms.reduce((x, y) => x + y, 0) / a.response_ms.length)
        : null;
      return {
        id: a.id,
        name: a.name,
        leads: a.leads,
        contacts: a.contacts,
        trial_lessons: a.trial_lessons,
        confirmed: a.confirmed,
        response_ms: avg,
        response_label: formatFirstResponse(avg),
        conversion_rate: a.leads ? Math.round((a.confirmed / a.leads) * 1000) / 10 : 0
      };
    })
    .sort((a, b) => b.confirmed - a.confirmed || b.leads - a.leads);

  const seriesMap = new Map();
  for (const l of contacts) {
    const day = String(l.last_contact_at || l.last_inbound_at || l.first_contact_at || '').slice(0, 10);
    if (!day) continue;
    if (!seriesMap.has(day)) seriesMap.set(day, { day, contacts: 0, confirmed: 0 });
    seriesMap.get(day).contacts += 1;
  }
  for (const l of confirmed) {
    const day = String(l.confirmed_at || l.created_at || '').slice(0, 10);
    if (!day) continue;
    if (!seriesMap.has(day)) seriesMap.set(day, { day, contacts: 0, confirmed: 0 });
    seriesMap.get(day).confirmed += 1;
  }

  return {
    range,
    contacts: contacts.length,
    trial_lessons: trials.length,
    confirmed: confirmed.length,
    avg_first_response_ms: fr.avg_ms,
    avg_first_response_label: formatFirstResponse(fr.avg_ms),
    first_response_samples: fr.samples,
    agents,
    coaches,
    series: [...seriesMap.values()].sort((a, b) => a.day.localeCompare(b.day)),
    sources: summarizeLeadSources(contacts.length ? contacts : all.filter((l) => inIsoRange(l.created_at, fromMs, toMs))),
    segments: CRM_OPS_SEGMENTS
  };
}

export async function handleListOpsTasks(institutionId, filters = {}) {
  const range = resolveOpsDateRange(filters.preset || 'this_week', filters.date_from, filters.date_to);
  const { start, end } = boundsFromRange(range.from, range.to);
  const assignee = String(filters.assigned_user_id || filters.agent_id || '').trim();
  const bucket = String(filters.bucket || 'all'); // pending | overdue | done | all

  let q = supabaseAdmin
    .from('registration_tasks')
    .select(
      'id, lead_id, assigned_to, title, description, task_type, priority, status, due_at, completed_at, created_at, registration_leads(id, first_name, last_name, full_name, phone, normalized_phone, stage, primary_status)'
    )
    .eq('institution_id', institutionId)
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(400);
  if (assignee) q = q.eq('assigned_to', assignee);

  const { data, error } = await q;
  if (error) {
    if (/registration_leads|embed|relationship/i.test(error.message || '')) {
      const { data: flat, error: e2 } = await supabaseAdmin
        .from('registration_tasks')
        .select('*')
        .eq('institution_id', institutionId)
        .order('due_at', { ascending: true })
        .limit(400);
      if (e2) throw e2;
      return { items: await hydrateTasks(flat || [], institutionId, bucket, start, end), range };
    }
    throw error;
  }

  const now = Date.now();
  const items = (data || [])
    .map((t) => mapTaskRow(t, now))
    .filter((t) => filterTaskBucket(t, bucket, start, end, now));

  return { items, range };
}

async function hydrateTasks(rows, institutionId, bucket, start, end) {
  const ids = [...new Set(rows.map((r) => r.lead_id).filter(Boolean))];
  let leads = [];
  if (ids.length) {
    const { data } = await supabaseAdmin
      .from('registration_leads')
      .select('id, first_name, last_name, full_name, phone, normalized_phone, stage, primary_status')
      .eq('institution_id', institutionId)
      .in('id', ids);
    leads = data || [];
  }
  const byId = Object.fromEntries(leads.map((l) => [l.id, l]));
  const now = Date.now();
  return rows
    .map((t) => mapTaskRow({ ...t, registration_leads: byId[t.lead_id] }, now))
    .filter((t) => filterTaskBucket(t, bucket, start, end, now));
}

function mapTaskRow(t, now) {
  const lead = t.registration_leads || {};
  const due = t.due_at ? new Date(t.due_at).getTime() : null;
  const overdue = t.status !== 'completed' && t.status !== 'cancelled' && due != null && due < now;
  return {
    id: t.id,
    lead_id: t.lead_id,
    assigned_to: t.assigned_to,
    title: t.title,
    description: t.description,
    task_type: t.task_type,
    priority: t.priority,
    status: overdue && t.status !== 'completed' ? 'overdue' : t.status,
    due_at: t.due_at,
    completed_at: t.completed_at,
    created_at: t.created_at,
    lead_name: lead.full_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Lead',
    lead_phone: lead.phone || lead.normalized_phone || null,
    lead_stage: lead.stage || null
  };
}

function filterTaskBucket(t, bucket, start, end, now) {
  if (bucket === 'done') return t.status === 'completed';
  if (bucket === 'overdue') return t.status === 'overdue' || (t.status !== 'completed' && t.due_at && new Date(t.due_at) < now);
  if (bucket === 'pending') {
    return t.status !== 'completed' && t.status !== 'cancelled' && (!t.due_at || new Date(t.due_at) >= now);
  }
  if (t.due_at) {
    const ms = new Date(t.due_at).getTime();
    if (ms < new Date(start).getTime() - 7 * 86400000 || ms > new Date(end).getTime() + 14 * 86400000) {
      if (t.status === 'completed') return false;
    }
  }
  return true;
}

export async function handleSnoozeTask(body, institutionId, actor) {
  const minutes = Math.max(1, Math.min(24 * 60, Number(body.minutes) || 5));
  const { data: task, error } = await supabaseAdmin
    .from('registration_tasks')
    .select('*')
    .eq('id', body.task_id)
    .eq('institution_id', institutionId)
    .maybeSingle();
  if (error) throw error;
  if (!task) throw new Error('Görev bulunamadı');
  const base = task.due_at && new Date(task.due_at).getTime() > Date.now() ? new Date(task.due_at) : new Date();
  const due = new Date(base.getTime() + minutes * 60 * 1000).toISOString();
  const { data, error: uErr } = await supabaseAdmin
    .from('registration_tasks')
    .update({
      due_at: due,
      status: 'pending',
      updated_by: actor.sub,
      updated_at: new Date().toISOString()
    })
    .eq('id', task.id)
    .select('*')
    .single();
  if (uErr) throw uErr;
  return data;
}

export async function handleDueAlarms(institutionId, actor) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  const windowEnd = new Date(now.getTime() + 60 * 1000).toISOString();
  let q = supabaseAdmin
    .from('registration_tasks')
    .select('id, lead_id, assigned_to, title, description, due_at, status, task_type')
    .eq('institution_id', institutionId)
    .in('status', ['pending', 'in_progress', 'overdue'])
    .gte('due_at', windowStart)
    .lte('due_at', windowEnd)
    .limit(40);
  if (actor?.sub) q = q.or(`assigned_to.eq.${actor.sub},assigned_to.is.null`);
  const { data, error } = await q;
  if (error) throw error;
  const rows = data || [];
  const leadIds = [...new Set(rows.map((r) => r.lead_id).filter(Boolean))];
  let leads = [];
  if (leadIds.length) {
    const { data: ld } = await supabaseAdmin
      .from('registration_leads')
      .select('id, first_name, last_name, full_name, phone, normalized_phone')
      .in('id', leadIds);
    leads = ld || [];
  }
  const byId = Object.fromEntries(leads.map((l) => [l.id, l]));
  return {
    items: rows.map((t) => {
      const lead = byId[t.lead_id] || {};
      return {
        ...t,
        lead_name: lead.full_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Lead',
        lead_phone: lead.phone || lead.normalized_phone || null
      };
    })
  };
}

export function resolveBulkSegment(segmentId) {
  return CRM_OPS_SEGMENTS.find((s) => s.id === segmentId) || null;
}

export async function handleListSegmentLeads(institutionId, filters = {}) {
  const segment = resolveBulkSegment(filters.segment || '') || null;
  const assignee = String(filters.assigned_user_id || '').trim();
  let q = supabaseAdmin
    .from('registration_leads')
    .select(
      'id, first_name, last_name, full_name, phone, normalized_phone, stage, grade_program, assigned_user_id, primary_status'
    )
    .eq('institution_id', institutionId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(5000);
  if (assignee) q = q.eq('assigned_user_id', assignee);
  const { data, error } = await q;
  if (error) throw error;
  const { items, facets } = filterBulkAudience(data || [], {
    grades: filters.grades,
    columns: filters.columns,
    segment: filters.columns ? '' : filters.segment
  });
  return { items, facets, segment, columns: CRM_BULK_PIPELINE_COLUMNS, grade_programs: GRADE_PROGRAMS };
}
