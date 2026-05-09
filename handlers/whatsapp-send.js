import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { enrichStudentActor } from '../api/_lib/enrich-student-actor.js';
import {
  getMetaWhatsAppEnvStatus,
  normalizePhoneToE164,
  sendMetaTextMessage,
  parseMetaSendError
} from '../api/_lib/meta-whatsapp.js';
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
    return res.status(200).json({ data: getMetaWhatsAppEnvStatus() });
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

  try {
    const { messageId } = await sendMetaTextMessage({ toE164: e164, text: message });
    const sid = messageId || null;
    try {
      await supabaseAdmin.from('message_logs').insert({
        student_id: null,
        kind: 'manual_whatsapp',
        related_id: null,
        message,
        status: 'sent',
        log_date: today,
        error: null,
        phone: e164,
        twilio_sid: null,
        twilio_error_code: null,
        twilio_content_sid: null,
        meta_message_id: sid,
        meta_template_name: null
      });
    } catch (logErr) {
      console.warn('[whatsapp-send] log insert', logErr?.message || logErr);
    }
    return res.status(200).json({ ok: true, sid });
  } catch (e) {
    const parsed = parseMetaSendError(e);
    const errMsg = parsed.message;
    try {
      await supabaseAdmin.from('message_logs').insert({
        student_id: null,
        kind: 'manual_whatsapp',
        related_id: null,
        message,
        status: 'failed',
        log_date: today,
        error: errMsg,
        phone: e164,
        twilio_sid: null,
        twilio_error_code: parsed.code != null ? String(parsed.code) : null,
        twilio_content_sid: null,
        meta_message_id: null,
        meta_template_name: null
      });
    } catch (logErr) {
      console.warn('[whatsapp-send] failed log insert', logErr?.message || logErr);
    }
    return res.status(500).json({ ok: false, error: errMsg });
  }
}
