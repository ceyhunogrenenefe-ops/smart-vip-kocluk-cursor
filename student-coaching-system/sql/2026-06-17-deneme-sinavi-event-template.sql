-- Deneme sınavı WhatsApp şablonu → Etkinlikler dropdown (isteğe bağlı)
-- Meta BM'deki şablon adı ile birebir aynı olmalı. Panelden "Meta şablonlarını listele" ile de eklenebilir.
-- meta_template_name değerini Meta Business → WhatsApp → Şablonlar'daki API adıyla değiştirin.

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
  'Deneme sınavı kayıt onayı',
  'deneme_sinavi_kayit',
  E'Merhaba {{ad}}, deneme sınavı kaydınız alınmıştır. Detaylar için kurumumuz sizinle iletişime geçecektir.',
  '["ad"]'::jsonb,
  '["ad"]'::jsonb,
  'whatsapp',
  true,
  'deneme_sinavi_kayit',
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
