/**
 * FAZ 3 — takip / hatırlatma planları.
 * Aşama değişince önerilen takip görevleri (ör. Eşiyle görüşecek → 3 gün sonra ara).
 * Planlar crm_settings.follow_up_rules ile yöneticiden değiştirilebilir.
 * Hiçbir müşteri mesajı otomatik gönderilmez; yalnız temsilciye görev açılır.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { STAGE_LABELS, TASK_TYPES } from './registration-tracking-utils.js';

/** @typedef {{ days: number, task_type: string, title: string }} FollowUpStep */

/** @type {Record<string, FollowUpStep[]>} */
export const DEFAULT_FOLLOW_UP_RULES = {
  spouse_discussion: [{ days: 3, task_type: 'call_parent', title: 'Eşiyle görüştü mü? Ara' }],
  considering: [
    { days: 3, task_type: 'whatsapp', title: '1. takip mesajı' },
    { days: 7, task_type: 'call_parent', title: '2. takip — ara' },
    { days: 15, task_type: 'whatsapp', title: '3. takip mesajı' },
    { days: 30, task_type: 're_evaluate', title: 'Yeniden değerlendirme' }
  ],
  program_offered: [{ days: 2, task_type: 'whatsapp', title: 'Program sonrası takip' }],
  offer_sent: [{ days: 2, task_type: 'call_parent', title: 'Fiyat sonrası takip — ara' }],
  follow_up: [{ days: 3, task_type: 'call_parent', title: 'Takip araması' }],
  no_response: [
    { days: 2, task_type: 'whatsapp', title: 'Tekrar mesaj gönder' },
    { days: 5, task_type: 'call_parent', title: 'Aramayı dene' }
  ],
  unreachable: [{ days: 3, task_type: 'call_parent', title: 'Tekrar aramayı dene' }],
  registration_pending: [{ days: 1, task_type: 'call_parent', title: 'Kayıt için ara' }],
  payment_pending: [{ days: 1, task_type: 'payment_followup', title: 'Ödeme kontrolü' }]
};

/** Saf: kural listesini doğrula (bozuk kayıt görev açmasın) */
export function sanitizeFollowUpRules(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [stage, steps] of Object.entries(raw)) {
    if (!STAGE_LABELS[stage] || !Array.isArray(steps)) continue;
    const clean = steps
      .map((s) => ({
        days: Math.round(Number(s?.days)),
        task_type: TASK_TYPES.includes(s?.task_type) ? s.task_type : 'call_parent',
        title: String(s?.title || '').trim().slice(0, 120)
      }))
      .filter((s) => Number.isFinite(s.days) && s.days >= 0 && s.days <= 365)
      .map((s) => ({ ...s, title: s.title || `${STAGE_LABELS[stage]} takibi` }))
      .slice(0, 8);
    out[stage] = clean;
  }
  return out;
}

/** Varsayılanlar + kurum ayarı (ayarda boş liste = o aşama için plan yok) */
export function mergeFollowUpRules(custom) {
  return { ...DEFAULT_FOLLOW_UP_RULES, ...sanitizeFollowUpRules(custom) };
}

function istanbulYmdPlusDays(days, nowMs = Date.now()) {
  const ist = new Date(nowMs + 3 * 3600 * 1000 + days * 86400000);
  return ist.toISOString().slice(0, 10);
}

/**
 * Saf: aşama için görev planı. Görev günün 10:00'unda (TR); 0 gün = bugün, saat geçtiyse 1 saat sonra.
 * @returns {Array<FollowUpStep & { due_at: string }>}
 */
export function planFollowUps(stage, rules, nowMs = Date.now()) {
  const steps = rules?.[stage] || [];
  return steps.map((s) => {
    let due = new Date(`${istanbulYmdPlusDays(s.days, nowMs)}T10:00:00+03:00`).getTime();
    if (due <= nowMs) due = nowMs + 3600 * 1000;
    return { ...s, due_at: new Date(due).toISOString() };
  });
}

export async function getFollowUpRules(institutionId) {
  const { data } = await supabaseAdmin
    .from('crm_settings')
    .select('follow_up_rules')
    .eq('institution_id', String(institutionId || ''))
    .maybeSingle();
  return mergeFollowUpRules(data?.follow_up_rules || null);
}

export async function saveFollowUpRules(institutionId, rules, actorId) {
  const clean = sanitizeFollowUpRules(rules);
  const { error } = await supabaseAdmin.from('crm_settings').upsert(
    {
      institution_id: String(institutionId),
      follow_up_rules: clean,
      updated_by: actorId || null,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'institution_id' }
  );
  if (error) throw error;
  return mergeFollowUpRules(clean);
}

/**
 * Aşamanın takip planını göreve çevirir. Aynı adayın bekleyen eski otomatik takipleri
 * (başka aşamadan) iptal edilir; elle açılan görevlere dokunulmaz.
 */
export async function createFollowUpTasks({ leadId, stage, institutionId, actorId, steps = null }) {
  const { data: lead } = await supabaseAdmin
    .from('registration_leads')
    .select('id, assigned_user_id, full_name')
    .eq('id', leadId)
    .eq('institution_id', institutionId)
    .maybeSingle();
  if (!lead) throw new Error('Aday bulunamadı');

  const plan = steps?.length ? steps : planFollowUps(stage, await getFollowUpRules(institutionId));
  if (!plan.length) return { created: [], cancelled: 0 };

  const { data: cancelled } = await supabaseAdmin
    .from('registration_tasks')
    .update({ status: 'cancelled', updated_by: actorId || null, updated_at: new Date().toISOString() })
    .eq('lead_id', leadId)
    .eq('auto_generated', true)
    .in('status', ['pending', 'overdue'])
    .neq('follow_up_stage', stage)
    .select('id');

  const assignee = lead.assigned_user_id || actorId || null;
  const created = [];
  for (let i = 0; i < plan.length; i += 1) {
    const s = plan[i];
    const key = `followup:${leadId}:${stage}:${i}:${String(s.due_at).slice(0, 10)}`;
    const { data: dup } = await supabaseAdmin.from('registration_tasks').select('id').eq('deduplication_key', key).maybeSingle();
    if (dup?.id) continue;
    const { data, error } = await supabaseAdmin
      .from('registration_tasks')
      .insert({
        lead_id: leadId,
        institution_id: institutionId,
        assigned_to: assignee,
        title: s.title,
        description: `${STAGE_LABELS[stage] || stage} takip planı (${i + 1}/${plan.length})`,
        task_type: TASK_TYPES.includes(s.task_type) ? s.task_type : 'call_parent',
        priority: 'normal',
        status: 'pending',
        due_at: s.due_at,
        deduplication_key: key,
        auto_generated: true,
        follow_up_stage: stage,
        created_by: actorId || null
      })
      .select('id, title, due_at, task_type')
      .single();
    if (error) throw error;
    created.push(data);
  }

  if (created.length) {
    await supabaseAdmin
      .from('registration_leads')
      .update({
        next_action_at: created[0].due_at,
        next_action_type: created[0].task_type,
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId);
  }
  return { created, cancelled: (cancelled || []).length };
}

/** Müşteri yeniden yazdı: bekleyen otomatik takipler “yeniden değerlendir” olarak işaretlenir */
export async function flagFollowUpsForReview(leadId, at = new Date().toISOString()) {
  if (!leadId) return 0;
  const when = new Date(at).toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  const { data, error } = await supabaseAdmin
    .from('registration_tasks')
    .update({ review_required: true, review_reason: `Müşteri ${when} tarihinde yeniden yazdı` })
    .eq('lead_id', leadId)
    .eq('auto_generated', true)
    .eq('review_required', false)
    .in('status', ['pending', 'overdue'])
    .select('id');
  if (error) {
    if (!/review_required|auto_generated|column/i.test(error.message || '')) {
      console.warn('[crm-follow-up] review flag:', error.message);
    }
    return 0;
  }
  return (data || []).length;
}
