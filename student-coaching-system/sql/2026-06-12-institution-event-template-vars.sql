-- Şablona özel ek alanlar (class_name, subject, …) — mevcut sütunlar korunur
ALTER TABLE institution_events ADD COLUMN IF NOT EXISTS template_vars JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN institution_events.template_vars IS 'WhatsApp şablonu değişkenleri; title/event_date/meeting_link dışındaki alanlar';

NOTIFY pgrst, 'reload schema';
