import type { MessageDirection, MessageType, Provider } from '@online-vip-crm/shared';

/** Media attachment on a normalized message. */
export interface NormalizedMedia {
  url?: string;
  mimeType?: string;
  filename?: string;
  sizeBytes?: number;
  caption?: string;
  /** Provider-specific media id for deferred download. */
  providerMediaId?: string;
}

/** Common inbound/outbound message shape across all providers. */
export interface NormalizedMessage {
  institutionId: string;
  channelConnectionId: string;
  provider: Provider;
  externalMessageId: string;
  externalConversationId: string;
  externalSenderId: string;
  direction: MessageDirection;
  type: MessageType;
  text?: string | null;
  media?: NormalizedMedia[];
  replyToExternalMessageId?: string | null;
  sentAt: Date;
  rawMetadata?: Record<string, unknown>;
}

export interface SendTextInput {
  to: string;
  text: string;
  replyToExternalMessageId?: string;
}

export interface SendMediaInput {
  to: string;
  media: NormalizedMedia;
  caption?: string;
  replyToExternalMessageId?: string;
}

export interface SendTemplateInput {
  to: string;
  templateName: string;
  language: string;
  variables?: Record<string, string>;
}

export interface SendResult {
  externalMessageId: string;
  status: 'QUEUED' | 'SENT' | 'FAILED';
  raw?: unknown;
}

export interface ProviderProfile {
  externalUserId: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  phone?: string;
  email?: string;
  metadata?: Record<string, unknown>;
}

export interface ConnectionTestResult {
  ok: boolean;
  status: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface WebhookValidationInput {
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
  rawBody: Buffer | string;
}

export interface WebhookValidationResult {
  valid: boolean;
  /** For Meta challenge handshake */
  challengeResponse?: string;
  reason?: string;
}
