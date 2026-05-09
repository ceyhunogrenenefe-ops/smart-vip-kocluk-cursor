import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { enrichStudentActor } from '../api/_lib/enrich-student-actor.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { getIstanbulDateString } from '../api/_lib/istanbul-time.js';
import { normalizePhoneToE164 } from '../api/_lib/phone-whatsapp.js';
import { sendAutomatedWhatsApp } from '../api/_lib/whatsapp-outbound.js';

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
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }
  actor = await enrichStudentActor(actor);

  const role = String(actor.role || '').trim();
  if (role !== 'super_admin' && role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = parseBody(req);
  const templateType = String(body.template_type || body.type || '').trim();
  const rawPhone = String(body.phone || body.to || '').trim();
  const variables =
    body.variables && typeof body.variables === 'object' && !Array.isArray(body.variables)
      ? body.variables
      : {};

  if (!templateType) return res.status(400).json({ error: 'template_type_required' });
  if (!rawPhone) return res.status(400).json({ error: 'phone_required' });

  const e164 = normalizePhoneToE164(rawPhone);
  if (!e164) return res.status(400).json({ error: 'invalid_phone' });

  /** @type {Record<string, string>} */
  const vars = {};
  for (const [k, v] of Object.entries(variables)) {
    vars[String(k)] = v == null ? '' : String(v);
  }

  const sent = await sendAutomatedWhatsApp({
    phone: e164,
    templateType,
    vars
  });

  const today = getIstanbulDateString();
  const preview =
    sent.bodyPreview ||
    (sent.content_variables_json ? `[template vars] ${sent.content_variables_json}` : '');

  try {
    await supabaseAdmin.from('message_logs').insert({
      student_id: null,
      kind: 'template_test',
      related_id: null,
      message: preview || templateType,
      status: sent.ok ? 'sent' : 'failed',
      log_date: today,
      error: sent.ok ? null : sent.error || null,
      phone: e164,
      twilio_sid: null,
      twilio_error_code: sent.errorCode || null,
      twilio_content_sid: null,
      meta_message_id: sent.sid || null,
      meta_template_name: sent.meta_template_name || null
    });
  } catch (e) {
    console.warn('[whatsapp-template-test] log', e?.message || e);
  }

  if (!sent.ok) {
    return res.status(400).json({
      ok: false,
      error: sent.error,
      errorCode: sent.errorCode,
      validation: sent.validation || undefined,
      meta_template_name: sent.meta_template_name || null
    });
  }

  return res.status(200).json({
    ok: true,
    sid: sent.sid,
    channel: sent.channel,
    meta_template_name: sent.meta_template_name,
    content_variables_json: sent.content_variables_json || null,
    preview: sent.bodyPreview
  });
}
