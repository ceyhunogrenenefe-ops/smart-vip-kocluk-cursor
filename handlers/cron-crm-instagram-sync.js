import { authorizeVercelOrCronSecret, rejectUnauthorizedCron } from '../api/_lib/cron-auth.js';
import { syncInstagramConversationsFromGraph } from '../api/_lib/instagram-conversations-sync.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';
import { refreshMissingSocialProfiles } from '../api/_lib/social-profile.js';

/** IG DM backfill — webhook kaçırılan reklam / DM’leri Graph Conversations ile CRM’e alır. */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (rejectUnauthorizedCron(res, auth)) return;

  try {
    const result = await syncInstagramConversationsFromGraph({
      apply: true,
      limit: 25,
      messagesPerThread: 25
    });
    // FAZ 1: ismi / kullanıcı adı eksik konuşmaları yeniden dene (senkron başarısız olsa da çalışır)
    try {
      result.profiles = await refreshMissingSocialProfiles({ limit: 15 });
    } catch (e) {
      result.profiles = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    await recordCronRun({ jobKey: 'crm_instagram_sync', ok: Boolean(result?.ok), detail: result }).catch(
      () => {}
    );
    return res.status(result?.ok ? 200 : 502).json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cron-crm-instagram-sync] fatal', msg);
    await recordCronRun({ jobKey: 'crm_instagram_sync', ok: false, detail: { error: msg } }).catch(() => {});
    return res.status(500).json({ ok: false, error: msg });
  }
}
