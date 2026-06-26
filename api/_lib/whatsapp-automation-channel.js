/**
 * Otomasyon WhatsApp kanalı: varsayılan gateway (ücretsiz Baileys), isteğe bağlı Meta yedek.
 * Env: WHATSAPP_AUTOMATION_CHANNEL=gateway|meta (varsayılan gateway)
 *      WHATSAPP_AUTOMATION_GATEWAY_SESSION_ID veya BOOK_ORDER_GATEWAY_SESSION_ID
 */
import { metaWhatsAppConfigured } from './meta-whatsapp.js';
import { renderMessageTemplate } from './template-engine.js';
import { sendWhatsAppUsingTemplateRow } from './whatsapp-outbound.js';
import {
  bookOrderGatewaySessionId,
  gatewayConfiguredForSession,
  reportReminderGatewaySessionId,
  sendGatewayTextMessage,
  teacherReminderGatewaySessionId
} from './whatsapp-gateway-send.js';

export function parseAutomationChannel(raw) {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v || v === 'gateway' || v === 'baileys' || v === 'wa_gateway') return 'gateway';
  if (v === 'meta' || v === 'cloud' || v === 'meta_cloud_api') return 'meta';
  return 'gateway';
}

export function automationChannelPreference() {
  return parseAutomationChannel(process.env.WHATSAPP_AUTOMATION_CHANNEL ?? 'gateway');
}

export function automationGatewaySessionId() {
  return String(
    process.env.WHATSAPP_AUTOMATION_GATEWAY_SESSION_ID ||
      process.env.BOOK_ORDER_GATEWAY_SESSION_ID ||
      process.env.WHATSAPP_GATEWAY_SESSION_ID ||
      ''
  ).trim();
}

export function automationGatewaySessionCandidates() {
  return [
    ...new Set(
      [
        automationGatewaySessionId(),
        reportReminderGatewaySessionId(),
        bookOrderGatewaySessionId(),
        teacherReminderGatewaySessionId()
      ]
        .map((x) => String(x || '').trim())
        .filter(Boolean)
    )
  ];
}

export function automationGatewayReady() {
  const sid = automationGatewaySessionId();
  if (gatewayConfiguredForSession(sid)) return true;
  return automationGatewaySessionCandidates().some((id) => gatewayConfiguredForSession(id));
}

/** Meta yedek: gateway başarısız olunca (varsayılan açık). WHATSAPP_AUTOMATION_FALLBACK_META=0 ile kapatılır. */
export function automationMetaFallbackEnabled() {
  if (automationChannelPreference() === 'meta') return true;
  return String(process.env.WHATSAPP_AUTOMATION_FALLBACK_META ?? '1').trim() !== '0';
}

/** Aktif gönderim kanalı (tercih + yapılandırma). */
export function resolveAutomationSendChannel() {
  const pref = automationChannelPreference();
  if (pref === 'meta') {
    return metaWhatsAppConfigured() ? 'meta' : automationGatewayReady() ? 'gateway' : 'none';
  }
  if (automationGatewayReady()) return 'gateway';
  if (metaWhatsAppConfigured()) return 'meta';
  return 'none';
}

/** Günlük rapor — önce gateway, olmazsa Meta (REPORT_REMINDER_CHANNEL artık yalnızca teşhis). */
export function reportReminderSendChannel() {
  if (automationGatewayReady()) return 'gateway';
  if (metaWhatsAppConfigured()) return 'meta';
  return 'none';
}

function automationSendPlan() {
  const pref = automationChannelPreference();
  const gwReady = automationGatewayReady();
  const metaReady = metaWhatsAppConfigured();
  const metaFallback = automationMetaFallbackEnabled();
  const tryGateway = pref !== 'meta' && gwReady;
  const tryMeta = metaReady && (pref === 'meta' || metaFallback || !gwReady);
  return { pref, gwReady, metaReady, tryGateway, tryMeta };
}

/**
 * message_templates satırı + değişkenlerle gönder (gateway düz metin veya Meta şablon).
 */
export async function sendAutomationTemplateMessage({ phone, templateRow, vars, templateType }) {
  const { tryGateway, tryMeta } = automationSendPlan();

  if (!tryGateway && !tryMeta) {
    return {
      ok: false,
      channel: 'none',
      error: 'no_automation_channel',
      errorCode: 'NO_CHANNEL',
      bodyPreview: null,
      sid: null,
      gateway_message_id: null,
      meta_template_name: null
    };
  }

  if (!templateRow?.content) {
    return {
      ok: false,
      channel: tryGateway ? 'gateway' : 'meta',
      error: 'template_not_found',
      errorCode: 'TEMPLATE_NOT_FOUND',
      bodyPreview: null,
      sid: null,
      gateway_message_id: null,
      meta_template_name: null
    };
  }

  const text = renderMessageTemplate(String(templateRow.content), vars || {}).trim();
  let lastGw = null;

  if (tryGateway) {
    const sent = await sendGatewayTextMessage({
      phone,
      message: text,
      sessionId: automationGatewaySessionId(),
      sessionCandidates: automationGatewaySessionCandidates(),
      allowSharedFallback: true
    });
    if (sent.ok) {
      return {
        ok: true,
        channel: 'gateway',
        error: null,
        errorCode: null,
        bodyPreview: text.slice(0, 800),
        sid: sent.gateway_message_id || sent.sid || null,
        gateway_message_id: sent.gateway_message_id || sent.sid || null,
        meta_template_name: 'gateway_plain',
        logCode: null
      };
    }
    lastGw = sent;
    if (!tryMeta) {
      return {
        ok: false,
        channel: 'gateway',
        error: sent.error || null,
        errorCode: sent.errorCode || 'GATEWAY_SEND_FAILED',
        bodyPreview: text.slice(0, 800),
        sid: null,
        gateway_message_id: null,
        meta_template_name: 'gateway_plain',
        logCode: sent.errorCode || 'GATEWAY_SEND_FAILED'
      };
    }
  }

  const meta = await sendWhatsAppUsingTemplateRow({
    phone,
    templateRow,
    vars,
    templateType
  });
  if (meta.ok) {
    return {
      ...meta,
      channel: 'meta',
      fallback_from: lastGw ? 'gateway' : null
    };
  }
  if (lastGw) {
    return {
      ...meta,
      channel: 'meta',
      error: `${lastGw.error || 'gateway_failed'} · Meta: ${meta.error || 'failed'}`,
      gateway_attempt: lastGw.errorCode || null
    };
  }
  return meta;
}

/** Serbest metin (yoklama toplu bildirim vb.). */
export async function sendAutomationPlainText({ phone, message }) {
  const { tryGateway, tryMeta } = automationSendPlan();
  const text = String(message || '').trim();
  if (!text) {
    return { ok: false, channel: 'none', error: 'empty_message', errorCode: 'EMPTY_MESSAGE' };
  }
  if (!tryGateway && !tryMeta) {
    return { ok: false, channel: 'none', error: 'no_automation_channel', errorCode: 'NO_CHANNEL' };
  }

  let lastGw = null;
  if (tryGateway) {
    const sent = await sendGatewayTextMessage({
      phone,
      message: text,
      sessionId: automationGatewaySessionId(),
      sessionCandidates: automationGatewaySessionCandidates(),
      allowSharedFallback: true
    });
    if (sent.ok) {
      return {
        ok: true,
        channel: 'gateway',
        error: null,
        errorCode: null,
        gateway_message_id: sent.gateway_message_id || null
      };
    }
    lastGw = sent;
    if (!tryMeta) {
      return {
        ok: false,
        channel: 'gateway',
        error: sent.error || null,
        errorCode: sent.errorCode || null,
        gateway_message_id: null
      };
    }
  }

  const { sendMetaTextMessage } = await import('./meta-whatsapp.js');
  try {
    const r = await sendMetaTextMessage({ toE164: phone, text });
    return {
      ok: true,
      channel: 'meta',
      sid: r?.messages?.[0]?.id || null,
      meta_message_id: r?.messages?.[0]?.id || null,
      fallback_from: lastGw ? 'gateway' : null
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (lastGw) {
      return {
        ok: false,
        channel: 'meta',
        error: `${lastGw.error || 'gateway_failed'} · Meta: ${msg}`,
        errorCode: 'META_SEND_FAILED',
        gateway_attempt: lastGw.errorCode || null
      };
    }
    return { ok: false, channel: 'meta', error: msg, errorCode: 'META_SEND_FAILED' };
  }
}
