-- teacher_lessons: BBB join/kayıt güncellemeleri için updated_at
-- Supabase SQL Editor’da çalıştırın (opsiyonel; API artık sütun yoksa da çalışır).

ALTER TABLE teacher_lessons
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

NOTIFY pgrst, 'reload schema';
