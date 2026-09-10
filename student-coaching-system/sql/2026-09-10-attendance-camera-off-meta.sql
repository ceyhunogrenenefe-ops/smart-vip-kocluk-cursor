-- Kamera kapalı veli şablonu: Meta adı + idempotency index
-- (Kaydet anında otomatik tetik için meta_template_name zorunlu)

ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS meta_named_body_parameters BOOLEAN;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS meta_template_name text;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS meta_template_language text;

INSERT INTO message_templates (
  name,
  type,
  content,
  variables,
  twilio_variable_bindings,
  channel,
  is_active,
  meta_template_name,
  meta_template_language,
  meta_named_body_parameters,
  updated_at
)
VALUES (
  'Yoklama — kamerası kapalı öğrenci (veli)',
  'class_camera_off_notice',
  E'Sayın velimiz, öğrencimiz {{student_name}}, {{subject}} dersine katılmış ancak ders sırasında kamerasını açmamıştır. Bilginize.',
  '["student_name","subject"]'::jsonb,
  '["student_name","subject"]'::jsonb,
  'whatsapp',
  true,
  'class_camera_off_notice',
  'tr',
  true,
  NOW()
)
ON CONFLICT (type) DO UPDATE SET
  name = EXCLUDED.name,
  content = EXCLUDED.content,
  variables = EXCLUDED.variables,
  twilio_variable_bindings = EXCLUDED.twilio_variable_bindings,
  channel = EXCLUDED.channel,
  is_active = true,
  meta_template_name = COALESCE(NULLIF(message_templates.meta_template_name, ''), EXCLUDED.meta_template_name),
  meta_template_language = COALESCE(NULLIF(message_templates.meta_template_language, ''), 'tr'),
  meta_named_body_parameters = COALESCE(message_templates.meta_named_body_parameters, true),
  updated_at = NOW();

CREATE UNIQUE INDEX IF NOT EXISTS uq_message_logs_camera_off_sent
  ON message_logs (related_id, student_id, kind)
  WHERE status = 'sent'
    AND kind = 'class_camera_off_notice'
    AND related_id IS NOT NULL
    AND student_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
