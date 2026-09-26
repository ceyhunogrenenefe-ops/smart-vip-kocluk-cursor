import {
  MessageDirection,
  MessageType,
  Provider,
} from '@online-vip-crm/shared';
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

export type MockScenario =
  | 'inbound_text'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'duplicate_webhook'
  | 'token_expired'
  | 'rate_limit';

/**
 * Development-only messaging provider. Simulates Meta/email/web channels
 * without real credentials. Must be disabled in production.
 */
export class MockProvider implements MessagingProvider {
  readonly name = 'mock';
  private connected = false;
  private config: Record<string, unknown> = {};
  private sent: SendResult[] = [];
  private scenario: MockScenario = 'inbound_text';

  constructor(
    private readonly defaults: {
      institutionId?: string;
      channelConnectionId?: string;
      provider?: Provider;
    } = {},
  ) {}

  setScenario(scenario: MockScenario): void {
    this.scenario = scenario;
  }

  async connect(config: Record<string, unknown>): Promise<void> {
    this.config = config;
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async validateWebhook(input: WebhookValidationInput): Promise<WebhookValidationResult> {
    const mode = input.query['hub.mode'];
    const challenge = input.query['hub.challenge'];
    if (mode === 'subscribe' && typeof challenge === 'string') {
      return { valid: true, challengeResponse: challenge };
    }
    return { valid: true };
  }

  async normalizeIncomingEvent(payload: unknown): Promise<NormalizedMessage[]> {
    if (this.scenario === 'token_expired') {
      throw new Error('MOCK_TOKEN_EXPIRED');
    }
    if (this.scenario === 'rate_limit') {
      throw new Error('MOCK_RATE_LIMIT');
    }

    const body = (payload ?? {}) as Record<string, unknown>;
    const provider =
      (body.provider as Provider | undefined) ??
      this.defaults.provider ??
      Provider.WHATSAPP;
    const externalMessageId =
      (body.externalMessageId as string | undefined) ??
      `mock-msg-${Date.now()}`;

    const message: NormalizedMessage = {
      institutionId:
        (body.institutionId as string | undefined) ??
        this.defaults.institutionId ??
        '00000000-0000-4000-8000-000000000001',
      channelConnectionId:
        (body.channelConnectionId as string | undefined) ??
        this.defaults.channelConnectionId ??
        '00000000-0000-4000-8000-000000000010',
      provider,
      externalMessageId,
      externalConversationId:
        (body.externalConversationId as string | undefined) ?? 'mock-conv-1',
      externalSenderId: (body.externalSenderId as string | undefined) ?? 'mock-user-1',
      direction: MessageDirection.INBOUND,
      type: MessageType.TEXT,
      text: (body.text as string | undefined) ?? 'Merhaba, bilgi almak istiyorum.',
      sentAt: new Date(),
      rawMetadata: { mock: true, scenario: this.scenario, ...body },
    };

    if (this.scenario === 'duplicate_webhook') {
      return [message, { ...message }];
    }

    return [message];
  }

  async sendText(input: SendTextInput): Promise<SendResult> {
    this.assertConnected();
    if (this.scenario === 'failed') {
      return { externalMessageId: `mock-fail-${Date.now()}`, status: 'FAILED', raw: input };
    }
    const result: SendResult = {
      externalMessageId: `mock-out-${Date.now()}`,
      status: 'SENT',
      raw: { ...input, scenario: this.scenario },
    };
    this.sent.push(result);
    return result;
  }

  async sendMedia(input: SendMediaInput): Promise<SendResult> {
    return this.sendText({ to: input.to, text: input.caption ?? '[media]' });
  }

  async sendTemplate(input: SendTemplateInput): Promise<SendResult> {
    return this.sendText({
      to: input.to,
      text: `[template:${input.templateName}]`,
    });
  }

  async markAsRead(_externalMessageId: string): Promise<void> {
    this.assertConnected();
  }

  async getProfile(externalUserId: string): Promise<ProviderProfile | null> {
    return {
      externalUserId,
      displayName: 'Demo Veli',
      phone: '+905551112233',
      metadata: { mock: true },
    };
  }

  async getMedia(providerMediaId: string): Promise<{ url: string; mimeType?: string } | null> {
    return {
      url: `https://example.invalid/mock-media/${providerMediaId}`,
      mimeType: 'image/jpeg',
    };
  }

  async testConnection(): Promise<ConnectionTestResult> {
    if (this.scenario === 'token_expired') {
      return {
        ok: false,
        status: 'TOKEN_EXPIRED',
        message: 'Mock token süresi dolmuş.',
      };
    }
    return {
      ok: this.connected,
      status: this.connected ? 'CONNECTED' : 'DISCONNECTED',
      message: this.connected ? 'Mock bağlantı aktif.' : 'Mock sağlayıcı bağlı değil.',
      details: { configKeys: Object.keys(this.config) },
    };
  }

  getSentMessages(): readonly SendResult[] {
    return this.sent;
  }

  private assertConnected(): void {
    if (!this.connected) {
      throw new Error('MockProvider is not connected');
    }
  }
}
