-- Etkinlik WhatsApp planlama: tek sefer / günlük + rapor alanları
ALTER TABLE institution_events ADD COLUMN IF NOT EXISTS send_mode TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE institution_events ADD COLUMN IF NOT EXISTS scheduled_send_at TIMESTAMPTZ;
ALTER TABLE institution_events ADD COLUMN IF NOT EXISTS daily_send_time TIME;
ALTER TABLE institution_events ADD COLUMN IF NOT EXISTS schedule_status TEXT NOT NULL DEFAULT 'idle';
ALTER TABLE institution_events ADD COLUMN IF NOT EXISTS last_schedule_run_at TIMESTAMPTZ;

COMMENT ON COLUMN institution_events.send_mode IS 'manual | immediate | once | daily';
COMMENT ON COLUMN institution_events.schedule_status IS 'idle | scheduled | completed | cancelled';

NOTIFY pgrst, 'reload schema';
