import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { enrichStudentActor } from '../api/_lib/enrich-student-actor.js';
import { getTwilioEnvStatus, sendMeetingWhatsApp, normalizePhoneToE164 } from '../api/_lib/whatsapp-twilio.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { getIstanbulDateString } from '../api/_lib/istanbul-time.js';

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }
  actor = await enrichStudentActor(actor);

  const role = String(actor.role || '').trim();
  if (role !== 'super_admin' && role !== 'admin') {
    return res.status(403).json({ error: 'forbidden', hint: 'Yalnızca admin / süper admin.' });
  }

  if (req.method === 'GET') {
    return res.status(200).json({ data: getTwilioEnvStatus() });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const b = req.body || {};
  const rawPhone = typeof b.phone === 'string' ? b.phone : typeof b.to === 'string' ? b.to : '';
  const message = typeof b.message === 'string' ? b.message.trim() : '';
  const to = rawPhone.trim();

  if (!to || !message) {
    return res.status(400).json({ error: 'phone ve message gerekli' });
  }

  const e164 = normalizePhoneToE164(to);
  if (!e164) {
    return res.status(400).json({ error: 'invalid_phone' });
  }

  const today = getIstanbulDateString();
  const statusRef = { sid: null, err: null };

  try {
    const { sid } = await sendMeetingWhatsApp(e164, message);
    statusRef.sid = sid;
    try {
      await supabaseAdmin.from('message_logs').insert({
        student_id: null,
        kind: 'manual_whatsapp',
        related_id: null,
        message,
        status: 'sent',
        log_date: today,
        error: null,
        phone: e164
      });
    } catch (logErr) {
      console.warn('[whatsapp-send] log insert', logErr?.message || logErr);
    }
    return res.status(200).json({ ok: true, sid: statusRef.sid });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    statusRef.err = errMsg;
    try {
      await supabaseAdmin.from('message_logs').insert({
        student_id: null,
        kind: 'manual_whatsapp',
        related_id: null,
        message,
        status: 'failed',
        log_date: today,
        error: errMsg,
        phone: e164
      });
    } catch (logErr) {
      console.warn('[whatsapp-send] failed log insert', logErr?.message || logErr);
    }
    return res.status(500).json({ ok: false, error: errMsg });
  }
}
