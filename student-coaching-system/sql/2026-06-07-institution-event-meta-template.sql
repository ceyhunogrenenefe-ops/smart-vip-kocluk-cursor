-- Etkinlik WhatsApp şablonu → Meta onaylı "Etkinlik Hatırlatma + Link" (UTILITY, {{1}}…{{5}})
-- Mevcut kurulumda 2026-06-06-institution-events.sql çalıştırıldıysa yalnızca bunu çalıştırın.

ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS whatsapp_template_status TEXT;

INSERT INTO message_templates (
  type,
  name,
  content,
  variables,
  twilio_variable_bindings,
  meta_template_name,
  meta_template_language,
  meta_named_body_parameters,
  channel,
  is_active,
  whatsapp_template_status
)
VALUES (
  'institution_event_invite',
  'Etkinlik Hatırlatma + Link',
  E'Merhaba {{ad}} 👋\n{{etkinlik}} etkinliğimiz yaklaşıyor!\n📅 {{tarih}} — 🕒 {{saat}}\nAşağıdaki bağlantıdan katılabilirsiniz:\n🔗 {{link}}\nSizi aramızda görmek isteriz. 🌸',
  '["ad","etkinlik","tarih","saat","link"]'::jsonb,
  '["ad","etkinlik","tarih","saat","link"]'::jsonb,
  'etkinlik_hatirlatma_link_891bes',
  'tr',
  false,
  'whatsapp',
  true,
  'APPROVED'
)
ON CONFLICT (type) DO UPDATE SET
  name = EXCLUDED.name,
  content = EXCLUDED.content,
  variables = EXCLUDED.variables,
  twilio_variable_bindings = EXCLUDED.twilio_variable_bindings,
  meta_template_name = EXCLUDED.meta_template_name,
  meta_template_language = EXCLUDED.meta_template_language,
  meta_named_body_parameters = false,
  channel = COALESCE(message_templates.channel, EXCLUDED.channel),
  is_active = true,
  whatsapp_template_status = COALESCE(EXCLUDED.whatsapp_template_status, message_templates.whatsapp_template_status),
  updated_at = NOW();

NOTIFY pgrst, 'reload schema';
