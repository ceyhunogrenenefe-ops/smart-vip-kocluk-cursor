-- Kitap siparişi Meta şablonu — standart otomasyon yolu (sendAutomatedWhatsApp)
-- Meta BM adı: kitap_siparisi · Supabase type: kitap_siparis_bildirim
-- Gönderim öncesi API, phone WABA'dan dil/bağlama/named-param bilgisini otomatik senkronlar.

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
  E'📚 KİTAP SİPARİŞ FORMU\nVeli Ad Soyad:\n{{veli_ad_soyad}}\nÖğrenci Ad Soyad:\n{{ogrenci_ad_soyad}}\nSınıf:\n{{sinif}}\nÜcret Durumu:\n☐ Ödendi\n☐ Kapıda Ödeme\n☐ Havale Bekleniyor\nTelefon:\n{{telefon}}\nAdres:\n{{adres}}\nİlçe:\n{{ilce}}\nİl:\n{{il}}\n──────────────────\nOnline VIP Dershane öğrencisi için kitap siparişi oluşturulmuştur. Kargo işlemleri tamamlandığında takip numarasının tarafımıza iletilmesini rica ederiz.',
  '["veli_ad_soyad","ogrenci_ad_soyad","sinif","telefon","adres","ilce","il"]'::jsonb,
  '["veli_ad_soyad","ogrenci_ad_soyad","sinif","telefon","adres","ilce","il"]'::jsonb,
  'whatsapp',
  true,
  'kitap_siparisi',
  'tr',
  true,
  'APPROVED',
  NOW()
)
ON CONFLICT (type) DO UPDATE SET
  meta_template_name = 'kitap_siparisi',
  meta_template_language = COALESCE(message_templates.meta_template_language, 'tr'),
  variables = EXCLUDED.variables,
  twilio_variable_bindings = EXCLUDED.twilio_variable_bindings,
  channel = 'whatsapp',
  is_active = true,
  updated_at = NOW();

NOTIFY pgrst, 'reload schema';
