import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import {
  cancelHolidayGroupSessions,
  restoreHolidayGroupSessions
} from '../api/_lib/cancel-holiday-group-sessions.js';
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
 * Tatil iptali / geri alma (15 Temmuz vb.)
 * POST { dryRun: true } — iptal önizleme
 * POST { execute: true } — iptal uygula
 * POST { restore: true, dryRun: true } — geri alma önizleme
 * POST { restore: true, execute: true } — iptali geri al (cancelled → scheduled)
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = req.body || {};
  const isRestore = body.restore === true || body.revert === true;
  const isPreview = body.dryRun === true || body.dry_run === true || body.preview === true;
  const isExecute = body.execute === true;
  if (isPreview && isExecute) {
    return res.status(400).json({ error: 'dryRun ve execute aynı istekte olamaz' });
  }
  if (!isPreview && !isExecute) {
    return res.status(400).json({
      error: 'Gövde: { "dryRun": true } veya { "execute": true } (restore için restore: true ekleyin)'
    });
  }

  const lessonDate = String(body.lesson_date || body.date || '2026-07-15').trim().slice(0, 10);
  const keep = Array.isArray(body.keep) && body.keep.length ? body.keep.map(String) : undefined;

  try {
    const fn = isRestore ? restoreHolidayGroupSessions : cancelHolidayGroupSessions;
    const result = await fn({
      lessonDate,
      keepLabels: keep,
      dryRun: !isExecute
    });
    const msg = isRestore
      ? isExecute
        ? `${result.updated} oturum tekrar planlı yapıldı (${lessonDate}).`
        : `${result.restore_count} iptal edilmiş oturum geri alınacak (önizleme).`
      : isExecute
        ? `${result.updated} oturum iptal edildi (${lessonDate}; muaf: ${(result.keep_labels || []).join(', ')}).`
        : `${result.cancel_count} oturum iptal edilecek (önizleme).`;
    return res.status(200).json({ ok: true, message: msg, restore: isRestore, ...result });
  } catch (e) {
    console.error('[cancel-holiday-group-sessions]', errorMessage(e), e);
    const code = e?.code || '';
    if (code === 'no_keep_classes_matched') {
      return res.status(400).json({
        error: 'no_keep_classes_matched',
        message: 'Muaf sınıflar (8-A/B/E/F) bulunamadı.',
        classes: e.classCatalog || []
      });
    }
    return res.status(500).json({ error: errorMessage(e) || 'operation_failed' });
  }
}
