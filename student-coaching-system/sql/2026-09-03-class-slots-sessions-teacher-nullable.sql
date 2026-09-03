-- ETÜT / Deneme / Deneme Analizi gibi oturumlarda öğretmen zorunlu değil.
ALTER TABLE class_weekly_slots
  ALTER COLUMN teacher_id DROP NOT NULL;

ALTER TABLE class_sessions
  ALTER COLUMN teacher_id DROP NOT NULL;

COMMENT ON COLUMN class_weekly_slots.teacher_id IS 'Öğretmen users.id; ETÜT/Deneme gibi oturumlarda NULL olabilir';
COMMENT ON COLUMN class_sessions.teacher_id IS 'Öğretmen users.id; ETÜT/Deneme gibi oturumlarda NULL olabilir';
