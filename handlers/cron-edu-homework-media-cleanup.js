import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';
import { EDU_SUBMISSIONS_BUCKET, removeEduObject } from '../api/_lib/edu-panel-storage.js';

const RETENTION_DAYS = 7;

function submissionMediaPaths(sub) {
  const fromJson = Array.isArray(sub?.photo_paths)
    ? sub.photo_paths.map((p) => String(p || '').trim()).filter(Boolean)
    : [];
  const legacy = String(sub?.storage_path || '').trim();
  const photos = fromJson.length ? fromJson : legacy ? [legacy] : [];
  const video = String(sub?.video_path || '').trim();
  return [...photos, ...(video ? [video] : [])];
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized cron' });

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString();
  let cleaned = 0;
  let scanned = 0;
  const errors = [];

  try {
    const { data: rows, error } = await supabaseAdmin
      .from('edu_homework_submissions')
      .select('id, photo_paths, video_path, storage_path, submitted_at')
      .lt('submitted_at', cutoff)
      .limit(500);
    if (error) throw error;

    for (const sub of rows || []) {
      scanned += 1;
      const paths = submissionMediaPaths(sub);
      if (!paths.length) continue;
      for (const path of paths) {
        try {
          await removeEduObject(EDU_SUBMISSIONS_BUCKET, path);
        } catch (e) {
          errors.push({ id: sub.id, path, error: String(e?.message || e) });
        }
      }
      const { error: upErr } = await supabaseAdmin
        .from('edu_homework_submissions')
        .update({ storage_path: null, photo_paths: [], video_path: null })
        .eq('id', sub.id);
      if (upErr) {
        errors.push({ id: sub.id, error: upErr.message });
        continue;
      }
      cleaned += 1;
    }

    await recordCronRun({
      jobKey: 'edu_homework_media_cleanup',
      ok: true,
      meta: { scanned, cleaned, errors: errors.length }
    });
    return res.status(200).json({ ok: true, scanned, cleaned, errors: errors.slice(0, 20) });
  } catch (e) {
    await recordCronRun({
      jobKey: 'edu_homework_media_cleanup',
      ok: false,
      error: e instanceof Error ? e.message : String(e)
    });
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
}
