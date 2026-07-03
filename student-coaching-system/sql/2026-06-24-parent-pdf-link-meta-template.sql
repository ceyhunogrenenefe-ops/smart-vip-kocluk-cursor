020adeleri ayarla-- Veli PDF (analiz / haftalık plan) — Meta şablon + indirme linki (24 saat kuralı dışında çalışır)
--
-- Meta Business → WhatsApp → Şablonlar → Yeni (UTILITY önerilir)
-- Şablon ADI (API): parent_pdf_link  — meta_template_name ile birebir aynı
-- Dil: Turkish (tr)
-- Gövde örneği (3 değişken — sıra önemli):
--
--   Merhaba,
--
--   {{1}} için {{2}} hazır.
--
--   PDF indirmek için bağlantı:
--   {{3}}
--
--   Smart VIP Koçluk
--
-- Değişken eşlemesi: {{1}}=student_name, {{2}}=baslik, {{3}}=link

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
  whatsapp_template_status
)
VALUES (
  'Veli PDF bağlantısı (Meta)',
  'parent_pdf_link',
  E'Merhaba,\n\n{{student_name}} için {{baslik}} hazır.\n\nPDF indirmek için bağlantı:\n{{link}}\n\nSmart VIP Koçluk',
  '["student_name","baslik","link"]'::jsonb,
  '["student_name","baslik","link"]'::jsonb,
  'whatsapp',
  true,
  'parent_pdf_link',
  'tr',
  false,
  'PENDING_META_APPROVAL'
)
ON CONFLICT (type) DO UPDATE SET
  name = EXCLUDED.name,
  content = EXCLUDED.content,
  variables = EXCLUDED.variables,
  twilio_variable_bindings = EXCLUDED.twilio_variable_bindings,
  channel = COALESCE(message_templates.channel, EXCLUDED.channel),
  is_active = COALESCE(EXCLUDED.is_active, true),
  meta_template_name = COALESCE(NULLIF(EXCLUDED.meta_template_name, ''), message_templates.meta_template_name),
  meta_template_language = COALESCE(EXCLUDED.meta_template_language, message_templates.meta_template_language),
  meta_named_body_parameters = COALESCE(EXCLUDED.meta_named_body_parameters, message_templates.meta_named_body_parameters),
  updated_at = NOW();

NOTIFY pgrst, 'reload schema';
