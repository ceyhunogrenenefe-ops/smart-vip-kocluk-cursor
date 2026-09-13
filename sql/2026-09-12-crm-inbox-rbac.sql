-- CRM Unified Inbox + RBAC (Multi-tenant)
-- Supabase SQL Editor'da çalıştırın.
-- WhatsApp Cloud API + Instagram DM konuşmaları; ajan ataması.

-- =============================================================================
-- 1) Konuşmalar
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.crm_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id text NULL REFERENCES public.institutions(id) ON DELETE SET NULL,
  contact_identifier text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'facebook')),
  contact_name text NULL,
  assigned_user_id text NULL REFERENCES public.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'closed')),
  lead_id uuid NULL,
  ad_source_data jsonb NULL DEFAULT '{}'::jsonb,
  last_message_at timestamptz NULL,
  last_message_preview text NULL,
  unread_count int NOT NULL DEFAULT 0,
  metadata jsonb NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_conversations_channel_contact_inst
  ON public.crm_conversations (institution_id, channel, contact_identifier);

CREATE INDEX IF NOT EXISTS idx_crm_conversations_assigned
  ON public.crm_conversations (assigned_user_id, status, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_crm_conversations_pool
  ON public.crm_conversations (institution_id, status, last_message_at DESC NULLS LAST)
  WHERE assigned_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_crm_conversations_lead
  ON public.crm_conversations (lead_id)
  WHERE lead_id IS NOT NULL;

COMMENT ON TABLE public.crm_conversations IS
  'CRM unified inbox konuşmaları (WhatsApp / Instagram).';
COMMENT ON COLUMN public.crm_conversations.contact_identifier IS
  'WA: E.164/digits; IG: Instagram-scoped user id.';
COMMENT ON COLUMN public.crm_conversations.ad_source_data IS
  'Click-to-WhatsApp / IG ad referral metadata (campaign, ad_id, source_url, …).';

-- =============================================================================
-- 2) Mesajlar
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.crm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.crm_conversations(id) ON DELETE CASCADE,
  institution_id text NULL,
  sender_type text NOT NULL CHECK (sender_type IN ('lead', 'agent', 'bot', 'system')),
  sender_id text NULL,
  body text NULL,
  media_url text NULL,
  message_type text NOT NULL DEFAULT 'text',
  message_id text NULL,
  delivery_status text NULL,
  payload jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_messages_message_id
  ON public.crm_messages (message_id)
  WHERE message_id IS NOT NULL;

ALTER TABLE public.crm_messages ADD COLUMN IF NOT EXISTS external_message_id text;
UPDATE public.crm_messages
SET message_id = external_message_id
WHERE message_id IS NULL AND external_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_messages_conversation_time
  ON public.crm_messages (conversation_id, created_at ASC);

COMMENT ON TABLE public.crm_messages IS
  'CRM inbox mesajları (normalize; Meta message id ile idempotent).';

-- =============================================================================
-- 3) CRM ajan atamaları / izinler
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.crm_user_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  institution_id text NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  can_access_unassigned_pool boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  notes text NULL,
  created_by text NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, institution_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_user_assignments_active
  ON public.crm_user_assignments (institution_id, is_active)
  WHERE is_active = true;

COMMENT ON TABLE public.crm_user_assignments IS
  'CRM ajan kapsamı: hangi kurumda ajan, havuz erişimi.';

-- users.role / users.roles dizisine 'crm_agent' eklenebilir (uygulama katmanı).
-- Mevcut koç/admin kullanıcılar buraya atanarak CRM ajanı yapılabilir.
