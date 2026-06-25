-- Öğretmen ders hatırlatması (gateway cron — Meta şablonu gerekmez)
-- Cron: /api/cron/teacher-lesson-reminders (Vercel her 5 dk)
-- Pencere: ders başlamadan 13–17 dk (≈15 dk). Kanal: süper admin WhatsApp gateway.

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
  updated_at
)
VALUES (
  'Öğretmen ders hatırlatması (15 dk önce · gateway)',
  'teacher_lesson_reminder',
  'Sayın {{teacher_name}},

{{lesson_name}} dersiniz {{minutes_until}} dakika sonra (saat {{lesson_time}}) başlayacaktır.
Verimli bir ders geçirmenizi temenni ederiz. Yoklama almayı unutmayınız.

İyi dersler dileriz.',
  '["teacher_name","lesson_name","subject","lesson_time","minutes_until","minutes"]'::jsonb,
  '["teacher_name","lesson_name","subject","lesson_time","minutes_until","minutes"]'::jsonb,
  'gateway',
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
