-- Eski kitap_siparisleri şemasını form alanlarına günceller (önceki SQL çalıştırıldıysa)
-- Güvenli: yalnızca eksik sütunları ekler ve şablonu günceller

ALTER TABLE kitap_siparisleri ADD COLUMN IF NOT EXISTS veli_ad_soyad TEXT;
ALTER TABLE kitap_siparisleri ADD COLUMN IF NOT EXISTS ogrenci_ad_soyad TEXT;
ALTER TABLE kitap_siparisleri ADD COLUMN IF NOT EXISTS ucret_durumu TEXT;
ALTER TABLE kitap_siparisleri ADD COLUMN IF NOT EXISTS ilce TEXT;
ALTER TABLE kitap_siparisleri ADD COLUMN IF NOT EXISTS il TEXT;
ALTER TABLE kitap_siparisleri ADD COLUMN IF NOT EXISTS siparis_notu TEXT;

-- Eski sütunlardan veri taşı
UPDATE kitap_siparisleri SET veli_ad_soyad = veli_adi WHERE veli_ad_soyad IS NULL AND veli_adi IS NOT NULL;
UPDATE kitap_siparisleri SET ogrenci_ad_soyad = ogrenci_adi WHERE ogrenci_ad_soyad IS NULL AND ogrenci_adi IS NOT NULL;
UPDATE kitap_siparisleri SET siparis_notu = notlar WHERE siparis_notu IS NULL AND notlar IS NOT NULL;

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
  'Kitap siparişi — kitapçı bildirimi',
  'kitap_siparis_bildirim',
  E'📚 KİTAP SİPARİŞ FORMU\nSipariş No: {{siparis_no}}\n\nVeli Ad Soyad: {{veli_ad_soyad}}\nÖğrenci Ad Soyad: {{ogrenci_ad_soyad}}\nSınıf: {{sinif}}\nÜcret Durumu: {{ucret_durumu}}\n\nTelefon: {{telefon}}\nAdres: {{adres}}\nİlçe: {{ilce}}\nİl: {{il}}\n\nSipariş Notu: {{siparis_notu}}\n\nOnline VIP Dershane öğrencisi için kitap siparişi oluşturulmuştur. Kargo işlemleri tamamlandığında takip numarasının tarafımıza iletilmesini rica ederiz.',
  '["kitapci_adi","siparis_no","veli_ad_soyad","ogrenci_ad_soyad","sinif","ucret_durumu","telefon","adres","ilce","il","siparis_notu"]'::jsonb,
  '["kitapci_adi","siparis_no","veli_ad_soyad","ogrenci_ad_soyad","sinif","ucret_durumu","telefon","adres","ilce","il","siparis_notu"]'::jsonb,
  'whatsapp',
  true,
  'kitap_siparis_bildirim',
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

-- Eski kayıtlar: onay bekleyen siparişler otomatik gönderilmesin
UPDATE kitap_siparisleri
SET whatsapp_status = 'awaiting_approval'
WHERE status = 'pending'
  AND whatsapp_status = 'pending';

NOTIFY pgrst, 'reload schema';
