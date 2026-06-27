-- Veli kayıt formu → kurum adminlerine Meta WhatsApp bildirimi
-- Tetik: parent-sign-contracts submit_registration_form (anında)
-- Yedek: Vercel cron /api/cron/veli-kayit-admin-notify-retry (*/10 dk)
--
-- META BUSINESS MANAGER — şablon oluşturma:
--   Kategori: UTILITY
--   Dil: Türkçe (tr)
--   Şablon adı (meta_template_name): veli_kayit_admin_notify
--   Değişkenler (sıra önemli — named body):
--     {{kurum_adi}} {{ogrenci_ad_soyad}} {{veli_ad_soyad}} {{program_sinif}} {{veli_tel}} {{sozlesme_no}}
--
-- Gövde metni (Meta'ya yapıştırın):
--   Merhaba,
--
--   {{kurum_adi}} kurumuna yeni dershane kayıt formu geldi.
--
--   Öğrenci: {{ogrenci_ad_soyad}}
--   Veli: {{veli_ad_soyad}}
--   Program / Sınıf: {{program_sinif}}
--   Veli telefon: {{veli_tel}}
--   Sözleşme no: {{sozlesme_no}}
--
--   Lütfen Veli Onay panelinden ücret girişi ve onay işlemlerini tamamlayın.
--
--   Online VIP Dershane

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
  'Yeni dershane kayıt formu — admin bildirimi',
  'veli_kayit_admin_notify',
  'Merhaba,

{{kurum_adi}} kurumuna yeni dershane kayıt formu geldi.

Öğrenci: {{ogrenci_ad_soyad}}
Veli: {{veli_ad_soyad}}
Program / Sınıf: {{program_sinif}}
Veli telefon: {{veli_tel}}
Sözleşme no: {{sozlesme_no}}

Lütfen Veli Onay panelinden ücret girişi ve onay işlemlerini tamamlayın.

Online VIP Dershane',
  '["kurum_adi","ogrenci_ad_soyad","veli_ad_soyad","program_sinif","veli_tel","sozlesme_no"]'::jsonb,
  '["kurum_adi","ogrenci_ad_soyad","veli_ad_soyad","program_sinif","veli_tel","sozlesme_no"]'::jsonb,
  'whatsapp',
  true,
  'veli_kayit_admin_notify',
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
