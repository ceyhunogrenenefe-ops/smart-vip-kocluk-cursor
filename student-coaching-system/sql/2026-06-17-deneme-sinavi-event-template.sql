-- YÖS deneme sınavı WhatsApp şablonu → Etkinlikler
-- Meta API adı: yos_deneme_snav · dil: tr (Turkish)
-- Meta BM'deki parametre adları farklıysa variables / twilio_variable_bindings dizisini birebir eşleştirin.

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
  'YÖS Deneme Sınavı Kayıt',
  'yos_deneme_snav',
  E'Merhaba {{ad}},
🎉 YÖS Deneme Sınavı kayıt işleminiz başarıyla tamamlanmıştır.
Sınava katılım sağlayacağınız sistem bağlantısı:
🔗 {{sinav_sistemi_linki}}
Deneme PDF''ine aşağıdaki bağlantıdan ulaşabilirsiniz:
📄 {{pdf_linki}}
Sınava nasıl katılacağınızı anlatan video:
🎥 {{katilim_video_linki}}
📌 Lütfen sınav gününden önce sisteme giriş yaparak kontrol sağlayınız.
Sınav sonrasında sonuçlarınız uzman eğitim danışmanlarımız tarafından değerlendirilerek sizinle paylaşılacaktır.
Eğitim danışmanlarımız en kısa sürede sizinle iletişime geçecektir.
Başarılar dileriz.
Online VIP Dershane
🌐 www.onlinevipdershane.com
📞 0850 303 40 14',
  '["ad","sinav_sistemi_linki","pdf_linki","katilim_video_linki"]'::jsonb,
  '["ad","sinav_sistemi_linki","pdf_linki","katilim_video_linki"]'::jsonb,
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
