import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { enrichStudentActor } from '../api/_lib/enrich-student-actor.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { getIstanbulDateString } from '../api/_lib/istanbul-time.js';
import { normalizePhoneToE164 } from '../api/_lib/phone-whatsapp.js';
import { normalizedUserRolesFromDb } from '../api/_lib/user-roles-fetch.js';
import {
  getGatewaySessionStatus,
  sendGatewayTextMessage,
  warmGatewaySession
} from '../api/_lib/whatsapp-gateway-send.js';

function parseBody(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b || '{}');
    } catch {
      return {};
    }
  }
  return {};
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }
  actor = await enrichStudentActor(actor);

  const roles = await normalizedUserRolesFromDb(actor.sub);
  const roleSet = new Set(roles.map((r) => String(r || '').toLowerCase()));
  const isCoach = roleSet.has('coach');
  const isAdmin = roleSet.has('admin') || roleSet.has('super_admin');
  const isTeacher = roleSet.has('teacher');

  if (!isCoach && !isAdmin && !isTeacher) {
    return res.status(403).json({ error: 'forbidden', hint: 'Bu uç koç, öğretmen veya yönetici içindir.' });
  }

  const body = parseBody(req);
  const rawPhone = String(body.phone || body.to || '').trim();
  const message = String(
    body.message || 'Merhaba, koç paneli WhatsApp bağlantı test mesajı.'
  ).trim();

  if (!rawPhone) {
    return res.status(400).json({ error: 'phone_required', hint: 'Test numarası girin (örn. 905551112233).' });
  }
  if (!message) {
    return res.status(400).json({ error: 'message_required' });
  }

  const e164 = normalizePhoneToE164(rawPhone);
  if (!e164) {
    return res.status(400).json({ error: 'invalid_phone', hint: 'Geçerli TR cep numarası girin (05xx veya 905xx).' });
  }

  const sessionId = String(actor.sub || '').trim();
  if (!sessionId) {
    return res.status(400).json({ error: 'session_id_missing', hint: 'Çıkış yapıp tekrar giriş yapın.' });
  }

  const st = await getGatewaySessionStatus(sessionId, { skipHealth: false });
  if (!st.ok || st.status !== 'connected') {
    const warmed = await warmGatewaySession(sessionId, { waitMs: 10000 });
    if (!warmed.ok) {
      return res.status(409).json({
        ok: false,
        error: 'session_not_connected',
        gateway_status: st.status || warmed.status || 'unknown',
        hint:
          'WhatsApp oturumu bağlı değil. Yukarıdan QR ile bağlayın veya «Oturumu sıfırla ve QR al» kullanın.'
      });
    }
  }

  const sent = await sendGatewayTextMessage({
    phone: e164,
    message,
    sessionId,
    sessionCandidates: [sessionId],
    allowSharedFallback: false
  });

  const today = getIstanbulDateString();
  try {
    await supabaseAdmin.from('message_logs').insert({
      student_id: null,
      kind: 'gateway_test',
      related_id: null,
      message: message.slice(0, 500),
      status: sent.ok ? 'sent' : 'failed',
      log_date: today,
      error: sent.ok ? null : sent.error || null,
      phone: e164,
      meta_message_id: sent.gateway_message_id || sent.sid || null
    });
  } catch (e) {
    console.warn('[coach-whatsapp-test-send] log', e?.message || e);
  }

  if (!sent.ok) {
    return res.status(400).json({
      ok: false,
      error: sent.error || 'gateway_send_failed',
      errorCode: sent.errorCode || null,
      gateway_status: st.status || null,
      hint:
        sent.errorCode === 'GATEWAY_NOT_CONNECTED' || sent.error === 'session_not_connected'
          ? 'QR oturumu bağlı değil — Kişisel WhatsApp oturumu bölümünden bağlayın.'
          : 'Gateway gönderimi başarısız. Sağlık testi ile VPS erişimini kontrol edin.'
    });
  }

  return res.status(200).json({
    ok: true,
    message_id: sent.gateway_message_id || sent.sid || null,
    phone: e164,
    channel: 'coach_gateway',
    gateway_session_id: sent.gateway_session_id || sessionId,
    delivery_verified: true
  });
}
