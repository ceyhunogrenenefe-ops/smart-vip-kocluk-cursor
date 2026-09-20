/**
 * FAZ 6 — "Bugünkü İşlerim" (temsilci) ve satış paneli (yönetici).
 * SLA: müşterinin cevapsız beklediği süre → 0–5 yeşil, 5–15 sarı, 15–30 turuncu, 30+ kırmızı (dakika).
 * Salt okuma; hiçbir mesaj göndermez, hiçbir kaydı değiştirmez.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { getOnDutyUserIds } from './crm-shifts.js';
import { getGoLiveIso } from './crm-assignment.js';

export const SLA_THRESHOLDS = [5, 15, 30];
const DAY_MS = 24 * 60 * 60 * 1000;

export function slaLevel(minutes) {
  const m = Number(minutes) || 0;
  if (m < SLA_THRESHOLDS[0]) return 'green';
  if (m < SLA_THRESHOLDS[1]) return 'yellow';
  if (m < SLA_THRESHOLDS[2]) return 'orange';
  return 'red';
}

/**
 * Bir konuşmanın mesajlarından (eskiden yeniye) bekleme dönemlerini çıkarır.
 * Dönem: bir temsilci mesajından (veya konuşma başından) sonraki ilk müşteri mesajı → ilk temsilci cevabı.
 * @returns {{ episodes: Array<{ start: number, end: number|null }>, waitingSince: number|null }}
 */
export function responseEpisodes(messages) {
  const episodes = [];
  let open = null;
  for (const m of messages || []) {
    const t = new Date(m.created_at).getTime();
    if (!Number.isFinite(t)) continue;
    if (m.sender_type === 'lead') {
      if (!open) open = { start: t, end: null };
    } else if (m.sender_type === 'agent' && open) {
      open.end = t;
      episodes.push(open);
      open = null;
    }
  }
  if (open) episodes.push(open);
  return { episodes, waitingSince: open ? open.start : null };
}

/** İstanbul gününün başlangıcı (UTC ms) */
export function istanbulDayStart(now = Date.now()) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(now));
  return new Date(`${ymd}T00:00:00+03:00`).getTime();
}

export function isAdConversation(conv) {
  const ad = conv?.ad_source_data;
  if (!ad || typeof ad !== 'object') return false;
  return Boolean(ad.ad_id || ad.ctwa_clid || ad.campaign_id || ad.source_type === 'ad' || ad.headline);
}

function adLabel(conv) {
  const ad = conv?.ad_source_data || {};
  return String(ad.headline || ad.campaign_id || ad.ad_id || '').trim().slice(0, 80) || null;
}

async function userNames(ids) {
  const list = [...new Set(ids.filter(Boolean).map(String))];
  if (!list.length) return {};
  const { data } = await supabaseAdmin.from('users').select('id, name, email').in('id', list);
  return Object.fromEntries((data || []).map((u) => [String(u.id), u.name || u.email || '']));
}

/**
 * @param {{ institutionId: string|null, userId: string|null, channel?: string, ad?: ''|'ad'|'organic', now?: number }} opts
 *   userId null → tüm kurum (yönetici görünümü)
 */
export async function buildSalesBoard({ institutionId, userId = null, channel = '', ad = '', now = Date.now() }) {
  // CRM canlı kullanım başlangıcından öncesi panele / uyarılara girmez
  const goLive = await getGoLiveIso(institutionId).catch(() => null);
  const windowStart = new Date(now - 8 * DAY_MS).toISOString();
  const since = goLive && goLive > windowStart ? goLive : windowStart;
  const dayStart = istanbulDayStart(now);
  const dayEnd = dayStart + DAY_MS;

  let cq = supabaseAdmin
    .from('crm_conversations')
    .select('id, channel, contact_name, contact_username, contact_identifier, assigned_user_id, lead_id, ad_source_data, last_message_at, last_message_preview')
    .eq('is_internal', false)
    .gte('last_message_at', since)
    .order('last_message_at', { ascending: false })
    .limit(500);
  if (institutionId) cq = cq.eq('institution_id', institutionId);
  if (userId) cq = cq.eq('assigned_user_id', userId);
  if (channel) cq = cq.eq('channel', channel);
  const { data: convsRaw, error: cErr } = await cq;
  if (cErr) throw new Error(cErr.message);
  const convs = (convsRaw || []).filter((c) =>
    ad === 'ad' ? isAdConversation(c) : ad === 'organic' ? !isAdConversation(c) : true
  );

  const byConv = new Map(convs.map((c) => [c.id, []]));
  const ids = [...byConv.keys()];
  for (let i = 0; i < ids.length; i += 100) {
    const { data: msgs, error } = await supabaseAdmin
      .from('crm_messages')
      .select('conversation_id, sender_type, created_at')
      .in('conversation_id', ids.slice(i, i + 100))
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(5000);
    if (error) throw new Error(error.message);
    for (const m of msgs || []) byConv.get(m.conversation_id)?.push(m);
  }

  const waiting = [];
  const agentStats = new Map();
  const stat = (uid) => {
    const key = uid || '_unassigned';
    if (!agentStats.has(key)) {
      agentStats.set(key, {
        user_id: uid || null,
        waiting: 0,
        green: 0,
        yellow: 0,
        orange: 0,
        red: 0,
        replied_today: 0,
        response_minutes: [],
        overdue_tasks: 0,
        today_tasks: 0,
        new_leads_today: 0
      });
    }
    return agentStats.get(key);
  };

  for (const c of convs) {
    const { episodes, waitingSince } = responseEpisodes(byConv.get(c.id));
    const st = stat(c.assigned_user_id);
    for (const ep of episodes) {
      if (ep.end && ep.end >= dayStart && ep.end < dayEnd) {
        st.replied_today += 1;
        st.response_minutes.push((ep.end - ep.start) / 60000);
      }
    }
    if (waitingSince && (!goLive || waitingSince >= new Date(goLive).getTime())) {
      const minutes = Math.max(0, Math.round((now - waitingSince) / 60000));
      const level = slaLevel(minutes);
      st.waiting += 1;
      st[level] += 1;
      waiting.push({
        conversation_id: c.id,
        contact_name: c.contact_name,
        contact_username: c.contact_username,
        contact_identifier: c.contact_identifier,
        channel: c.channel,
        assigned_user_id: c.assigned_user_id,
        lead_id: c.lead_id,
        preview: c.last_message_preview,
        waiting_since: new Date(waitingSince).toISOString(),
        waiting_minutes: minutes,
        sla: level,
        is_ad: isAdConversation(c),
        ad_label: adLabel(c)
      });
    }
  }
  waiting.sort((a, b) => b.waiting_minutes - a.waiting_minutes);

  // Görevler: gecikmiş + bugün
  let tq = supabaseAdmin
    .from('registration_tasks')
    .select('id, lead_id, title, task_type, priority, due_at, assigned_to, auto_generated, follow_up_stage, review_required')
    .eq('status', 'pending')
    .lt('due_at', new Date(dayEnd).toISOString())
    .order('due_at', { ascending: true })
    .limit(300);
  if (institutionId) tq = tq.eq('institution_id', institutionId);
  if (userId) tq = tq.eq('assigned_to', userId);
  const { data: tasksRaw, error: tErr } = await tq;
  if (tErr) throw new Error(tErr.message);

  // Yeni lead'ler (bugün)
  let lq = supabaseAdmin
    .from('registration_leads')
    .select('id, full_name, parent_full_name, source, stage, assigned_user_id, created_at, next_action_at')
    .is('deleted_at', null)
    .eq('is_internal', false)
    .gte('created_at', new Date(dayStart).toISOString())
    .order('created_at', { ascending: false })
    .limit(200);
  if (institutionId) lq = lq.eq('institution_id', institutionId);
  if (userId) lq = lq.eq('assigned_user_id', userId);
  const { data: leadsRaw, error: lErr } = await lq;
  if (lErr) throw new Error(lErr.message);

  const leadIds = [...new Set((tasksRaw || []).map((t) => t.lead_id).filter(Boolean))];
  const leadNames = {};
  if (leadIds.length) {
    const { data } = await supabaseAdmin
      .from('registration_leads')
      .select('id, full_name, parent_full_name, stage')
      .in('id', leadIds);
    for (const l of data || []) leadNames[l.id] = { name: l.full_name || l.parent_full_name || '', stage: l.stage };
  }

  const tasks = { overdue: [], today: [] };
  for (const t of tasksRaw || []) {
    const due = new Date(t.due_at).getTime();
    const row = { ...t, lead_name: leadNames[t.lead_id]?.name || '', lead_stage: leadNames[t.lead_id]?.stage || null };
    const st = stat(t.assigned_to);
    if (due < dayStart || due < now) {
      tasks.overdue.push(row);
      st.overdue_tasks += 1;
    } else {
      tasks.today.push(row);
      st.today_tasks += 1;
    }
  }
  const newLeads = leadsRaw || [];
  for (const l of newLeads) stat(l.assigned_user_id).new_leads_today += 1;

  const names = await userNames([
    ...waiting.map((w) => w.assigned_user_id),
    ...[...agentStats.values()].map((s) => s.user_id)
  ]);
  for (const w of waiting) w.assigned_name = names[String(w.assigned_user_id)] || null;

  const onDuty = await getOnDutyUserIds(institutionId, now).catch(() => null);
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
  const allResponses = [];
  const agents = [...agentStats.values()].map((s) => {
    allResponses.push(...s.response_minutes);
    const { response_minutes, ...rest } = s;
    return {
      ...rest,
      name: s.user_id ? names[String(s.user_id)] || 'Temsilci' : 'Atanmamış',
      on_duty: onDuty == null ? null : Boolean(s.user_id && onDuty.includes(String(s.user_id))),
      avg_response_min: avg(response_minutes)
    };
  });
  agents.sort((a, b) => b.red - a.red || b.waiting - a.waiting || b.overdue_tasks - a.overdue_tasks);

  const totals = agents.reduce(
    (acc, a) => {
      for (const k of ['waiting', 'green', 'yellow', 'orange', 'red', 'replied_today', 'overdue_tasks', 'today_tasks', 'new_leads_today']) {
        acc[k] += a[k];
      }
      return acc;
    },
    { waiting: 0, green: 0, yellow: 0, orange: 0, red: 0, replied_today: 0, overdue_tasks: 0, today_tasks: 0, new_leads_today: 0 }
  );
  totals.avg_response_min = avg(allResponses);

  return {
    generated_at: new Date(now).toISOString(),
    sla_thresholds: SLA_THRESHOLDS,
    on_duty: onDuty,
    go_live_date: goLive ? goLive.slice(0, 10) : null,
    totals,
    waiting,
    tasks,
    new_leads: newLeads,
    agents
  };
}
