/** GET/POST /api/cron/seed-kitap-set — idempotent kitap set seed (cron secret) */
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { ensureKitapSetSeeds } from '../api/_lib/kitap-set-seeds.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized cron' });

  try {
    const onlyRaw = String(req.query?.only || '').trim();
    const only = onlyRaw ? onlyRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    const results = await ensureKitapSetSeeds(supabaseAdmin, { only });
    return res.status(200).json({ ok: true, results });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
