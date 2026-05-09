-- Grup canlı ders 10 dk hatırlatma: şablon satırı + message_logs.related_id için FK esnetmesi

-- Opsiyonel: kanal ve aktiflik (cron bu alanları okuyabilir)
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS channel TEXT;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN message_templates.channel IS 'Örn: whatsapp';
COMMENT ON COLUMN message_templates.is_active IS 'false ise ilgili otomasyon cron şablonu kullanmasın';

-- class_sessions.uuid related_id olarak yazılabilsin (önceden sadece teacher_lessons FK vardı)
ALTER TABLE message_logs DROP CONSTRAINT IF EXISTS message_logs_related_id_fkey;

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
  'Grup Dersi Hatırlatma',
  'class_lesson_reminder',
  'Merhaba {{student_name}}, {{class_name}} sınıfı {{subject}} dersi saat {{lesson_time}}''de başlayacak. Katılım linki: {{meeting_link}}',
  '["student_name","class_name","subject","lesson_time","meeting_link"]'::jsonb,
  '["student_name","class_name","subject","lesson_time","meeting_link"]'::jsonb,
  'whatsapp',
  true,
  'class_lesson_reminder',
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
