import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { enrichStudentActor } from '../api/_lib/enrich-student-actor.js';
import { getTwilioEnvStatus, sendMeetingWhatsApp } from '../api/_lib/whatsapp-twilio.js';

function normalizeToE164(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('90') && digits.length >= 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `+90${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('5')) return `+90${digits}`;
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  return `+${digits}`;
}

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
    return res.status(403).json({ error: 'forbidden', hint: 'Twilio yalnızca yönetici, koç veya öğretmen oturumu içindir.' });
  }

  if (req.method === 'GET') {
    return res.status(200).json({ data: getTwilioEnvStatus() });
  }

  if (req.method === 'POST') {
    const b = req.body || {};
    const to = typeof b.to === 'string' ? b.to.trim() : '';
    const message = typeof b.message === 'string' ? b.message : '';
    if (!to || !message) {
      return res.status(400).json({ error: 'to and message required' });
    }
    const e164 = normalizeToE164(to);
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
      const { sid } = await sendMeetingWhatsApp(e164, message);
      return res.status(200).json({ ok: true, sid });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(500).json({ ok: false, error: msg });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
