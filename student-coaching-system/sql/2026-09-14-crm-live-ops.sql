-- CRM canlı operasyon: ajan presence + 5 dk yanıtsız SLA uyarısı
CREATE TABLE IF NOT EXISTS public.crm_agent_presence (
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  institution_id text NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  page_path text NULL,
  user_agent text NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_agent_presence_seen
  ON public.crm_agent_presence (institution_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.crm_reply_sla_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id text NULL,
  conversation_id uuid NOT NULL REFERENCES public.crm_conversations(id) ON DELETE CASCADE,
  inbound_message_id uuid NULL,
  channel text NULL,
  contact_name text NULL,
  contact_identifier text NULL,
  waiting_seconds int NULL,
  manager_phone text NULL,
  notified_at timestamptz NOT NULL DEFAULT now(),
  meta_message_id text NULL,
  UNIQUE (conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_reply_sla_notified
  ON public.crm_reply_sla_alerts (notified_at DESC);
