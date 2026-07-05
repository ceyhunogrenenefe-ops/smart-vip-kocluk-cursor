import { supabaseAdmin } from './supabase-admin.js';
import { sendNotification } from './message-service.js';
import { metaWhatsAppConfigured } from './meta-whatsapp.js';

const CHANNEL = 'whatsapp';

export async function deliverWhatsAppWithLog({ meetingId, kind, recipientE164, body, coachId }) {
  const now = new Date().toISOString();

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
      payload: { body },
      status: 'pending',
      attempt_count: 0
    });
    if (error) throw error;
  } else if (existing.status === 'sent') {
    return { ok: true, skipped: true };
  }

  const { data: row } = await supabaseAdmin
    .from('meeting_notification_log')
    .select('*')
    .eq('meeting_id', meetingId)
    .eq('channel', CHANNEL)
    .eq('kind', kind)
    .single();

  const nextAttempt = (row?.attempt_count || 0) + 1;

  try {
    const sent = await sendNotification({
      notificationType: 'meeting_notification',
      phone: recipientE164,
      plainText: body,
      coachId: coachId || null
    });
    if (!sent.ok) throw new Error(sent.error || 'send_failed');
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
        payload: { body, channel: sent.channel }
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
        payload: { body }
      })
      .eq('id', row.id);
    return { ok: false, error: msg };
  }
}
