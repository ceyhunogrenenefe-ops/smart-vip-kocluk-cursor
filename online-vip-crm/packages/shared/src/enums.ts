/** System roles for RBAC. */
export enum RoleCode {
  PLATFORM_SUPER_ADMIN = 'PLATFORM_SUPER_ADMIN',
  INSTITUTION_OWNER = 'INSTITUTION_OWNER',
  INSTITUTION_ADMIN = 'INSTITUTION_ADMIN',
  REGISTRATION_STAFF = 'REGISTRATION_STAFF',
  GUIDANCE_TEACHER = 'GUIDANCE_TEACHER',
  READ_ONLY = 'READ_ONLY',
}

/** Conversation lifecycle statuses. */
export enum ConversationStatus {
  OPEN = 'OPEN',
  PENDING = 'PENDING',
  WAITING_CUSTOMER = 'WAITING_CUSTOMER',
  RESOLVED = 'RESOLVED',
  ARCHIVED = 'ARCHIVED',
  SPAM = 'SPAM',
}

/** Priority levels for conversations and tasks. */
export enum Priority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

/** Message direction. */
export enum MessageDirection {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
  INTERNAL = 'INTERNAL',
}

/** Message content types. */
export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  DOCUMENT = 'DOCUMENT',
  LOCATION = 'LOCATION',
  CONTACT = 'CONTACT',
  TEMPLATE = 'TEMPLATE',
  SYSTEM = 'SYSTEM',
  UNSUPPORTED = 'UNSUPPORTED',
}

/** Message delivery statuses. */
export enum MessageStatus {
  RECEIVED = 'RECEIVED',
  QUEUED = 'QUEUED',
  SENDING = 'SENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  FAILED = 'FAILED',
}

/** Contact classification. */
export enum ContactType {
  PARENT = 'PARENT',
  STUDENT = 'STUDENT',
  TEACHER = 'TEACHER',
  PROSPECT = 'PROSPECT',
  ALUMNI = 'ALUMNI',
  OTHER = 'OTHER',
}

/** Messaging / identity providers. */
export enum Provider {
  WHATSAPP = 'WHATSAPP',
  INSTAGRAM = 'INSTAGRAM',
  FACEBOOK = 'FACEBOOK',
  EMAIL = 'EMAIL',
  WEBSITE = 'WEBSITE',
  PHONE = 'PHONE',
  MOCK = 'MOCK',
}

/** Channel connection health statuses. */
export enum ChannelConnectionStatus {
  CONNECTED = 'CONNECTED',
  DEGRADED = 'DEGRADED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  PERMISSION_REVOKED = 'PERMISSION_REVOKED',
  WEBHOOK_ERROR = 'WEBHOOK_ERROR',
  DISCONNECTED = 'DISCONNECTED',
  SETUP_REQUIRED = 'SETUP_REQUIRED',
}

/** Task lifecycle statuses. */
export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  OVERDUE = 'OVERDUE',
}

/** Task type catalog for education CRM workflows. */
export enum TaskType {
  CALL_PARENT = 'CALL_PARENT',
  CALL_STUDENT = 'CALL_STUDENT',
  SEND_OFFER = 'SEND_OFFER',
  TRIAL_LESSON_REMINDER = 'TRIAL_LESSON_REMINDER',
  PAYMENT_CHECK = 'PAYMENT_CHECK',
  WAITING_DOCUMENTS = 'WAITING_DOCUMENTS',
  FOLLOW_UP = 'FOLLOW_UP',
  CUSTOM = 'CUSTOM',
}

/** Webhook / integration job processing statuses. */
export enum ProcessingStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
  DEAD_LETTER = 'DEAD_LETTER',
  SKIPPED = 'SKIPPED',
}

/** Lead / contact record status. */
export enum ContactStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  BLOCKED = 'BLOCKED',
  MERGED = 'MERGED',
}

/** Institution lifecycle. */
export enum InstitutionStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  TRIAL = 'TRIAL',
  CHURNED = 'CHURNED',
}
