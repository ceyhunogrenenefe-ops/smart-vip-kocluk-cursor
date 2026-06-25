import { verifyBbbGuestJoinToken, decodeGuestJoinSlug, normalizeGuestJoinToken } from '../api/_lib/bbb-guest-token.js';
import { resolveGuestBbbJoinUrl } from '../api/_lib/bbb-guest-join-core.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { applyCors, handleCorsPreflight } from '../api/_lib/cors-mobile.js';

export default async function handler(req, res) {
  if (handleCorsPreflight(req, res)) return;
  applyCors(req, res);

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawToken =
    req.query?.slug ||
    req.query?.t ||
    req.query?.token ||
    (req.body && typeof req.body === 'object' ? req.body.token || req.body.slug : '') ||
    '';
  const token = decodeGuestJoinSlug(rawToken) || normalizeGuestJoinToken(rawToken);
  const guestName = String(
    req.query?.name ||
      req.query?.fullName ||
      (req.body && typeof req.body === 'object' ? req.body.name || req.body.fullName : '') ||
      'Misafir'
  ).trim();

  if (!token) return res.status(400).json({ error: 'Davet bağlantısı eksik.', code: 'token_missing' });

  let payload;
  try {
    payload = verifyBbbGuestJoinToken(token);
  } catch (e) {
    return res.status(401).json({ error: errorMessage(e) || 'Geçersiz davet.', code: 'token_invalid' });
  }

  const metaOnly = String(req.query?.meta || '').trim() === '1';
  if (metaOnly) {
    return res.status(200).json({ ok: true, kind: payload.kind, id: payload.id, exp: payload.exp });
  }

  try {
    const result = await resolveGuestBbbJoinUrl({
      kind: payload.kind,
      id: payload.id,
      guestName
    });
    const redirect = String(req.query?.redirect || '').trim() === '1';
    if (redirect) {
      res.writeHead(302, { Location: result.url });
      return res.end();
    }
    return res.status(200).json({ ok: true, url: result.url, title: result.title });
  } catch (e) {
    const msg = errorMessage(e) || 'Katılım başarısız';
    return res.status(400).json({ error: msg, code: 'guest_join_failed' });
  }
}
