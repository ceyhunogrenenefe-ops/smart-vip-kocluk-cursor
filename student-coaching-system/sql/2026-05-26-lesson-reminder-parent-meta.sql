-- Veli ders hatırlatması — Meta şablonu ({{1}}-{{4}}) ile message_templates eşlemesi
-- Meta Business'ta oluşturduğunuz şablon ADINI meta_template_name olarak yazın (büyük/küçük harf aynı olmalı).
-- meta_named_body_parameters: class_absent_notice_1 ile aynı Meta Cloud adlandırılmış gövde; pozisyonel şablonunuz varsa panelden false yapın.

ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS meta_named_body_parameters BOOLEAN;

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
  'Ders hatırlatma — veli (Meta)',
  'lesson_reminder_parent',
  'Sayın Veli,

Öğrenciniz {{student_name}} için planlanan {{class_label}} sınıfına ait {{lesson_name}} dersi bugün saat {{lessonTime}} itibarıyla başlayacaktır.

Öğrencimizin derse zamanında katılım sağlaması önemlidir.

Bilgilerinize sunar, iyi günler dileriz.

Online VIP Dershane',
  '["student_name","class_label","lesson_name","lessonTime"]'::jsonb,
  '["student_name","class_label","lesson_name","lessonTime"]'::jsonb,
  'whatsapp',
  true,
  'lesson_reminder_parent',
  'tr',
  true,
  NOW()
)
ON CONFLICT (type) DO UPDATE SET
  name = EXCLUDED.name,
  content = EXCLUDED.content,
  variables = EXCLUDED.variables,
  twilio_variable_bindings = EXCLUDED.twilio_variable_bindings,
  channel = COALESCE(message_templates.channel, EXCLUDED.channel),
  is_active = EXCLUDED.is_active,
  meta_template_name = COALESCE(NULLIF(EXCLUDED.meta_template_name, ''), message_templates.meta_template_name),
  meta_template_language = EXCLUDED.meta_template_language,
  meta_named_body_parameters = COALESCE(message_templates.meta_named_body_parameters, EXCLUDED.meta_named_body_parameters),
  updated_at = NOW();

-- Eski migration (2026-05-14): meta_template_name boş kaldıysa cron veli gönderimini tamamen atlıyordu.
UPDATE message_templates
SET
  meta_template_name = 'lesson_reminder_parent',
  meta_named_body_parameters = COALESCE(meta_named_body_parameters, true)
WHERE type = 'lesson_reminder_parent'
  AND (meta_template_name IS NULL OR TRIM(meta_template_name) = '');

COMMENT ON COLUMN message_templates.meta_template_name IS
  'Meta''daki şablon adı (Business Manager). Yukarıdaki varsayılan lesson_reminder_parent değilse UPDATE ile düzeltin.';

NOTIFY pgrst, 'reload schema';
