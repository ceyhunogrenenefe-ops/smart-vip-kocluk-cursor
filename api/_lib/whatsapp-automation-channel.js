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

/** Aktif gönderim kanalı (tercih + yapılandırma). */
export function resolveAutomationSendChannel() {
  const pref = automationChannelPreference();
  if (pref === 'gateway' && automationGatewayReady()) return 'gateway';
  if (metaWhatsAppConfigured()) return 'meta';
  if (automationGatewayReady()) return 'gateway';
  return 'none';
}

/** Günlük rapor — REPORT_REMINDER_CHANNEL ile geçersiz kılınabilir. */
export function reportReminderSendChannel() {
  const legacyRaw = String(process.env.REPORT_REMINDER_CHANNEL ?? '').trim().toLowerCase();
  if (legacyRaw) {
    const pref = parseAutomationChannel(
      legacyRaw === 'meta' || legacyRaw === 'cloud' || legacyRaw === 'meta_cloud_api' ? 'meta' : legacyRaw
    );
    if (pref === 'gateway') {
      return automationGatewayReady() ? 'gateway' : 'none';
    }
    return metaWhatsAppConfigured() ? 'meta' : 'none';
  }
  return resolveAutomationSendChannel();
}

/**
 * message_templates satırı + değişkenlerle gönder (gateway düz metin veya Meta şablon).
 */
export async function sendAutomationTemplateMessage({ phone, templateRow, vars, templateType }) {
  const channel = resolveAutomationSendChannel();
  if (channel === 'none') {
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
      channel,
      error: 'template_not_found',
      errorCode: 'TEMPLATE_NOT_FOUND',
      bodyPreview: null,
      sid: null,
      gateway_message_id: null,
      meta_template_name: null
    };
  }

  if (channel === 'gateway') {
    const text = renderMessageTemplate(String(templateRow.content), vars || {}).trim();
    const sessionId = automationGatewaySessionId();
    const sent = await sendGatewayTextMessage({
      phone,
      message: text,
      sessionId,
      sessionCandidates: automationGatewaySessionCandidates(),
      allowSharedFallback: true
    });
    return {
      ok: sent.ok,
      channel: 'gateway',
      error: sent.ok ? null : sent.error || null,
      errorCode: sent.ok ? null : sent.errorCode || 'GATEWAY_SEND_FAILED',
      bodyPreview: text.slice(0, 800),
      sid: sent.gateway_message_id || sent.sid || null,
      gateway_message_id: sent.gateway_message_id || sent.sid || null,
      meta_template_name: 'gateway_plain',
      logCode: sent.ok ? null : sent.errorCode || 'GATEWAY_SEND_FAILED'
    };
  }

  return sendWhatsAppUsingTemplateRow({
    phone,
    templateRow,
    vars,
    templateType
  });
}

/** Serbest metin (yoklama toplu bildirim vb.). */
export async function sendAutomationPlainText({ phone, message }) {
  const channel = resolveAutomationSendChannel();
  const text = String(message || '').trim();
  if (!text) {
    return { ok: false, channel, error: 'empty_message', errorCode: 'EMPTY_MESSAGE' };
  }
  if (channel === 'none') {
    return { ok: false, channel: 'none', error: 'no_automation_channel', errorCode: 'NO_CHANNEL' };
  }
  if (channel === 'gateway') {
    const sent = await sendGatewayTextMessage({
      phone,
      message: text,
      sessionId: automationGatewaySessionId(),
      sessionCandidates: automationGatewaySessionCandidates(),
      allowSharedFallback: true
    });
    return {
      ok: sent.ok,
      channel: 'gateway',
      error: sent.ok ? null : sent.error || null,
      errorCode: sent.ok ? null : sent.errorCode || null,
      gateway_message_id: sent.gateway_message_id || null
    };
  }

  const { sendMetaTextMessage } = await import('./meta-whatsapp.js');
  try {
    const r = await sendMetaTextMessage({ toE164: phone, text });
    return {
      ok: true,
      channel: 'meta',
      sid: r?.messages?.[0]?.id || null,
      meta_message_id: r?.messages?.[0]?.id || null
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, channel: 'meta', error: msg, errorCode: 'META_SEND_FAILED' };
  }
}
