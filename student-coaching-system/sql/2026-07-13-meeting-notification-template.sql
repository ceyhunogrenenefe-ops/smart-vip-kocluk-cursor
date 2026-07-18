-- Meta onaylı şablon: toplant_hatrlatma (tr) — sondaki i yok
-- Gövde {{1}} = isim
-- Cron: vercel.json → /api/cron/meeting-reminders her 5 dk

ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS channel TEXT;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS meta_named_body_parameters BOOLEAN;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS whatsapp_template_status TEXT;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS meta_template_name TEXT;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS meta_template_language TEXT;

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
  whatsapp_template_status,
  updated_at
)
VALUES (
  'Toplantı hatırlatma',
  'meeting_notification',
  E'Online VIP Dershane — görüşme hatırlatması\n{{isim}} 10 dakika içinde görüşmeniz başlıyor.\nhttps://www.dersonlinevipkocluk.com',
  '["isim"]'::jsonb,
  '["isim"]'::jsonb,
  'whatsapp',
  true,
  'toplant_hatrlatma',
  'tr',
  false,
  'APPROVED',
  NOW()
)
ON CONFLICT (type) DO UPDATE SET
  name = EXCLUDED.name,
  content = EXCLUDED.content,
  variables = EXCLUDED.variables,
  twilio_variable_bindings = EXCLUDED.twilio_variable_bindings,
  channel = EXCLUDED.channel,
  is_active = true,
  meta_template_name = 'toplant_hatrlatma',
  meta_template_language = 'tr',
  meta_named_body_parameters = false,
  whatsapp_template_status = 'APPROVED',
  updated_at = NOW();

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
  whatsapp_template_status,
  updated_at
)
VALUES (
  'Görüşme hatırlatma',
  'meeting_reminder',
  E'Online VIP Dershane — görüşme hatırlatması\n{{isim}} 10 dakika içinde görüşmeniz başlıyor.\nhttps://www.dersonlinevipkocluk.com',
  '["isim"]'::jsonb,
  '["isim"]'::jsonb,
  'whatsapp',
  true,
  'toplant_hatrlatma',
  'tr',
  false,
  'APPROVED',
  NOW()
)
ON CONFLICT (type) DO UPDATE SET
  name = EXCLUDED.name,
  content = EXCLUDED.content,
  variables = EXCLUDED.variables,
  twilio_variable_bindings = EXCLUDED.twilio_variable_bindings,
  channel = EXCLUDED.channel,
  is_active = true,
  meta_template_name = 'toplant_hatrlatma',
  meta_template_language = 'tr',
  meta_named_body_parameters = false,
  whatsapp_template_status = 'APPROVED',
  updated_at = NOW();

NOTIFY pgrst, 'reload schema';
