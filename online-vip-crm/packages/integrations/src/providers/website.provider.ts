import { MessageDirection, MessageType, Provider } from '@online-vip-crm/shared';
import type { MessagingProvider } from '../messaging-provider';
import type {
  ConnectionTestResult,
  NormalizedMessage,
  ProviderProfile,
  SendMediaInput,
  SendResult,
  SendTemplateInput,
  SendTextInput,
  WebhookValidationInput,
  WebhookValidationResult,
} from '../types';

/**
 * Website / lead-form channel adapter stub.
 * Inbound form submissions are normalized into conversations.
 */
export class WebsiteProvider implements MessagingProvider {
  readonly name = Provider.WEBSITE;

  async connect(_config: Record<string, unknown>): Promise<void> {
    // Website forms typically need only a public webhook URL — no OAuth.
  }

  async disconnect(): Promise<void> {}

  async validateWebhook(_input: WebhookValidationInput): Promise<WebhookValidationResult> {
    return { valid: true };
  }

  async normalizeIncomingEvent(payload: unknown): Promise<NormalizedMessage[]> {
    const body = (payload ?? {}) as Record<string, unknown>;
    if (!body.institutionId || !body.channelConnectionId) {
      return [];
    }

    return [
      {
        institutionId: String(body.institutionId),
        channelConnectionId: String(body.channelConnectionId),
        provider: Provider.WEBSITE,
        externalMessageId: String(body.externalMessageId ?? `web-${Date.now()}`),
        externalConversationId: String(body.externalConversationId ?? `web-form-${Date.now()}`),
        externalSenderId: String(body.externalSenderId ?? body.email ?? 'anonymous'),
        direction: MessageDirection.INBOUND,
        type: MessageType.TEXT,
        text: String(body.message ?? body.text ?? ''),
        sentAt: new Date(),
        rawMetadata: body as Record<string, unknown>,
      },
    ];
  }

  async sendText(_input: SendTextInput): Promise<SendResult> {
    throw new Error('WebsiteProvider does not support outbound sendText');
  }

  async sendMedia(_input: SendMediaInput): Promise<SendResult> {
    throw new Error('WebsiteProvider does not support outbound sendMedia');
  }

  async sendTemplate(_input: SendTemplateInput): Promise<SendResult> {
    throw new Error('WebsiteProvider does not support outbound sendTemplate');
  }

  async markAsRead(_externalMessageId: string): Promise<void> {}

  async getProfile(externalUserId: string): Promise<ProviderProfile | null> {
    return { externalUserId };
  }

  async getMedia(_providerMediaId: string): Promise<{ url: string; mimeType?: string } | null> {
    return null;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return {
      ok: true,
      status: 'CONNECTED',
      message: 'Web formu endpointi hazır (stub).',
    };
  }
}
