/**
 * CRM inbox tablolarını bir kez kurar (cron / CRON_SECRET).
 * GET|POST /api/setup-crm-inbox-schema
 */
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { ensureCrmInboxSchema, diagnoseCrmInbox } from '../api/_lib/crm-inbox-schema.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized', reason: auth.reason });

  const force =
    String(req.query?.force || req.body?.force || '').trim() === '1' ||
    String(req.query?.force || req.body?.force || '').toLowerCase() === 'true';
  const diagOnly = String(req.query?.diag || '').trim() === '1';

  if (diagOnly) {
    const data = await diagnoseCrmInbox();
    return res.status(200).json({ ok: data.ok, data });
  }

  try {
    const result = await ensureCrmInboxSchema({ force });
    const diag = await diagnoseCrmInbox();
    return res.status(result.ok ? 200 : 503).json({
      ok: result.ok,
      created: Boolean(result.created),
      cached: Boolean(result.cached),
      via: result.via || null,
      force,
      setup: result,
      diagnose: diag
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: e instanceof Error ? e.message : 'schema_setup_failed'
    });
  }
}
