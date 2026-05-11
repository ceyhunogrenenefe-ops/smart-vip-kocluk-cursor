import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';

/** Süper admin: veli sözleşmesi vb. ekranlarda kurum seçimi için id + ad listesi */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }

  if (actor.role !== 'super_admin') return res.status(403).json({ error: 'forbidden' });

  try {
    const { data, error } = await supabaseAdmin.from('institutions').select('id,name').order('name', { ascending: true }).limit(500);
    if (error) throw error;
    const rows = (data || []).map((r) => ({
      id: String(r.id || ''),
      name: String(r.name || '').trim() || '(Adsız)'
    }));
    return res.status(200).json({ data: rows });
  } catch (e) {
    console.error('[institutions-list]', errorMessage(e), e);
    return res.status(500).json({ error: errorMessage(e) });
  }
}
