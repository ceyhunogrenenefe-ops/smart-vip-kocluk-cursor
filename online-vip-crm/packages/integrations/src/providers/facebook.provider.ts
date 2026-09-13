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

/** Stub — Facebook Messenger Platform in a later phase. */
export class FacebookMessengerProvider implements MessagingProvider {
  readonly name = Provider.FACEBOOK;

  async connect(_config: Record<string, unknown>): Promise<void> {
    throw new Error(
      'FacebookMessengerProvider is not configured yet. Use MockProvider in development.',
    );
  }

  async disconnect(): Promise<void> {}

  async validateWebhook(_input: WebhookValidationInput): Promise<WebhookValidationResult> {
    return { valid: false, reason: 'NOT_IMPLEMENTED' };
  }

  async normalizeIncomingEvent(_payload: unknown): Promise<NormalizedMessage[]> {
    return [];
  }

  async sendText(_input: SendTextInput): Promise<SendResult> {
    throw new Error('FacebookMessengerProvider.sendText is not implemented');
  }

  async sendMedia(_input: SendMediaInput): Promise<SendResult> {
    throw new Error('FacebookMessengerProvider.sendMedia is not implemented');
  }

  async sendTemplate(_input: SendTemplateInput): Promise<SendResult> {
    throw new Error('FacebookMessengerProvider.sendTemplate is not implemented');
  }

  async markAsRead(_externalMessageId: string): Promise<void> {
    throw new Error('FacebookMessengerProvider.markAsRead is not implemented');
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
      message: 'Facebook Messenger henüz yapılandırılmadı.',
    };
  }
}
