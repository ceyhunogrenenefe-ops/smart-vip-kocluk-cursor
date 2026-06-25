-- Toplu oluşturulan tarihli grup dersi oturumlarını birlikte düzenleme/silme
ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS schedule_batch_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_class_sessions_schedule_batch_id
  ON class_sessions (schedule_batch_id)
  WHERE schedule_batch_id IS NOT NULL;

COMMENT ON COLUMN class_sessions.schedule_batch_id IS 'bulk-schedule-sessions ile aynı anda oluşturulan oturum grubu';
