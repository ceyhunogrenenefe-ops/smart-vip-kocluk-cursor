-- Veli ders hatırlatması — Meta şablonu ({{1}}-{{4}}) ile message_templates eşlemesi
-- Meta Business'ta oluşturduğunuz şablon ADINI meta_template_name olarak yazın (büyük/küçük harf aynı olmalı).

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
  updated_at = NOW();

COMMENT ON COLUMN message_templates.meta_template_name IS
  'Meta''daki şablon adı (Business Manager). Yukarıdaki varsayılan lesson_reminder_parent değilse UPDATE ile düzeltin.';

NOTIFY pgrst, 'reload schema';
