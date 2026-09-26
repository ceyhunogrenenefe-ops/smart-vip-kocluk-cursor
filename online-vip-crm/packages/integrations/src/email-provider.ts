import type { ConnectionTestResult } from './types';

export interface EmailMessage {
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  receivedAt?: Date;
  sentAt?: Date;
  attachments?: Array<{
    filename: string;
    mimeType: string;
    sizeBytes?: number;
    contentId?: string;
  }>;
}

export interface EmailSendInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: Array<{
    filename: string;
    mimeType: string;
    content: Buffer;
  }>;
}

/**
 * Email-specific provider (IMAP/SMTP, later Gmail / Graph).
 * Credentials must be stored encrypted — never log secrets.
 */
export interface EmailProvider {
  readonly name: string;

  connect(config: Record<string, unknown>): Promise<void>;
  disconnect(): Promise<void>;
  testConnection(): Promise<ConnectionTestResult>;
  syncMessages(options?: { since?: Date; limit?: number }): Promise<EmailMessage[]>;
  sendMessage(input: EmailSendInput): Promise<{ messageId: string }>;
  replyMessage(
    originalMessageId: string,
    input: Omit<EmailSendInput, 'inReplyTo'>,
  ): Promise<{ messageId: string }>;
  downloadAttachment(
    messageId: string,
    filename: string,
  ): Promise<{ content: Buffer; mimeType: string } | null>;
  refreshConnection(): Promise<void>;
}
