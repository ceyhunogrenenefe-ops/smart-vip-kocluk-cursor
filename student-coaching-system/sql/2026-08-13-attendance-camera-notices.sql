-- Yoklama: kamera durumu + veli bilgilendirme şablonları
-- RUN IN SUPABASE SQL EDITOR (production)

ALTER TABLE class_session_attendance
  ADD COLUMN IF NOT EXISTS camera_status text;

DO $$
BEGIN
  ALTER TABLE class_session_attendance DROP CONSTRAINT IF EXISTS class_session_attendance_camera_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE class_session_attendance
  ADD CONSTRAINT class_session_attendance_camera_check
  CHECK (camera_status IS NULL OR camera_status IN ('on', 'off', 'n_a'));

COMMENT ON COLUMN class_session_attendance.camera_status IS
  'on=kamera açık, off=kamera kapalı, n_a=uygulanamaz (katılmadı)';

UPDATE class_session_attendance
SET camera_status = 'n_a'
WHERE status = 'absent' AND camera_status IS NULL;

-- Sabit veli şablonları (öğretmen yoklamadan önce görür / düzenler)
INSERT INTO message_templates (
  name,
  type,
  content,
  variables,
  twilio_variable_bindings,
  channel,
  is_active,
  updated_at
)
VALUES
  (
    'Yoklama — derse katılmayan öğrenci (veli)',
    'class_absent_parent_notice',
    'Sayın velimiz, öğrencimiz {{student_name}}, {{subject}} dersine katılmamıştır. Bilginize.',
    '["student_name","subject"]'::jsonb,
    '["student_name","subject"]'::jsonb,
    'whatsapp',
    true,
    NOW()
  ),
  (
    'Yoklama — kamerası kapalı öğrenci (veli)',
    'class_camera_off_notice',
    'Sayın velimiz, öğrencimiz {{student_name}}, {{subject}} dersine katılmış ancak ders sırasında kamerasını açmamıştır. Bilginize.',
    '["student_name","subject"]'::jsonb,
    '["student_name","subject"]'::jsonb,
    'whatsapp',
    true,
    NOW()
  )
ON CONFLICT (type) DO UPDATE SET
  name = EXCLUDED.name,
  content = EXCLUDED.content,
  variables = EXCLUDED.variables,
  twilio_variable_bindings = EXCLUDED.twilio_variable_bindings,
  channel = EXCLUDED.channel,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

NOTIFY pgrst, 'reload schema';
