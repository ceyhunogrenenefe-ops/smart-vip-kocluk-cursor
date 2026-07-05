import { supabaseAdmin } from './supabase-admin.js';

const DEFAULT_PREFS = {
  daily_report_enabled: true,
  daily_report_scope: 'all'
};

/**
 * @param {string} coachId coaches.id
 */
export async function getCoachNotificationPrefs(coachId) {
  const id = String(coachId || '').trim();
  if (!id) return { ...DEFAULT_PREFS, coach_id: null };
  const { data, error } = await supabaseAdmin
    .from('coach_whatsapp_notification_prefs')
    .select('coach_id,daily_report_enabled,daily_report_scope,updated_at')
    .eq('coach_id', id)
    .maybeSingle();
  if (error && error.code !== 'PGRST116' && error.code !== '42P01') throw error;
  if (!data) return { coach_id: id, ...DEFAULT_PREFS, updated_at: null };
  return {
    coach_id: id,
    daily_report_enabled: data.daily_report_enabled !== false,
    daily_report_scope: String(data.daily_report_scope || 'all').trim() || 'all',
    updated_at: data.updated_at || null
  };
}

export async function upsertCoachNotificationPrefs(coachId, patch) {
  const id = String(coachId || '').trim();
  if (!id) throw new Error('coach_id_required');
  const row = {
    coach_id: id,
    updated_at: new Date().toISOString()
  };
  if (patch.daily_report_enabled !== undefined) {
    row.daily_report_enabled = Boolean(patch.daily_report_enabled);
  }
  if (patch.daily_report_scope !== undefined) {
    const scope = String(patch.daily_report_scope || 'all').trim();
    row.daily_report_scope = scope === 'none' ? 'none' : 'all';
  }
  const { data, error } = await supabaseAdmin
    .from('coach_whatsapp_notification_prefs')
    .upsert(row, { onConflict: 'coach_id' })
    .select('coach_id,daily_report_enabled,daily_report_scope,updated_at')
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Günlük rapor hatırlatması bu koç için aktif mi? */
export async function coachDailyReportReminderEnabled(coachId) {
  const p = await getCoachNotificationPrefs(coachId);
  return p.daily_report_enabled !== false && p.daily_report_scope !== 'none';
}
