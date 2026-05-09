import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { enrichStudentActor } from '../api/_lib/enrich-student-actor.js';
import {
  getMetaWhatsAppEnvStatus,
  normalizePhoneToE164,
  sendMetaTextMessage,
  parseMetaSendError
} from '../api/_lib/meta-whatsapp.js';

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }
  actor = await enrichStudentActor(actor);

  const role = String(actor.role || '').trim();
  const allowed =
    role === 'super_admin' || role === 'admin' || role === 'coach' || role === 'teacher';
  if (!allowed) {
    return res.status(403).json({
      error: 'forbidden',
      hint: 'Meta WhatsApp yalnızca yönetici, koç veya öğretmen oturumu içindir.'
    });
  }

  if (req.method === 'GET') {
    return res.status(200).json({ data: getMetaWhatsAppEnvStatus() });
  }

  if (req.method === 'POST') {
    const b = req.body || {};
    const to = typeof b.to === 'string' ? b.to.trim() : '';
    const message = typeof b.message === 'string' ? b.message : '';
    if (!to || !message) {
      return res.status(400).json({ error: 'to and message required' });
    }
    const e164 = normalizePhoneToE164(to);
    if (!e164) {
      return res.status(400).json({ error: 'invalid_phone' });
    }

    if (role === 'coach' && !actor.coach_id) {
      return res.status(403).json({
        error: 'coach_id_required',
        hint: 'Koç hesabı veritabanıyla eşleşmedi. Çıkış yapıp tekrar giriş yapın veya yöneticinizin coaches kaydınızı e-postanızla eşlemesini isteyin.'
      });
    }

    try {
      const { messageId } = await sendMetaTextMessage({ toE164: e164, text: message });
      return res.status(200).json({ ok: true, sid: messageId || null });
    } catch (e) {
      const parsed = parseMetaSendError(e);
      return res.status(500).json({ ok: false, error: parsed.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
