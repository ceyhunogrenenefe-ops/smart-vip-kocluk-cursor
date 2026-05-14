-- Grup canlı ders ~10 dk hatırlatma: şablon satırı + message_logs.related_id için FK esnetmesi
-- Cron: /api/cron/class-lesson-reminders (Vercel her 5 dk). Oturum: status=scheduled, reminder_sent=false,
--       ders başlangıcına kalan süre (0, 10] dakika aralığında iken gönderim.

-- Opsiyonel: kanal ve aktiflik (cron bu alanları okuyabilir)
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS channel TEXT;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS meta_named_body_parameters BOOLEAN;

COMMENT ON COLUMN message_templates.channel IS 'Örn: whatsapp';
COMMENT ON COLUMN message_templates.is_active IS 'false ise ilgili otomasyon cron şablonu kullanmasın';
COMMENT ON COLUMN message_templates.meta_named_body_parameters IS 'Meta: true ise gövde parametrelerinde parameter_name gönderilir.';

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
  meta_named_body_parameters,
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

-- Mevcut kurulumda satır varken adlandırılmış parametre açık olsun (Meta (#100) önlemi)
UPDATE message_templates
SET meta_named_body_parameters = true
WHERE type = 'class_lesson_reminder' AND (meta_named_body_parameters IS DISTINCT FROM true);

NOTIFY pgrst, 'reload schema';
