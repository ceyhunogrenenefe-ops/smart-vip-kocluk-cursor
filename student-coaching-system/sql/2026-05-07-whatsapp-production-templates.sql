-- Production WhatsApp (Twilio Content / Meta onaylı şablon) alanları + gönderim logu genişletmesi

ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS twilio_content_sid TEXT;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS twilio_variable_bindings JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS whatsapp_template_status TEXT;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS whatsapp_template_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN message_templates.twilio_content_sid IS 'Twilio Content API HX… SID (WhatsApp onaylı şablon).';
COMMENT ON COLUMN message_templates.twilio_variable_bindings IS 'Twilio {{1}},{{2}} sırası — JSON dizi: ["student_name","class_name",…]. Boşsa variables sırası kullanılır.';
COMMENT ON COLUMN message_templates.whatsapp_template_status IS 'Twilio Content senkronu: approved, pending, rejected, vb.';

ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS twilio_sid TEXT;
ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS twilio_error_code TEXT;

COMMENT ON COLUMN message_logs.twilio_sid IS 'Twilio Message SID (başarılı gönderim).';
COMMENT ON COLUMN message_logs.twilio_error_code IS 'Twilio hata kodu (ör. 63016).';

NOTIFY pgrst, 'reload schema';
