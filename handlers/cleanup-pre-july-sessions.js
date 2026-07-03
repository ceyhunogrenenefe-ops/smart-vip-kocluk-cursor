import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { cleanupPreJulyClassSessions } from '../api/_lib/cleanup-pre-july-sessions.js';
import { errorMessage } from '../api/_lib/error-msg.js';

function isAuthorized(req) {
  const cron = authorizeVercelOrCronSecret(req);
  if (cron.ok) return true;
  try {
    const actor = requireAuthenticatedActor(req);
    return String(actor.role || '').toLowerCase() === 'super_admin';
  } catch {
    return false;
  }
}

/**
 * POST { dryRun: true } — önizleme
 * POST { execute: true, cutoff?: "2026-07-01" } — sil
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = req.body || {};
  const isPreview = body.dryRun === true || body.dry_run === true || body.preview === true;
  const isExecute = body.execute === true;
  if (isPreview && isExecute) {
    return res.status(400).json({ error: 'dryRun ve execute aynı istekte olamaz' });
  }
  if (!isPreview && !isExecute) {
    return res.status(400).json({
      error: 'Gövde: { "dryRun": true } veya { "execute": true, "cutoff": "2026-07-01" }'
    });
  }

  const cutoff = String(body.cutoff || '2026-07-01').trim().slice(0, 10);

  try {
    const result = await cleanupPreJulyClassSessions({ cutoff, dryRun: !isExecute });
    return res.status(200).json({
      ok: true,
      message: isExecute
        ? `${result.deleted} oturum silindi (lesson_date < ${cutoff}).`
        : `${result.total} oturum silinecek (önizleme).`,
      ...result
    });
  } catch (e) {
    console.error('[cleanup-pre-july-sessions]', errorMessage(e), e);
    return res.status(500).json({ error: errorMessage(e) || 'cleanup_failed' });
  }
}
