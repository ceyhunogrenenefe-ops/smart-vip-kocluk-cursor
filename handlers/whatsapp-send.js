import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { enrichStudentActor } from '../api/_lib/enrich-student-actor.js';
import { getTwilioEnvStatus, sendMeetingWhatsApp, normalizePhoneToE164 } from '../api/_lib/whatsapp-twilio.js';
import {
  getMetaWhatsAppEnvStatus,
  metaWhatsAppConfigured,
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
    const meta = getMetaWhatsAppEnvStatus();
    const twilio = getTwilioEnvStatus();
    return res.status(200).json({
      data: {
        meta,
        twilio,
        active_provider: metaWhatsAppConfigured()
          ? 'meta_cloud_api'
          : twilio.configured
            ? 'twilio'
            : null
      }
    });
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
  const useMeta = metaWhatsAppConfigured();

  if (!useMeta && !getTwilioEnvStatus().configured) {
    return res.status(503).json({
      ok: false,
      error: 'whatsapp_not_configured',
      hint:
        'Vercel Production’da META_WHATSAPP_TOKEN ve META_PHONE_NUMBER_ID dolu olmalı (boş env satırı yetmez). Kaydettikten sonra Redeploy.'
    });
  }

  try {
    let sid = null;
    let channel = useMeta ? 'meta_cloud_api' : 'twilio';

    if (useMeta) {
      const { messageId } = await sendMetaTextMessage({ toE164: e164, text: message });
      sid = messageId;
    } else {
      const r = await sendMeetingWhatsApp(e164, message);
      sid = r.sid;
    }

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
        meta_message_id: useMeta ? sid : null,
        twilio_sid: useMeta ? null : sid
      });
    } catch (logErr) {
      console.warn('[whatsapp-send] log insert', logErr?.message || logErr);
    }
    return res.status(200).json({ ok: true, sid, channel });
  } catch (e) {
    const errMsg = useMeta
      ? parseMetaSendError(e).message
      : e instanceof Error
        ? e.message
        : String(e);
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
    return res.status(500).json({ ok: false, error: errMsg, channel: useMeta ? 'meta_cloud_api' : 'twilio' });
  }
}
