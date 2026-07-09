import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { enrichStudentActor } from '../api/_lib/enrich-student-actor.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { getIstanbulDateString } from '../api/_lib/istanbul-time.js';
import { normalizePhoneToE164 } from '../api/_lib/phone-whatsapp.js';
import { sendNotification } from '../api/_lib/message-service.js';
import { channelLabelTr, resolveEffectiveSendChannel } from '../api/_lib/notification-config.js';
import {
  activateBookOrderMetaTemplate,
  sendBookOrderWhatsApp,
  BOOK_ORDER_TEMPLATE_TYPE
} from '../api/_lib/book-order-meta-send.js';

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

  const coachUserId = String(actor.sub || '').trim();
  const coachId = actor.coach_id ? String(actor.coach_id) : null;
  const effectiveChannel = resolveEffectiveSendChannel(templateType);

  let sent;
  if (templateType === BOOK_ORDER_TEMPLATE_TYPE) {
    await activateBookOrderMetaTemplate().catch(() => {});
    const sampleOrder = {
      veli_ad_soyad: vars.veli_ad_soyad || 'Test Veli',
      ogrenci_ad_soyad: vars.ogrenci_ad_soyad || 'Test Öğrenci',
      sinif: vars.sinif || '11',
      kitap_seti: vars.kitap_seti || '11.sınıf Vip Set',
      ucret_durumu: vars.ucret_durumu || 'Ödendi',
      telefon: vars.telefon || '05013715302',
      adres: vars.adres || 'Test Mah. No:1',
      ilce: vars.ilce || 'Köşk',
      il: vars.il || 'Aydın',
      siparis_notu: vars.siparis_notu || 'Test siparişi'
    };
    sent = await sendBookOrderWhatsApp(e164, sampleOrder);
  } else {
    const { data: templateRow, error: tErr } = await supabaseAdmin
      .from('message_templates')
      .select('*')
      .eq('type', templateType)
      .maybeSingle();
    if (tErr) {
      return res.status(500).json({ error: tErr.message || 'template_load_failed' });
    }
    if (!templateRow?.content) {
      return res.status(400).json({
        error: 'template_not_found',
        hint: `message_templates içinde type=${templateType} kaydı yok.`
      });
    }
    sent = await sendNotification({
      notificationType: templateType,
      phone: e164,
      templateRow,
      vars,
      coachId,
      coachUserId
    });
  }

  const today = getIstanbulDateString();
  const preview =
    sent.bodyPreview ||
    (sent.content_variables_json ? `[template vars] ${sent.content_variables_json}` : '');

  const sid = sent.sid || sent.gateway_message_id || sent.meta_message_id || null;

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
      meta_message_id: sid,
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
      channel: sent.channel || effectiveChannel,
      channel_label: channelLabelTr(sent.channel || effectiveChannel),
      gateway_status: sent.gateway_status || null,
      validation: sent.validation || undefined,
      meta_template_name: sent.meta_template_name || null,
      hint:
        sent.channel === 'coach_gateway' || effectiveChannel === 'coach_gateway'
          ? 'Koç gateway kanalı — WhatsApp Ayarlarından kendi QR oturumunuzun bağlı olduğundan emin olun.'
          : undefined
    });
  }

  return res.status(200).json({
    ok: true,
    sid,
    channel: sent.channel,
    channel_label: channelLabelTr(sent.channel),
    meta_template_name: sent.meta_template_name,
    content_variables_json: sent.content_variables_json || null,
    preview: sent.bodyPreview
  });
}
