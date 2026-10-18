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
} from './types';

/**
 * Common messaging provider adapter interface.
 * Channel-specific code must not leak into CRM services — implement this.
 */
export interface MessagingProvider {
  readonly name: string;

  connect(config: Record<string, unknown>): Promise<void>;
  disconnect(): Promise<void>;
  validateWebhook(input: WebhookValidationInput): Promise<WebhookValidationResult>;
  normalizeIncomingEvent(payload: unknown): Promise<NormalizedMessage[]>;
  sendText(input: SendTextInput): Promise<SendResult>;
  sendMedia(input: SendMediaInput): Promise<SendResult>;
  sendTemplate(input: SendTemplateInput): Promise<SendResult>;
  markAsRead(externalMessageId: string): Promise<void>;
  getProfile(externalUserId: string): Promise<ProviderProfile | null>;
  getMedia(providerMediaId: string): Promise<{ url: string; mimeType?: string } | null>;
  testConnection(): Promise<ConnectionTestResult>;
}
