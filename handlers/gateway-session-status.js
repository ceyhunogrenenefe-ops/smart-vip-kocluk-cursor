/**
 * Yönetici: başka bir hesabın WhatsApp gateway oturum durumu.
 * Gateway, JWT sahibinden başka oturumu sorgulatmıyor (coach_scope_mismatch); süper admin
 * kurum panellerine geçtiğinde o hesabın bağlı olup olmadığını göremiyordu.
 * GET /api/gateway-session-status?userId=...  (admin / super_admin; kendi oturumu herkese açık)
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { actorRoleSet } from '../api/_lib/actor-roles.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { getGatewaySessionStatus } from '../api/_lib/whatsapp-gateway-send.js';
import { errorMessage } from '../api/_lib/error-msg.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }

  const target = String(req.query?.userId || '').trim() || String(actor.sub || '').trim();
  if (!target) return res.status(400).json({ error: 'userId_required' });

  if (target !== String(actor.sub || '')) {
    const roles = await actorRoleSet(actor);
    const isAdmin =
      roles.has('admin') || roles.has('super_admin') || ['admin', 'super_admin'].includes(String(actor.role || ''));
    if (!isAdmin) return res.status(403).json({ error: 'forbidden' });
  }

  try {
    const [{ data: user }, status] = await Promise.all([
      supabaseAdmin.from('users').select('id, name, email, role').eq('id', target).maybeSingle(),
      getGatewaySessionStatus(target).catch((e) => ({ ok: false, status: 'error', error: errorMessage(e) }))
    ]);
    return res.status(200).json({
      userId: target,
      user: user ? { id: user.id, name: user.name, email: user.email, role: user.role } : null,
      connected: Boolean(status?.ok),
      status: status?.status || 'unknown',
      error: status?.ok ? null : status?.error || null
    });
  } catch (e) {
    return res.status(500).json({ error: 'server_error', message: errorMessage(e) });
  }
}
