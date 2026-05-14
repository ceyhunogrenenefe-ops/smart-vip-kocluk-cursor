-- Meta şablon adı: class_absent_notice_1 (message_templates.type ve meta_template_name ile hizalı)
-- Supabase SQL Editor'da bir kez çalıştırın.
-- meta_named_body_parameters: Meta Cloud API (#100) için adlandırılmış gövde parametreleri (parameter_name).

ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS meta_named_body_parameters BOOLEAN;

COMMENT ON COLUMN message_templates.meta_named_body_parameters IS 'Meta Cloud API: true ise gövde parametrelerinde parameter_name gönderilir.';

UPDATE message_logs
SET kind = 'class_absent_notice_1'
WHERE kind = 'class_absent_notice';

UPDATE message_templates
SET
  type = 'class_absent_notice_1',
  meta_template_name = 'class_absent_notice_1',
  meta_named_body_parameters = true,
  updated_at = NOW()
WHERE type = 'class_absent_notice';

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
  'Grup Devamsızlık Bildirimi (Veli)',
  'class_absent_notice_1',
  'Sayın veli, {{student_name}} {{lesson_date}} tarihinde {{lesson_time}} başlangıçlı {{class_name}} sınıfı {{subject}} grup canlı dersine katılmamıştır (yoklama: gelmedi).',
  '["student_name","class_name","subject","lesson_date","lesson_time"]'::jsonb,
  '["student_name","class_name","subject","lesson_date","lesson_time"]'::jsonb,
  'whatsapp',
  true,
  'class_absent_notice_1',
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
  is_active = EXCLUDED.is_active,
  meta_template_name = EXCLUDED.meta_template_name,
  meta_template_language = EXCLUDED.meta_template_language,
  meta_named_body_parameters = COALESCE(EXCLUDED.meta_named_body_parameters, message_templates.meta_named_body_parameters),
  updated_at = NOW();

UPDATE message_templates
SET meta_named_body_parameters = true
WHERE type = 'class_absent_notice_1' AND (meta_named_body_parameters IS DISTINCT FROM true);

NOTIFY pgrst, 'reload schema';
