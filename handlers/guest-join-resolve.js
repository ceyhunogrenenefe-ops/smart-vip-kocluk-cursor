import { resolveGuestJoinShortCode } from '../api/_lib/guest-join-short-link.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const code = String(req.query?.code || '').trim().toLowerCase();
  if (!code) return res.status(400).json({ error: 'code gerekli' });

  try {
    const row = await resolveGuestJoinShortCode(code);
    if (!row) return res.status(404).json({ error: 'Davet bağlantısı bulunamadı veya süresi dolmuş.' });
    return res.status(200).json({
      ok: true,
      token: String(row.guest_token || ''),
      kind: row.kind === 'private' ? 'private' : 'class',
      resourceId: String(row.resource_id || '')
    });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
}
