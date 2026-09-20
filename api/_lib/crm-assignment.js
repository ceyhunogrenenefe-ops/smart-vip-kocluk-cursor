/**
 * FAZ 2 — sorumlu temsilci + otomatik dağıtım (round robin).
 * Aday ve sohbet aynı temsilcide tutulur. Kurum içi (öğrenci/veli) kayıtlar dağıtılmaz.
 * Dağıtım crm_settings.round_robin_enabled ile açılıp kapanır; havuz =
 * aktif crm_user_assignments.in_round_robin + aktif kullanıcılar.
 */
import { supabaseAdmin } from './supabase-admin.js';

export async function getCrmSettings(institutionId) {
  const inst = String(institutionId || '').trim();
  const defaults = { institution_id: inst, round_robin_enabled: true, rr_last_user_id: null, follow_up_rules: null };
  if (!inst) return defaults;
  const { data, error } = await supabaseAdmin.from('crm_settings').select('*').eq('institution_id', inst).maybeSingle();
  if (error) return defaults;
  return data ? { ...defaults, ...data } : defaults;
}

export async function updateCrmSettings(institutionId, patch, actorId = null) {
  const row = { institution_id: String(institutionId), ...patch, updated_by: actorId, updated_at: new Date().toISOString() };
  const { data, error } = await supabaseAdmin.from('crm_settings').upsert(row, { onConflict: 'institution_id' }).select('*').maybeSingle();
  if (error) throw error;
  return data;
}

/** Dağıtım havuzu: aktif atama + dağıtıma dahil + aktif kullanıcı (ad sırasına göre sabit sıra) */
export async function listRoundRobinAgents(institutionId) {
  const { data: assigns } = await supabaseAdmin
    .from('crm_user_assignments')
    .select('user_id, in_round_robin, is_active')
    .eq('institution_id', institutionId)
    .eq('is_active', true);
  const ids = (assigns || []).filter((a) => a.in_round_robin !== false).map((a) => String(a.user_id));
  if (!ids.length) return [];
  const { data: users } = await supabaseAdmin.from('users').select('id, name, is_active').in('id', ids);
  return (users || [])
    .filter((u) => u.is_active !== false)
    .map((u) => ({ id: String(u.id), name: u.name || 'Temsilci' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr') || a.id.localeCompare(b.id));
}

/** Saf: sıradaki temsilci (son atanandan sonraki; listede yoksa ilk) */
export function nextInRotation(agentIds, lastId) {
  if (!agentIds.length) return null;
  const idx = agentIds.indexOf(String(lastId || ''));
  return agentIds[(idx + 1) % agentIds.length];
}

export async function pickNextAgent(institutionId) {
  const settings = await getCrmSettings(institutionId);
  if (!settings.round_robin_enabled) return null;
  const agents = await listRoundRobinAgents(institutionId);
  // Vardiya tanımlıysa yalnız o an görevde olanlar sıraya girer (kimse görevde değilse herkes)
  let pool = agents;
  try {
    const { getOnDutyUserIds } = await import('./crm-shifts.js');
    const onDuty = await getOnDutyUserIds(institutionId);
    if (Array.isArray(onDuty) && onDuty.length) {
      const filtered = agents.filter((a) => onDuty.includes(a.id));
      if (filtered.length) pool = filtered;
    }
  } catch {
    /* vardiya okunamazsa eski davranış */
  }
  const next = nextInRotation(
    pool.map((a) => a.id),
    settings.rr_last_user_id
  );
  if (!next) return null;
  await supabaseAdmin
    .from('crm_settings')
    .upsert(
      { institution_id: String(institutionId), rr_last_user_id: next, updated_at: new Date().toISOString() },
      { onConflict: 'institution_id' }
    );
  return next;
}

/** Aday atanmamışsa sıradaki temsilciye ver; bağlı sohbetler de aynı temsilciye geçer */
export async function assignLeadIfUnassigned(leadId, institutionId) {
  if (!leadId || !institutionId) return null;
  const { data: lead } = await supabaseAdmin
    .from('registration_leads')
    .select('id, assigned_user_id, is_internal, primary_status')
    .eq('id', leadId)
    .maybeSingle();
  if (!lead || lead.assigned_user_id || lead.is_internal) return lead?.assigned_user_id || null;
  const uid = await pickNextAgent(institutionId);
  if (!uid) return null;
  await supabaseAdmin.from('registration_leads').update({ assigned_user_id: uid }).eq('id', leadId).is('assigned_user_id', null);
  await supabaseAdmin
    .from('crm_conversations')
    .update({ assigned_user_id: uid })
    .eq('lead_id', leadId)
    .is('assigned_user_id', null);
  return uid;
}

/** Sohbet atanmamışsa: bağlı adayın temsilcisi, yoksa sıradaki temsilci */
export async function assignConversationIfUnassigned(conversation) {
  if (!conversation?.id || conversation.assigned_user_id || conversation.is_internal) return null;
  const inst = conversation.institution_id;
  let uid = null;
  if (conversation.lead_id) {
    const { data: lead } = await supabaseAdmin
      .from('registration_leads')
      .select('id, assigned_user_id, is_internal')
      .eq('id', conversation.lead_id)
      .maybeSingle();
    if (lead?.is_internal) return null;
    uid = lead?.assigned_user_id || (lead ? await assignLeadIfUnassigned(lead.id, inst) : null);
  }
  if (!uid) uid = await pickNextAgent(inst);
  if (!uid) return null;
  await supabaseAdmin
    .from('crm_conversations')
    .update({ assigned_user_id: uid })
    .eq('id', conversation.id)
    .is('assigned_user_id', null);
  return uid;
}

/** Elle devir: aday ↔ sohbet aynı temsilcide kalsın */
export async function syncLeadConversationsAssignee(leadId, userId) {
  if (!leadId) return;
  await supabaseAdmin.from('crm_conversations').update({ assigned_user_id: userId || null }).eq('lead_id', leadId);
}

export async function syncConversationLeadAssignee(conversationId, userId) {
  const { data: conv } = await supabaseAdmin
    .from('crm_conversations')
    .select('lead_id')
    .eq('id', conversationId)
    .maybeSingle();
  if (conv?.lead_id) {
    await supabaseAdmin.from('registration_leads').update({ assigned_user_id: userId || null }).eq('id', conv.lead_id);
  }
}

/** Yönetici: atanmamış takipteki adaylar ve açık sohbetler sırayla dağıtılır */
export async function distributeUnassigned(institutionId) {
  const agents = await listRoundRobinAgents(institutionId);
  if (!agents.length) return { ok: false, error: 'Dağıtıma dahil aktif temsilci yok' };
  const ids = agents.map((a) => a.id);
  const settings = await getCrmSettings(institutionId);
  let last = settings.rr_last_user_id;
  const perAgent = Object.fromEntries(ids.map((id) => [id, 0]));

  const { data: leads } = await supabaseAdmin
    .from('registration_leads')
    .select('id')
    .eq('institution_id', institutionId)
    .eq('primary_status', 'tracking')
    .eq('is_internal', false)
    .is('assigned_user_id', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(2000);
  for (const l of leads || []) {
    last = nextInRotation(ids, last);
    await supabaseAdmin.from('registration_leads').update({ assigned_user_id: last }).eq('id', l.id).is('assigned_user_id', null);
    await supabaseAdmin.from('crm_conversations').update({ assigned_user_id: last }).eq('lead_id', l.id).is('assigned_user_id', null);
    perAgent[last] += 1;
  }

  const { data: convs } = await supabaseAdmin
    .from('crm_conversations')
    .select('id, lead_id')
    .eq('institution_id', institutionId)
    .eq('is_internal', false)
    .in('status', ['open', 'pending'])
    .is('assigned_user_id', null)
    .limit(2000);
  let convAssigned = 0;
  for (const c of convs || []) {
    let uid = null;
    if (c.lead_id) {
      const { data: lead } = await supabaseAdmin.from('registration_leads').select('assigned_user_id').eq('id', c.lead_id).maybeSingle();
      uid = lead?.assigned_user_id || null;
    }
    if (!uid) {
      last = nextInRotation(ids, last);
      uid = last;
      perAgent[uid] += 1;
    }
    await supabaseAdmin.from('crm_conversations').update({ assigned_user_id: uid }).eq('id', c.id).is('assigned_user_id', null);
    convAssigned += 1;
  }

  await updateCrmSettings(institutionId, { rr_last_user_id: last });
  return {
    ok: true,
    leads_assigned: (leads || []).length,
    conversations_assigned: convAssigned,
    per_agent: agents.map((a) => ({ ...a, count: perAgent[a.id] || 0 }))
  };
}
