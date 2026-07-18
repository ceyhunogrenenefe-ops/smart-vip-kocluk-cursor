import { supabaseAdmin } from './supabase-admin.js';
import { sendNotification } from './message-service.js';
import { metaWhatsAppConfigured } from './meta-whatsapp.js';
import { renderMessageTemplate } from './template-engine.js';

const CHANNEL = 'whatsapp';
const MEETING_TEMPLATE_TYPE = 'meeting_notification';
const META_TEMPLATE_NAME = 'toplant_hatrlatma';

/** DB yoksa / eski satırda bile Meta’ya gidecek varsayılan */
function defaultMeetingTemplateRow() {
  return {
    type: MEETING_TEMPLATE_TYPE,
    name: 'Toplantı hatırlatma',
    content:
      'Online VIP Dershane — görüşme hatırlatması\n{{isim}} 10 dakika içinde görüşmeniz başlıyor.\nhttps://www.dersonlinevipkocluk.com',
    variables: ['isim'],
    twilio_variable_bindings: ['isim'],
    meta_template_name: META_TEMPLATE_NAME,
    meta_template_language: 'tr',
    meta_named_body_parameters: false,
    is_active: true,
    channel: 'whatsapp'
  };
}

/**
 * Aktif meeting_notification — Meta adı: toplant_hatrlatma ({{1}}=isim).
 */
export async function loadMeetingNotificationTemplate() {
  let data = null;
  try {
    const { data: row, error } = await supabaseAdmin
      .from('message_templates')
      .select('*')
      .eq('type', MEETING_TEMPLATE_TYPE)
      .maybeSingle();
    if (error) throw error;
    data = row;
  } catch {
    data = null;
  }

  const base = defaultMeetingTemplateRow();
  if (!data) return base;

  // Meta BM adı: toplant_hatrlatma (eski toplanti_hatirlatma / meeting_notification ezilir)
  data.meta_template_name = META_TEMPLATE_NAME;
  data.meta_template_language = String(data.meta_template_language || '').trim() || 'tr';
  data.twilio_variable_bindings = ['isim'];
  data.variables = ['isim'];
  data.meta_named_body_parameters = false;
  if (data.is_active === false) data.is_active = true;
  if (!String(data.content || '').trim()) data.content = base.content;
  return data;
}

function resolveIsim(opts) {
  const fromOpt = String(opts.isim || opts.studentName || '').trim();
  if (fromOpt) return fromOpt.slice(0, 200);
  return 'Öğrenci';
}

/**
 * WhatsApp gönder + meeting_notification_log.
 * Meta: toplant_hatrlatma — {{1}} → isim
 */
export async function deliverWhatsAppWithLog({ meetingId, kind, recipientE164, body, isim, studentName, coachId }) {
  const now = new Date().toISOString();
  const nameVar = resolveIsim({ isim, studentName });
  const vars = { isim: nameVar };
  const preview =
    String(body || '').trim() ||
    `${nameVar} 10 dakika içinde görüşmeniz başlıyor. https://www.dersonlinevipkocluk.com`;

  const { data: existing } = await supabaseAdmin
    .from('meeting_notification_log')
    .select('*')
    .eq('meeting_id', meetingId)
    .eq('channel', CHANNEL)
    .eq('kind', kind)
    .maybeSingle();

  if (existing?.status === 'sent') return { ok: true, skipped: true };

  if (!existing) {
    const { error } = await supabaseAdmin.from('meeting_notification_log').insert({
      meeting_id: meetingId,
      channel: CHANNEL,
      kind,
      recipient_e164: recipientE164,
      payload: { isim: nameVar, body: preview },
      status: 'pending',
      attempt_count: 0
    });
    if (error) throw error;
  }

  const { data: row } = await supabaseAdmin
    .from('meeting_notification_log')
    .select('*')
    .eq('meeting_id', meetingId)
    .eq('channel', CHANNEL)
    .eq('kind', kind)
    .single();

  const nextAttempt = (row?.attempt_count || 0) + 1;

  if (!metaWhatsAppConfigured()) {
    await supabaseAdmin
      .from('meeting_notification_log')
      .update({
        status: 'failed',
        attempt_count: nextAttempt,
        last_error: 'meta_whatsapp_not_configured',
        processed_at: now,
        recipient_e164: recipientE164,
        payload: { isim: nameVar, body: preview }
      })
      .eq('id', row.id);
    return { ok: false, error: 'meta_whatsapp_not_configured' };
  }

  const templateRow = await loadMeetingNotificationTemplate();
  const plainText = templateRow?.content
    ? renderMessageTemplate(String(templateRow.content), vars).trim() || preview
    : preview;

  try {
    const sent = await sendNotification({
      notificationType: MEETING_TEMPLATE_TYPE,
      phone: recipientE164,
      templateRow,
      vars,
      plainText,
      coachId: coachId || null
    });
    if (!sent.ok) throw new Error(sent.error || sent.errorCode || 'send_failed');
    const messageId = sent.sid || sent.meta_message_id || sent.gateway_message_id || null;
    await supabaseAdmin
      .from('meeting_notification_log')
      .update({
        status: 'sent',
        attempt_count: nextAttempt,
        processed_at: now,
        external_sid: messageId,
        last_error: null,
        recipient_e164: recipientE164,
        payload: {
          isim: nameVar,
          body: plainText,
          channel: sent.channel,
          meta_template: sent.meta_template_name || META_TEMPLATE_NAME
        }
      })
      .eq('id', row.id);
    return { ok: true, channel: sent.channel };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabaseAdmin
      .from('meeting_notification_log')
      .update({
        status: 'failed',
        attempt_count: nextAttempt,
        last_error: msg,
        processed_at: now,
        recipient_e164: recipientE164,
        payload: { isim: nameVar, body: preview }
      })
      .eq('id', row.id);
    return { ok: false, error: msg };
  }
}
