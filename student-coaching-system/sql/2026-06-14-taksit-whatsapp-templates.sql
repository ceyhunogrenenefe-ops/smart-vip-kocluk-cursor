-- Taksit tahsilat WhatsApp şablonları (Meta Business Manager'da aynı ad ve dil ile onaylayın)
-- Otomasyon:
--   • Ödendi işaretlenince → taksit_payment_received (PATCH anında)
--   • Vade geçince → taksit_payment_overdue (cron: /api/cron/taksit-reminders, günlük 09:00 TR)

ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS channel TEXT;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
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
  'Taksit ödemesi alındı',
  'taksit_payment_received',
  'Merhaba {{veli_ad_soyad}}, {{ogrenci_ad_soyad}} için {{taksit_no}}. taksit ödemeniz ({{tutar}}) kaydedilmiştir. Teşekkür ederiz. — {{kurum_adi}}',
  '["veli_ad_soyad","ogrenci_ad_soyad","taksit_no","tutar","kurum_adi"]'::jsonb,
  '["veli_ad_soyad","ogrenci_ad_soyad","taksit_no","tutar","kurum_adi"]'::jsonb,
  'whatsapp',
  true,
  'taksit_payment_received',
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
  'Taksit vadesi geçti hatırlatma',
  'taksit_payment_overdue',
  'Sayın {{veli_ad_soyad}}, {{ogrenci_ad_soyad}} için {{taksit_no}}. taksitin vadesi {{vade_tarihi}} idi. Tutar: {{tutar}}. Ödeme yaptıysanız kurumunuza bilgi verebilirsiniz. — {{kurum_adi}}',
  '["veli_ad_soyad","ogrenci_ad_soyad","taksit_no","tutar","vade_tarihi","kurum_adi"]'::jsonb,
  '["veli_ad_soyad","ogrenci_ad_soyad","taksit_no","tutar","vade_tarihi","kurum_adi"]'::jsonb,
  'whatsapp',
  true,
  'taksit_payment_overdue',
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

NOTIFY pgrst, 'reload schema';
