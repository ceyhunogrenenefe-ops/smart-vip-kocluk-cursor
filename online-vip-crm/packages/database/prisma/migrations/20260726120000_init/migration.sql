-- Online VIP CRM initial schema
-- Migration: 20260726120000_init

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
CREATE TYPE "InstitutionStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TRIAL', 'CHURNED');
CREATE TYPE "ContactType" AS ENUM ('PARENT', 'STUDENT', 'TEACHER', 'PROSPECT', 'ALUMNI', 'OTHER');
CREATE TYPE "ContactStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED', 'MERGED');
CREATE TYPE "Provider" AS ENUM ('WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'EMAIL', 'WEBSITE', 'PHONE', 'MOCK');
CREATE TYPE "ChannelConnectionStatus" AS ENUM ('CONNECTED', 'DEGRADED', 'TOKEN_EXPIRED', 'PERMISSION_REVOKED', 'WEBHOOK_ERROR', 'DISCONNECTED', 'SETUP_REQUIRED');
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'PENDING', 'WAITING_CUSTOMER', 'RESOLVED', 'ARCHIVED', 'SPAM');
CREATE TYPE "Priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'INTERNAL');
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'LOCATION', 'CONTACT', 'TEMPLATE', 'SYSTEM', 'UNSUPPORTED');
CREATE TYPE "MessageStatus" AS ENUM ('RECEIVED', 'QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'OVERDUE');
CREATE TYPE "TaskType" AS ENUM ('CALL_PARENT', 'CALL_STUDENT', 'SEND_OFFER', 'TRIAL_LESSON_REMINDER', 'PAYMENT_CHECK', 'WAITING_DOCUMENTS', 'FOLLOW_UP', 'CUSTOM');
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER', 'SKIPPED');
CREATE TYPE "SyncStatus" AS ENUM ('IDLE', 'SYNCING', 'SUCCESS', 'ERROR');

-- Platform
CREATE TABLE "institutions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "InstitutionStatus" NOT NULL DEFAULT 'TRIAL',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "locale" TEXT NOT NULL DEFAULT 'tr-TR',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "institutions_slug_key" ON "institutions"("slug");

CREATE TABLE "institution_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "brand_name" TEXT,
    "logo_url" TEXT,
    "brand_colors" JSONB NOT NULL DEFAULT '{}',
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "website_url" TEXT,
    "address" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "institution_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "institution_settings_institution_id_key" ON "institution_settings"("institution_id");

CREATE TABLE "plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

CREATE TABLE "plan_features" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "plan_id" UUID NOT NULL,
    "feature_key" TEXT NOT NULL,
    "limit_value" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "plan_features_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "plan_features_plan_id_feature_key_key" ON "plan_features"("plan_id", "feature_key");

CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subscriptions_institution_id_key" ON "subscriptions"("institution_id");

-- Auth / RBAC
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "display_name" TEXT,
    "phone" TEXT,
    "avatar_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_platform_admin" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "group_name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_key" ON "role_permissions"("role_id", "permission_id");

CREATE TABLE "user_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "institution_id" UUID,
    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_roles_user_id_role_id_institution_id_key" ON "user_roles"("user_id", "role_id", "institution_id");

CREATE TABLE "user_institutions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_institutions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_institutions_user_id_institution_id_key" ON "user_institutions"("user_id", "institution_id");

CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "institution_id" UUID,
    "token_hash" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- Channels
CREATE TABLE "channel_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "provider" "Provider" NOT NULL,
    "display_name" TEXT NOT NULL,
    "account_name" TEXT,
    "provider_account_id" TEXT,
    "status" "ChannelConnectionStatus" NOT NULL DEFAULT 'SETUP_REQUIRED',
    "last_synced_at" TIMESTAMP(3),
    "sync_status" "SyncStatus" NOT NULL DEFAULT 'IDLE',
    "sync_error" TEXT,
    "webhook_status" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "channel_connections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "channel_connections_institution_id_provider_provider_account_id_key" ON "channel_connections"("institution_id", "provider", "provider_account_id");
CREATE INDEX "channel_connections_institution_id_provider_idx" ON "channel_connections"("institution_id", "provider");

CREATE TABLE "channel_credentials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channel_connection_id" UUID NOT NULL,
    "encrypted_payload" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "channel_credentials_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "channel_credentials_channel_connection_id_key" ON "channel_credentials"("channel_connection_id");

CREATE TABLE "channel_health_checks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channel_connection_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "channel_health_checks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "channel_health_checks_channel_connection_id_checked_at_idx" ON "channel_health_checks"("channel_connection_id", "checked_at");

-- Contacts
CREATE TABLE "contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "display_name" TEXT,
    "primary_phone" TEXT,
    "primary_email" TEXT,
    "city" TEXT,
    "district" TEXT,
    "country" TEXT DEFAULT 'TR',
    "contact_type" "ContactType" NOT NULL DEFAULT 'PROSPECT',
    "source" TEXT,
    "assigned_user_id" UUID,
    "status" "ContactStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "merged_into_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "contacts_institution_id_primary_phone_idx" ON "contacts"("institution_id", "primary_phone");
CREATE INDEX "contacts_institution_id_primary_email_idx" ON "contacts"("institution_id", "primary_email");
CREATE INDEX "contacts_institution_id_assigned_user_id_idx" ON "contacts"("institution_id", "assigned_user_id");

CREATE TABLE "contact_identities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contact_id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "provider" "Provider" NOT NULL,
    "provider_account_id" TEXT,
    "external_user_id" TEXT NOT NULL,
    "username" TEXT,
    "normalized_value" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contact_identities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "contact_identities_institution_id_provider_external_user_id_key" ON "contact_identities"("institution_id", "provider", "external_user_id");
CREATE INDEX "contact_identities_contact_id_idx" ON "contact_identities"("contact_id");

CREATE TABLE "students" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "grade_level" TEXT,
    "school_name" TEXT,
    "program" TEXT,
    "enrollment_status" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "students_contact_id_key" ON "students"("contact_id");
CREATE INDEX "students_institution_id_idx" ON "students"("institution_id");

CREATE TABLE "parents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "relationship" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "parents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "parents_contact_id_key" ON "parents"("contact_id");
CREATE INDEX "parents_institution_id_idx" ON "parents"("institution_id");

CREATE TABLE "student_parents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "student_parents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "student_parents_student_id_parent_id_key" ON "student_parents"("student_id", "parent_id");

CREATE TABLE "tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tags_institution_id_name_key" ON "tags"("institution_id", "name");

CREATE TABLE "contact_tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contact_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    CONSTRAINT "contact_tags_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "contact_tags_contact_id_tag_id_key" ON "contact_tags"("contact_id", "tag_id");

CREATE TABLE "contact_merge_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "source_contact_id" UUID NOT NULL,
    "target_contact_id" UUID NOT NULL,
    "merged_by_user_id" UUID,
    "preview" JSONB NOT NULL DEFAULT '{}',
    "redirect_info" JSONB NOT NULL DEFAULT '{}',
    "can_revert" BOOLEAN NOT NULL DEFAULT true,
    "reverted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contact_merge_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "contact_merge_history_institution_id_idx" ON "contact_merge_history"("institution_id");

-- Conversations / messages
CREATE TABLE "conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "channel_connection_id" UUID,
    "contact_id" UUID,
    "provider" "Provider" NOT NULL,
    "external_conversation_id" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "subject" TEXT,
    "last_message_at" TIMESTAMP(3),
    "last_message_preview" TEXT,
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "conversations_institution_id_provider_external_conversation_id_key" ON "conversations"("institution_id", "provider", "external_conversation_id");
CREATE INDEX "conversations_institution_id_status_last_message_at_idx" ON "conversations"("institution_id", "status", "last_message_at");
CREATE INDEX "conversations_institution_id_contact_id_idx" ON "conversations"("institution_id", "contact_id");

CREATE TABLE "conversation_participants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "contact_id" UUID,
    "external_user_id" TEXT,
    "role" TEXT NOT NULL DEFAULT 'customer',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "conversation_participants_conversation_id_idx" ON "conversation_participants"("conversation_id");

CREATE TABLE "conversation_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "conversation_assignments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "conversation_assignments_conversation_id_is_active_idx" ON "conversation_assignments"("conversation_id", "is_active");
CREATE INDEX "conversation_assignments_user_id_is_active_idx" ON "conversation_assignments"("user_id", "is_active");

CREATE TABLE "messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "channel_connection_id" UUID,
    "provider" "Provider" NOT NULL,
    "external_message_id" TEXT,
    "direction" "MessageDirection" NOT NULL,
    "message_type" "MessageType" NOT NULL DEFAULT 'TEXT',
    "text_content" TEXT,
    "reply_to_message_id" UUID,
    "sender_contact_id" UUID,
    "sender_user_id" UUID,
    "status" "MessageStatus" NOT NULL DEFAULT 'RECEIVED',
    "provider_timestamp" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "failure_code" TEXT,
    "failure_message" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "messages_institution_id_provider_external_message_id_key" ON "messages"("institution_id", "provider", "external_message_id");
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");
CREATE INDEX "messages_institution_id_status_idx" ON "messages"("institution_id", "status");

CREATE TABLE "message_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "message_id" UUID NOT NULL,
    "file_id" UUID,
    "url" TEXT,
    "mime_type" TEXT,
    "filename" TEXT,
    "size_bytes" INTEGER,
    "provider_media_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "message_attachments_message_id_idx" ON "message_attachments"("message_id");

CREATE TABLE "message_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "message_id" UUID NOT NULL,
    "status" "MessageStatus" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "message_status_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "message_status_history_message_id_occurred_at_idx" ON "message_status_history"("message_id", "occurred_at");

CREATE TABLE "internal_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "conversation_id" UUID,
    "contact_id" UUID,
    "author_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "internal_notes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "internal_notes_institution_id_conversation_id_idx" ON "internal_notes"("institution_id", "conversation_id");

-- Sales
CREATE TABLE "pipelines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pipelines_institution_id_idx" ON "pipelines"("institution_id");

CREATE TABLE "pipeline_stages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pipeline_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL,
    "is_won" BOOLEAN NOT NULL DEFAULT false,
    "is_lost" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pipeline_stages_pipeline_id_key_key" ON "pipeline_stages"("pipeline_id", "key");
CREATE INDEX "pipeline_stages_pipeline_id_sort_order_idx" ON "pipeline_stages"("pipeline_id", "sort_order");

CREATE TABLE "lost_reasons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lost_reasons_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "lost_reasons_institution_id_name_key" ON "lost_reasons"("institution_id", "name");

CREATE TABLE "leads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "student_id" UUID,
    "pipeline_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT,
    "campaign" TEXT,
    "form_name" TEXT,
    "program" TEXT,
    "grade_level" TEXT,
    "estimated_value" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "probability" INTEGER,
    "assigned_user_id" UUID,
    "lost_reason_id" UUID,
    "next_action_at" TIMESTAMP(3),
    "last_contact_at" TIMESTAMP(3),
    "won_at" TIMESTAMP(3),
    "lost_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "leads_institution_id_stage_id_idx" ON "leads"("institution_id", "stage_id");
CREATE INDEX "leads_institution_id_assigned_user_id_idx" ON "leads"("institution_id", "assigned_user_id");

CREATE TABLE "lead_stage_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lead_id" UUID NOT NULL,
    "from_stage_id" UUID,
    "to_stage_id" UUID NOT NULL,
    "changed_by" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lead_stage_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "lead_stage_history_lead_id_created_at_idx" ON "lead_stage_history"("lead_id", "created_at");

-- Tasks
CREATE TABLE "tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "task_type" "TaskType" NOT NULL DEFAULT 'CUSTOM',
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "assigned_user_id" UUID,
    "created_by" UUID,
    "contact_id" UUID,
    "lead_id" UUID,
    "conversation_id" UUID,
    "due_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "reminder_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tasks_institution_id_status_due_at_idx" ON "tasks"("institution_id", "status", "due_at");
CREATE INDEX "tasks_assigned_user_id_status_idx" ON "tasks"("assigned_user_id", "status");

CREATE TABLE "task_reminders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "remind_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "channel" TEXT NOT NULL DEFAULT 'in_app',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_reminders_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "task_reminders_remind_at_sent_at_idx" ON "task_reminders"("remind_at", "sent_at");

-- Content
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link_url" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "notifications"("user_id", "is_read", "created_at");

CREATE TABLE "canned_responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "shortcut" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "canned_responses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "canned_responses_institution_id_idx" ON "canned_responses"("institution_id");

CREATE TABLE "message_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "provider" "Provider",
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'tr',
    "body" TEXT NOT NULL,
    "category" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "external_template_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "message_templates_institution_id_name_language_key" ON "message_templates"("institution_id", "name", "language");

CREATE TABLE "template_variables" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT,
    "example" TEXT,
    CONSTRAINT "template_variables_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "template_variables_template_id_key_key" ON "template_variables"("template_id", "key");

-- Integrations
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID,
    "provider" "Provider" NOT NULL,
    "external_event_id" TEXT,
    "event_type" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "processing_status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "last_error" TEXT,
    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "webhook_events_provider_external_event_id_key" ON "webhook_events"("provider", "external_event_id");
CREATE INDEX "webhook_events_processing_status_received_at_idx" ON "webhook_events"("processing_status", "received_at");
CREATE INDEX "webhook_events_payload_hash_idx" ON "webhook_events"("payload_hash");

CREATE TABLE "integration_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "provider" "Provider",
    "job_type" TEXT NOT NULL,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "integration_jobs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "integration_jobs_status_run_at_idx" ON "integration_jobs"("status", "run_at");

CREATE TABLE "integration_errors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "provider" "Provider",
    "code" TEXT,
    "message" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "integration_errors_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "integration_errors_institution_id_created_at_idx" ON "integration_errors"("institution_id", "created_at");

CREATE TABLE "dead_letter_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID,
    "provider" "Provider",
    "source_table" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replayed_at" TIMESTAMP(3),
    CONSTRAINT "dead_letter_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "dead_letter_events_created_at_idx" ON "dead_letter_events"("created_at");

-- Files / audit / compliance
CREATE TABLE "files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "checksum" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "files_institution_id_idx" ON "files"("institution_id");

CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_institution_id_created_at_idx" ON "audit_logs"("institution_id", "created_at");
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

CREATE TABLE "consent_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "contact_id" UUID,
    "channel" "Provider",
    "consent_type" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "granted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "consent_records_institution_id_contact_id_idx" ON "consent_records"("institution_id", "contact_id");

CREATE TABLE "data_retention_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "retention_days" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "data_retention_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "data_retention_policies_institution_id_entity_type_key" ON "data_retention_policies"("institution_id", "entity_type");

-- Foreign keys
ALTER TABLE "institution_settings" ADD CONSTRAINT "institution_settings_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_institutions" ADD CONSTRAINT "user_institutions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_institutions" ADD CONSTRAINT "user_institutions_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "channel_credentials" ADD CONSTRAINT "channel_credentials_channel_connection_id_fkey" FOREIGN KEY ("channel_connection_id") REFERENCES "channel_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "channel_health_checks" ADD CONSTRAINT "channel_health_checks_channel_connection_id_fkey" FOREIGN KEY ("channel_connection_id") REFERENCES "channel_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "students" ADD CONSTRAINT "students_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "students" ADD CONSTRAINT "students_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "parents" ADD CONSTRAINT "parents_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "parents" ADD CONSTRAINT "parents_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_parents" ADD CONSTRAINT "student_parents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_parents" ADD CONSTRAINT "student_parents_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tags" ADD CONSTRAINT "tags_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_merge_history" ADD CONSTRAINT "contact_merge_history_source_contact_id_fkey" FOREIGN KEY ("source_contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_merge_history" ADD CONSTRAINT "contact_merge_history_target_contact_id_fkey" FOREIGN KEY ("target_contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channel_connection_id_fkey" FOREIGN KEY ("channel_connection_id") REFERENCES "channel_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversation_assignments" ADD CONSTRAINT "conversation_assignments_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_assignments" ADD CONSTRAINT "conversation_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_connection_id_fkey" FOREIGN KEY ("channel_connection_id") REFERENCES "channel_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_contact_id_fkey" FOREIGN KEY ("sender_contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "message_status_history" ADD CONSTRAINT "message_status_history_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lost_reasons" ADD CONSTRAINT "lost_reasons_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_lost_reason_id_fkey" FOREIGN KEY ("lost_reason_id") REFERENCES "lost_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lead_stage_history" ADD CONSTRAINT "lead_stage_history_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_stage_history" ADD CONSTRAINT "lead_stage_history_to_stage_id_fkey" FOREIGN KEY ("to_stage_id") REFERENCES "pipeline_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "task_reminders" ADD CONSTRAINT "task_reminders_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "canned_responses" ADD CONSTRAINT "canned_responses_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "template_variables" ADD CONSTRAINT "template_variables_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "message_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "integration_jobs" ADD CONSTRAINT "integration_jobs_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integration_errors" ADD CONSTRAINT "integration_errors_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dead_letter_events" ADD CONSTRAINT "dead_letter_events_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "files" ADD CONSTRAINT "files_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "data_retention_policies" ADD CONSTRAINT "data_retention_policies_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
