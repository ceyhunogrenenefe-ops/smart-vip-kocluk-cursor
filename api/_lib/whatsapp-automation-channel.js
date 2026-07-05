/**
 * Otomasyon WhatsApp kanalı — MessageService üzerinden (geriye dönük uyumlu).
 */
import { metaWhatsAppConfigured } from './meta-whatsapp.js';
import {
  bookOrderGatewaySessionId,
  gatewayConfiguredForSession,
  reportReminderGatewaySessionId,
  teacherReminderGatewaySessionId
} from './whatsapp-gateway-send.js';
import { sendAutomationViaMessageService } from './message-service.js';
import {
  getNotificationDefinition,
  resolveEffectiveSendChannel,
  SEND_CHANNELS
} from './notification-config.js';

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

export function automationMetaFallbackEnabled() {
  if (automationChannelPreference() === 'meta') return true;
  return String(process.env.WHATSAPP_AUTOMATION_FALLBACK_META ?? '1').trim() !== '0';
}

export function resolveAutomationSendChannel() {
  if (metaWhatsAppConfigured()) return 'meta';
  if (automationGatewayReady()) return 'gateway';
  return 'none';
}

export function reportReminderSendChannel() {
  const ch = resolveEffectiveSendChannel('report_reminder');
  if (ch === SEND_CHANNELS.META_API && metaWhatsAppConfigured()) return 'meta';
  if (ch === SEND_CHANNELS.COACH_GATEWAY) return 'gateway';
  if (metaWhatsAppConfigured()) return 'meta';
  if (automationGatewayReady()) return 'gateway';
  return 'none';
}

/**
 * @param {{ phone: string, templateRow: object, vars: object, templateType: string, coachId?: string, coachUserId?: string }} p
 */
export async function sendAutomationTemplateMessage(p) {
  const templateType = String(p.templateType || p.templateRow?.type || '').trim();
  const def = getNotificationDefinition(templateType);
  const allowMetaFallback =
    def != null ? def.allowMetaFallback : automationMetaFallbackEnabled();

  return sendAutomationViaMessageService({
    phone: p.phone,
    templateRow: p.templateRow,
    vars: p.vars,
    templateType,
    coachId: p.coachId,
    coachUserId: p.coachUserId,
    allowMetaFallbackOverride: allowMetaFallback
  });
}

export async function sendAutomationPlainText({ phone, message, notificationType, coachId, coachUserId }) {
  const { sendPlainViaMessageService } = await import('./message-service.js');
  return sendPlainViaMessageService({
    phone,
    message,
    notificationType: notificationType || 'class_absent_notice_1',
    coachId,
    coachUserId
  });
}
