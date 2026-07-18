/**
 * Merkezi WhatsApp MessageService — bildirim konfigürasyonuna göre Gateway veya Meta.
 */
import {
  getNotificationDefinition,
  resolveEffectiveSendChannel,
  SEND_CHANNELS
} from './notification-config.js';
import { renderMessageTemplate } from './template-engine.js';
import { coachRowToPlatformUserId } from './meetings-resolve.js';
import {
  getGatewaySessionStatus,
  sendGatewayTextMessage
} from './whatsapp-gateway-send.js';
import { sendWhatsAppUsingTemplateRow } from './whatsapp-outbound.js';
import { sendMetaTextMessage, metaWhatsAppConfigured } from './meta-whatsapp.js';

/**
 * Koç gateway oturum id (users.id) — coaches.id üzerinden.
 * @param {string|null|undefined} coachId coaches.id
 * @param {string|null|undefined} coachUserId doğrudan users.id (opsiyonel)
 */
export async function resolveCoachGatewaySessionId(coachId, coachUserId) {
  const direct = String(coachUserId || '').trim();
  if (direct) return direct;
  const cid = String(coachId || '').trim();
  if (!cid) return null;
  return coachRowToPlatformUserId(cid);
}

/**
 * @param {string|null|undefined} coachId
 * @param {string|null|undefined} [coachUserId]
 */
export async function getCoachGatewayHealth(coachId, coachUserId) {
  const sessionId = await resolveCoachGatewaySessionId(coachId, coachUserId);
  if (!sessionId) {
    return {
      connected: false,
      session_id: null,
      status: 'not_linked',
      label: 'Bağlı değil',
      error: 'Koç gateway oturumu tanımlı değil'
    };
  }
  const st = await getGatewaySessionStatus(sessionId, { skipHealth: false });
  const connected = Boolean(st.ok && st.status === 'connected');
  return {
    connected,
    session_id: sessionId,
    status: st.status || 'unknown',
    label: connected ? 'Bağlı' : 'Bağlı değil',
    error: connected ? null : st.error || 'Gateway bağlantısı yok',
    raw: st.raw || null
  };
}

/**
 * @param {object} opts
 * @param {string} opts.notificationType template type / notification id
 * @param {string} opts.phone E.164
 * @param {object} [opts.templateRow]
 * @param {Record<string,string>} [opts.vars]
 * @param {string} [opts.plainText]
 * @param {string|null} [opts.coachId]
 * @param {string|null} [opts.coachUserId]
 * @param {boolean} [opts.allowMetaFallbackOverride]
 */
export async function sendNotification(opts) {
  const notificationType = String(opts.notificationType || opts.templateType || '').trim();
  const def = getNotificationDefinition(notificationType);
  const channel = resolveEffectiveSendChannel(notificationType);
  const phone = String(opts.phone || '').trim();
  const templateRow = opts.templateRow || null;
  const vars = opts.vars || {};

  if (!phone) {
    return fail('INVALID_PHONE', 'invalid_phone', channel || 'none');
  }
  if (!channel) {
    return fail('UNKNOWN_NOTIFICATION_TYPE', 'unknown_notification_type', 'none');
  }

  const text =
    String(opts.plainText || '').trim() ||
    (templateRow?.content ? renderMessageTemplate(String(templateRow.content), vars).trim() : '');

  if (!text) {
    return fail('EMPTY_MESSAGE', 'empty_message', channel);
  }

  const allowMetaFallback =
    opts.allowMetaFallbackOverride !== undefined
      ? Boolean(opts.allowMetaFallbackOverride)
      : Boolean(def?.allowMetaFallback);

  if (channel === SEND_CHANNELS.COACH_GATEWAY) {
    return sendViaCoachGateway({
      phone,
      text,
      coachId: opts.coachId,
      coachUserId: opts.coachUserId,
      templateRow,
      vars,
      notificationType,
      allowMetaFallback
    });
  }

  return sendViaMetaApi({
    phone,
    text,
    templateRow,
    vars,
    notificationType
  });
}

async function sendViaCoachGateway({
  phone,
  text,
  coachId,
  coachUserId,
  templateRow,
  vars,
  notificationType,
  allowMetaFallback
}) {
  const sessionId = await resolveCoachGatewaySessionId(coachId, coachUserId);
  if (!sessionId) {
    if (allowMetaFallback && metaWhatsAppConfigured() && templateRow) {
      const meta = await sendViaMetaApi({ phone, text, templateRow, vars, notificationType });
      return { ...meta, fallback_from: 'coach_gateway_missing' };
    }
    return fail('COACH_GATEWAY_NOT_LINKED', 'coach_gateway_not_linked', SEND_CHANNELS.COACH_GATEWAY);
  }

  const health = await getGatewaySessionStatus(sessionId, { skipHealth: true });
  if (!health.ok || health.status !== 'connected') {
    if (allowMetaFallback && metaWhatsAppConfigured() && templateRow) {
      const meta = await sendViaMetaApi({ phone, text, templateRow, vars, notificationType });
      return { ...meta, fallback_from: 'coach_gateway_disconnected', gateway_status: health.status };
    }
    return {
      ok: false,
      channel: SEND_CHANNELS.COACH_GATEWAY,
      error: health.error || 'coach_gateway_disconnected',
      errorCode: 'COACH_GATEWAY_DISCONNECTED',
      gateway_status: health.status,
      coach_session_id: sessionId,
      bodyPreview: text.slice(0, 800),
      sid: null,
      gateway_message_id: null,
      meta_template_name: 'gateway_plain'
    };
  }

  const sent = await sendGatewayTextMessage({
    phone,
    message: text,
    sessionId,
    sessionCandidates: [sessionId],
    allowSharedFallback: false
  });

  if (sent.ok) {
    return {
      ok: true,
      channel: SEND_CHANNELS.COACH_GATEWAY,
      error: null,
      errorCode: null,
      bodyPreview: text.slice(0, 800),
      sid: sent.gateway_message_id || sent.sid || null,
      gateway_message_id: sent.gateway_message_id || sent.sid || null,
      meta_template_name: 'gateway_plain',
      coach_session_id: sessionId,
      logCode: null
    };
  }

  if (allowMetaFallback && metaWhatsAppConfigured() && templateRow) {
    const meta = await sendViaMetaApi({ phone, text, templateRow, vars, notificationType });
    return { ...meta, fallback_from: 'coach_gateway', gateway_attempt: sent.errorCode || sent.error };
  }

  return {
    ok: false,
    channel: SEND_CHANNELS.COACH_GATEWAY,
    error: sent.error || 'gateway_send_failed',
    errorCode: sent.errorCode || 'GATEWAY_SEND_FAILED',
    bodyPreview: text.slice(0, 800),
    sid: null,
    gateway_message_id: null,
    meta_template_name: 'gateway_plain',
    coach_session_id: sessionId,
    logCode: sent.errorCode || 'GATEWAY_SEND_FAILED'
  };
}

async function sendViaMetaApi({ phone, text, templateRow, vars, notificationType }) {
  if (!metaWhatsAppConfigured()) {
    return fail('META_NOT_CONFIGURED', 'meta_whatsapp_not_configured', SEND_CHANNELS.META_API, text);
  }

  const metaName = String(templateRow?.meta_template_name || '').trim();
  if (templateRow && metaName) {
    // Devamsızlık / taksit ile aynı yol: önce doğrudan gönder.
    // WABA ön-kontrolü (requirePhoneWaba) yeni şablonlarda yanlış "yok" diyebiliyor.
    let meta = await sendWhatsAppUsingTemplateRow({
      phone,
      templateRow,
      vars,
      templateType: notificationType,
      requirePhoneWabaTemplate: false
    });
    if (!meta.ok) {
      const err = String(meta.error || meta.errorCode || '');
      if (/132001|translation|template name|dil kodu/i.test(err)) {
        meta = await sendWhatsAppUsingTemplateRow({
          phone,
          templateRow,
          vars,
          templateType: notificationType,
          requirePhoneWabaTemplate: true
        });
        // WABA listesinde bulunamazsa yine de dil adaylarıyla son bir doğrudan deneme
        if (!meta.ok && /WABA|bulunamadı|yok\.|not_found/i.test(String(meta.error || ''))) {
          const row2 = {
            ...templateRow,
            meta_template_language: 'tr_TR',
            meta_named_body_parameters: false
          };
          meta = await sendWhatsAppUsingTemplateRow({
            phone,
            templateRow: row2,
            vars,
            templateType: notificationType,
            requirePhoneWabaTemplate: false
          });
        }
      }
    }
    return {
      ...meta,
      channel: SEND_CHANNELS.META_API,
      bodyPreview: text.slice(0, 800)
    };
  }

  try {
    const r = await sendMetaTextMessage({ toE164: phone, text });
    const mid = r?.messages?.[0]?.id || r?.messageId || null;
    return {
      ok: true,
      channel: SEND_CHANNELS.META_API,
      error: null,
      errorCode: null,
      sid: mid,
      meta_message_id: mid,
      gateway_message_id: null,
      meta_template_name: metaName || 'meta_plain_text',
      bodyPreview: text.slice(0, 800),
      logCode: null
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail('META_SEND_FAILED', msg, SEND_CHANNELS.META_API, text);
  }
}

function fail(errorCode, error, channel, text = '') {
  return {
    ok: false,
    channel: channel || 'none',
    error,
    errorCode,
    bodyPreview: text ? text.slice(0, 800) : null,
    sid: null,
    gateway_message_id: null,
    meta_template_name: null,
    logCode: errorCode
  };
}

/** Geriye dönük: automation-channel ile aynı imza */
export async function sendAutomationViaMessageService({
  phone,
  templateRow,
  vars,
  templateType,
  coachId,
  coachUserId,
  allowMetaFallbackOverride
}) {
  return sendNotification({
    notificationType: templateType,
    phone,
    templateRow,
    vars,
    coachId,
    coachUserId,
    allowMetaFallbackOverride
  });
}

export async function sendPlainViaMessageService({ phone, message, notificationType, coachId, coachUserId }) {
  return sendNotification({
    notificationType,
    phone,
    plainText: message,
    coachId,
    coachUserId
  });
}
