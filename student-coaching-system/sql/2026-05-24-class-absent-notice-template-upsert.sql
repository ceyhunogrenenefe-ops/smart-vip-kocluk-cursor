-- Grup dersi devamsızlık — veli WhatsApp şablonu (Meta Cloud API sırası ile uyumlu)

ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS channel TEXT;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

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
  updated_at
)
VALUES (
  'Grup Devamsızlık Bildirimi (Veli)',
  'class_absent_notice',
  'Sayın veli, {{student_name}} {{lesson_date}} tarihinde {{lesson_time}} başlangıçlı {{class_name}} sınıfı {{subject}} grup canlı dersine katılmamıştır (yoklama: gelmedi).',
  '["student_name","class_name","subject","lesson_date","lesson_time"]'::jsonb,
  '["student_name","class_name","subject","lesson_date","lesson_time"]'::jsonb,
  'whatsapp',
  true,
  'class_absent_notice',
  'tr',
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
  updated_at = NOW();

NOTIFY pgrst, 'reload schema';
