import { Provider } from '@online-vip-crm/shared';
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

/** Stub — wire WhatsApp Cloud API in a later phase. */
export class WhatsAppProvider implements MessagingProvider {
  readonly name = Provider.WHATSAPP;

  async connect(_config: Record<string, unknown>): Promise<void> {
    throw new Error('WhatsAppProvider is not configured yet. Use MockProvider in development.');
  }

  async disconnect(): Promise<void> {}

  async validateWebhook(_input: WebhookValidationInput): Promise<WebhookValidationResult> {
    return { valid: false, reason: 'NOT_IMPLEMENTED' };
  }

  async normalizeIncomingEvent(_payload: unknown): Promise<NormalizedMessage[]> {
    return [];
  }

  async sendText(_input: SendTextInput): Promise<SendResult> {
    throw new Error('WhatsAppProvider.sendText is not implemented');
  }

  async sendMedia(_input: SendMediaInput): Promise<SendResult> {
    throw new Error('WhatsAppProvider.sendMedia is not implemented');
  }

  async sendTemplate(_input: SendTemplateInput): Promise<SendResult> {
    throw new Error('WhatsAppProvider.sendTemplate is not implemented');
  }

  async markAsRead(_externalMessageId: string): Promise<void> {
    throw new Error('WhatsAppProvider.markAsRead is not implemented');
  }

  async getProfile(_externalUserId: string): Promise<ProviderProfile | null> {
    return null;
  }

  async getMedia(_providerMediaId: string): Promise<{ url: string; mimeType?: string } | null> {
    return null;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return {
      ok: false,
      status: 'SETUP_REQUIRED',
      message: 'WhatsApp Cloud API henüz yapılandırılmadı.',
    };
  }
}
