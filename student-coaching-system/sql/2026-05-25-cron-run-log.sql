-- WhatsApp Merkezi / cron sağlık ekranı için son çalışma kayıtları

CREATE TABLE IF NOT EXISTS cron_run_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_key TEXT NOT NULL,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ok BOOLEAN NOT NULL DEFAULT TRUE,
  skipped TEXT,
  messages_sent INT NOT NULL DEFAULT 0,
  messages_failed INT NOT NULL DEFAULT 0,
  detail JSONB
);

CREATE INDEX IF NOT EXISTS idx_cron_run_log_job_ran_at ON cron_run_log (job_key, ran_at DESC);

COMMENT ON TABLE cron_run_log IS 'Vercel cron çalışma özeti (WhatsApp Merkezi görünürlüğü).';

NOTIFY pgrst, 'reload schema';
