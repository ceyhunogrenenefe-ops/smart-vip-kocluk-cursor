import { supabaseAdmin } from './supabase-admin.js';

/**
 * @param {{
 *   jobKey: string,
 *   ok?: boolean,
 *   skipped?: string | null,
 *   messagesSent?: number,
 *   messagesFailed?: number,
 *   detail?: Record<string, unknown> | null
 * }} p
 */
export async function recordCronRun(p) {
  const jobKey = String(p.jobKey || '').trim();
  if (!jobKey) return;
  try {
    const { error } = await supabaseAdmin.from('cron_run_log').insert({
      job_key: jobKey,
      ok: p.ok !== false,
      skipped: p.skipped || null,
      messages_sent: Math.max(0, Number(p.messagesSent) || 0),
      messages_failed: Math.max(0, Number(p.messagesFailed) || 0),
      detail: p.detail && typeof p.detail === 'object' ? p.detail : null
    });
    if (error) console.warn('[cron-run-log] insert failed', jobKey, error.message);
  } catch (e) {
    console.warn('[cron-run-log]', jobKey, e instanceof Error ? e.message : String(e));
  }
}
