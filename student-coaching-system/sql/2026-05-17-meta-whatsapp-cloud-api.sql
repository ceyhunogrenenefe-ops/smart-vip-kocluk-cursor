-- Meta WhatsApp Cloud API — şablon adı / dil + gönderim kimliği (Twilio kaldırıldı)

ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS meta_template_name TEXT;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS meta_template_language TEXT;

COMMENT ON COLUMN message_templates.meta_template_name IS 'Meta Business Manager’da onaylı şablon adı.';
COMMENT ON COLUMN message_templates.meta_template_language IS 'Şablon dil kodu (örn. tr, en_US).';

ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS meta_message_id TEXT;
ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS meta_template_name TEXT;

COMMENT ON COLUMN message_logs.meta_message_id IS 'Meta WhatsApp mesaj kimliği (wamid.*).';

-- Toplantı WhatsApp gövdesi tek değişken: {{body}} — Meta şablonunda da aynı sıra ({{1}})
INSERT INTO message_templates (name, type, content, variables, twilio_variable_bindings, meta_template_language)
VALUES (
  'Toplantı bildirimi',
  'meeting_notification',
  '{{body}}',
  '["body"]'::jsonb,
  '["body"]'::jsonb,
  'tr'
)
ON CONFLICT (type) DO NOTHING;

NOTIFY pgrst, 'reload schema';
