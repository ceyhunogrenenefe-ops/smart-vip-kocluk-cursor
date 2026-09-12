/**
 * Edesis deneme atama şemasını bir kez kurar (cron / x-vercel-cron).
 * Her sınav için tablo yok — SQL tabloları veya Storage JSON yedek.
 */
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { ensureEdesisExamAssignmentSchema } from '../api/_lib/edesis-exam-assignments.js';
import { errorMessage } from '../api/_lib/error-msg.js';

function envDiagnostics() {
  return {
    has_supabase_url: Boolean(
      String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
    ),
    has_supabase_db_url: Boolean(String(process.env.SUPABASE_DB_URL || '').trim()),
    has_database_url: Boolean(String(process.env.DATABASE_URL || '').trim()),
    has_postgres_url: Boolean(String(process.env.POSTGRES_URL || '').trim()),
    has_postgres_prisma_url: Boolean(String(process.env.POSTGRES_PRISMA_URL || '').trim()),
    has_postgres_url_non_pooling: Boolean(
      String(process.env.POSTGRES_URL_NON_POOLING || '').trim()
    ),
    has_supabase_db_password: Boolean(String(process.env.SUPABASE_DB_PASSWORD || '').trim()),
    has_postgres_password: Boolean(String(process.env.POSTGRES_PASSWORD || '').trim())
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized', reason: auth.reason });

  const force =
    String(req.query?.force || req.body?.force || '').trim() === '1' ||
    String(req.query?.force || req.body?.force || '').toLowerCase() === 'true';

  try {
    const result = await ensureEdesisExamAssignmentSchema({ force });
    const via = result?.via || null;
    return res.status(200).json({
      ok: true,
      created: Boolean(result?.created),
      cached: Boolean(result?.cached),
      via,
      force,
      env: envDiagnostics(),
      backend: via,
      message:
        via === 'storage'
          ? result?.created
            ? 'Edesis atama Storage yedeği kuruldu (DB şifresi yok; JSON).'
            : 'Edesis atama Storage yedeği hazır.'
          : result?.created
            ? 'Edesis deneme atama tabloları oluşturuldu.'
            : 'Edesis deneme atama tabloları zaten hazır.'
    });
  } catch (e) {
    const code = e?.code || e?.setupCode || 'schema_setup_failed';
    const status = code === 'SCHEMA_MISSING' || code === 'missing_db_url' ? 503 : 500;
    return res.status(status).json({
      ok: false,
      error: code,
      message: e?.hint || errorMessage(e),
      force,
      env: envDiagnostics()
    });
  }
}
