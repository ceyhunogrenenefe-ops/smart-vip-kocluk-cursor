-- Meta webhook teşhis: gerçekten istek geliyor mu?
-- Supabase SQL Editor'da bir kez çalıştırın.

CREATE TABLE IF NOT EXISTS public.meta_webhook_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  object_type text NULL,
  field text NULL,
  message_count int NOT NULL DEFAULT 0,
  status_count int NOT NULL DEFAULT 0,
  phone_number_id text NULL,
  display_phone text NULL,
  wa_from text NULL,
  sample jsonb NULL
);

CREATE INDEX IF NOT EXISTS idx_meta_webhook_hits_received
  ON public.meta_webhook_hits (received_at DESC);

COMMENT ON TABLE public.meta_webhook_hits IS
  'Meta /api/meta/webhook POST teşhisi — messages gelmiyorsa bu tablo boş kalır.';
