import type { Provider } from '@online-vip-crm/database';

/** Base payload — every job must carry institution scope when known. */
export interface TenantScopedJob {
  institutionId: string | null;
}

export interface WebhookEventJobData extends TenantScopedJob {
  webhookEventId: string;
  provider?: Provider;
}

export interface OutboundMessageJobData extends TenantScopedJob {
  messageId: string;
  conversationId?: string;
  provider?: Provider;
}

export interface EmailSyncJobData extends TenantScopedJob {
  channelConnectionId: string;
  syncCursor?: string;
}

export interface NotificationJobData extends TenantScopedJob {
  notificationId?: string;
  userId: string;
  type: string;
  title: string;
  body?: string;
  linkUrl?: string;
  metadata?: Record<string, unknown>;
}
