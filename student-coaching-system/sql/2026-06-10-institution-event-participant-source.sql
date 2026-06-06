-- Katılımcı kaynağı: sistem öğrencisi / veli / dış liste (Excel)
ALTER TABLE institution_event_participants
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'student';

COMMENT ON COLUMN institution_event_participants.source_type IS 'student | parent | external';

NOTIFY pgrst, 'reload schema';
