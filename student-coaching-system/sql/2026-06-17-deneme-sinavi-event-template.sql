-- YÖS deneme sınavı WhatsApp şablonu → Etkinlikler (Meta API adı: yos_deneme_snav, dil: tr)
-- Panel: Etkinlikler → «Ad ile içe aktar» veya bu SQL (Meta gövde metnini BM ile aynı yapın).

ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS channel TEXT;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS meta_named_body_parameters BOOLEAN;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS whatsapp_template_status TEXT;

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
  'YÖS deneme sınavı kayıt',
  'yos_deneme_snav',
  E'Merhaba {{ad}}, YÖS deneme sınavı kaydınız alınmıştır.',
  '["ad"]'::jsonb,
  '["ad"]'::jsonb,
  'whatsapp',
  true,
  'yos_deneme_snav',
  'tr',
  true,
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
  meta_template_name = EXCLUDED.meta_template_name,
  meta_template_language = EXCLUDED.meta_template_language,
  meta_named_body_parameters = COALESCE(EXCLUDED.meta_named_body_parameters, message_templates.meta_named_body_parameters),
  whatsapp_template_status = COALESCE(EXCLUDED.whatsapp_template_status, message_templates.whatsapp_template_status),
  updated_at = NOW();

NOTIFY pgrst, 'reload schema';
