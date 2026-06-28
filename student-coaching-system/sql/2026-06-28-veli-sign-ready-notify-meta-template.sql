-- Veli imza bildirimi — ücret + taksit planı kaydedilince (ready_to_sign)
-- Tetik: parent-sign-contracts PATCH (awaiting_admin_price → ready_to_sign)
-- Yedek: Vercel cron /api/cron/veli-sign-ready-notify-retry (*/10 dk)
--
-- META BUSINESS MANAGER:
--   Kategori: UTILITY
--   Dil: Türkçe (tr)
--   Şablon adı: veli_sign_ready_notify
--   Değişkenler (named body, sıra önemli):
--     {{veli_ad_soyad}} {{ogrenci_ad_soyad}} {{ucret_ozet}} {{imza_link}} {{kurum_adi}}
--
-- Gövde (Meta'ya yapıştırın):
--   Merhaba {{veli_ad_soyad}},
--
--   {{ogrenci_ad_soyad}} için kayıt işleminizin tamamlanabilmesi için sözleşmenizi onaylayıp imzalamanız gerekmektedir.
--
--   {{ucret_ozet}}
--
--   İmza linki:
--   {{imza_link}}
--
--   {{kurum_adi}}

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
  'Veli imza hazır — sözleşme onay bildirimi',
  'veli_sign_ready_notify',
  'Merhaba {{veli_ad_soyad}},

{{ogrenci_ad_soyad}} için kayıt işleminizin tamamlanabilmesi için sözleşmenizi onaylayıp imzalamanız gerekmektedir.

{{ucret_ozet}}

İmza linki:
{{imza_link}}

{{kurum_adi}}',
  '["veli_ad_soyad","ogrenci_ad_soyad","ucret_ozet","imza_link","kurum_adi"]'::jsonb,
  '["veli_ad_soyad","ogrenci_ad_soyad","ucret_ozet","imza_link","kurum_adi"]'::jsonb,
  'whatsapp',
  true,
  'veli_sign_ready_notify',
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
