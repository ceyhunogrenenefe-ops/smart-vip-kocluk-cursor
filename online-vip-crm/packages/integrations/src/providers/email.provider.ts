import type { EmailProvider, EmailMessage, EmailSendInput } from '../email-provider';
import type { ConnectionTestResult } from '../types';

/**
 * Stub IMAP/SMTP email adapter.
 * Credentials must be encrypted at rest; never log app passwords.
 */
export class ImapSmtpEmailProvider implements EmailProvider {
  readonly name = 'imap_smtp';

  async connect(_config: Record<string, unknown>): Promise<void> {
    throw new Error('ImapSmtpEmailProvider is not configured yet.');
  }

  async disconnect(): Promise<void> {}

  async testConnection(): Promise<ConnectionTestResult> {
    return {
      ok: false,
      status: 'SETUP_REQUIRED',
      message: 'Kurumsal e-posta (IMAP/SMTP) henüz yapılandırılmadı.',
    };
  }

  async syncMessages(_options?: { since?: Date; limit?: number }): Promise<EmailMessage[]> {
    return [];
  }

  async sendMessage(_input: EmailSendInput): Promise<{ messageId: string }> {
    throw new Error('ImapSmtpEmailProvider.sendMessage is not implemented');
  }

  async replyMessage(
    _originalMessageId: string,
    _input: Omit<EmailSendInput, 'inReplyTo'>,
  ): Promise<{ messageId: string }> {
    throw new Error('ImapSmtpEmailProvider.replyMessage is not implemented');
  }

  async downloadAttachment(
    _messageId: string,
    _filename: string,
  ): Promise<{ content: Buffer; mimeType: string } | null> {
    return null;
  }

  async refreshConnection(): Promise<void> {
    throw new Error('ImapSmtpEmailProvider.refreshConnection is not implemented');
  }
}

/** Alias matching master-prompt naming. */
export { ImapSmtpEmailProvider as EmailChannelProvider };
