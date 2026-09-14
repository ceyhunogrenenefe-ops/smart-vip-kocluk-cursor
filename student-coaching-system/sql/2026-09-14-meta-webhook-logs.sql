-- Meta webhook dayanıklı günlük (CRM tanılama)
CREATE TABLE IF NOT EXISTS public.meta_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NULL,
  object_type text NULL,
  event_type text NULL,
  page_id text NULL,
  instagram_account_id text NULL,
  sender_id text NULL,
  recipient_id text NULL,
  message_id text NULL,
  comment_id text NULL,
  payload_json jsonb NULL,
  processing_status text NOT NULL DEFAULT 'received',
  processing_error text NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL
);
CREATE INDEX IF NOT EXISTS idx_meta_webhook_logs_received
  ON public.meta_webhook_logs (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_webhook_logs_status
  ON public.meta_webhook_logs (processing_status, received_at DESC);
COMMENT ON TABLE public.meta_webhook_logs IS
  'Her Meta webhook payload — processing_status: received|processed|error';
