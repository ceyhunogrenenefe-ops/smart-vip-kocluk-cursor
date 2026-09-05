-- Kayıt Takibi: WhatsApp / Instagram gelen (ve giden) mesajlar
-- Lead kartında son mesaj + drawer sohbet zaman çizelgesi için.

CREATE TABLE IF NOT EXISTS public.registration_channel_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id text REFERENCES public.institutions(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.registration_leads(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'instagram')),
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  phone text NULL,
  normalized_phone text NULL,
  external_contact_id text NULL,
  contact_name text NULL,
  body text NULL,
  message_type text NOT NULL DEFAULT 'text',
  external_message_id text NULL,
  payload jsonb NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reg_channel_msg_external
  ON public.registration_channel_messages (channel, external_message_id)
  WHERE external_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reg_channel_msg_lead_time
  ON public.registration_channel_messages (lead_id, occurred_at DESC)
  WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reg_channel_msg_phone
  ON public.registration_channel_messages (normalized_phone, occurred_at DESC)
  WHERE normalized_phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reg_channel_msg_ext_contact
  ON public.registration_channel_messages (channel, external_contact_id, occurred_at DESC)
  WHERE external_contact_id IS NOT NULL;

ALTER TABLE public.registration_leads
  ADD COLUMN IF NOT EXISTS last_inbound_channel text;

ALTER TABLE public.registration_leads
  ADD COLUMN IF NOT EXISTS last_inbound_snippet text;

ALTER TABLE public.registration_leads
  ADD COLUMN IF NOT EXISTS last_inbound_at timestamptz;

ALTER TABLE public.registration_leads
  ADD COLUMN IF NOT EXISTS instagram_scoped_id text;

CREATE INDEX IF NOT EXISTS idx_reg_leads_instagram_scoped
  ON public.registration_leads (institution_id, instagram_scoped_id)
  WHERE instagram_scoped_id IS NOT NULL;

COMMENT ON TABLE public.registration_channel_messages IS
  'WhatsApp/Instagram mesajları; lead kartı ve sohbet zaman çizelgesi için.';
COMMENT ON COLUMN public.registration_leads.last_inbound_snippet IS
  'Son gelen mesaj önizlemesi (kartta gösterilir).';
