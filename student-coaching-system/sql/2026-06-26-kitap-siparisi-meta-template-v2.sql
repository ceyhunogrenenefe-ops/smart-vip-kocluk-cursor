-- Meta BM şablonu: kitap_siparisi v2 (9 gövde parametresi)
-- kitap_seti + siparis_notu eklendi; ücret durumu kaldırıldı

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
  'kitap_siparisi (Meta)',
  'kitap_siparis_bildirim',
  E'📚 YENİ KİTAP SİPARİŞİ\nVeli Ad Soyad:\n{{veli_ad_soyad}}\nÖğrenci Ad Soyad:\n{{ogrenci_ad_soyad}}\nSınıf:\n{{sinif}}\n📦 Gönderilecek Kitap Seti:\n{{kitap_seti}}\nTelefon:\n{{telefon}}\nAdres:\n{{adres}}\nİlçe:\n{{ilce}}\nİl:\n{{il}}\nSipariş Notu:\n{{siparis_notu}}\n────────────────────────\nOnline VIP Dershane tarafından oluşturulan kitap siparişidir.\nKargo işlemi tamamlandıktan sonra aşağıdaki bilgilerin paylaşılması rica olunur:\n🚚 Kargo Firması:\n🚚 Takip Numarası:\nTeşekkür ederiz.\nOnline VIP Dershane',
  '["veli_ad_soyad","ogrenci_ad_soyad","sinif","kitap_seti","telefon","adres","ilce","il","siparis_notu"]'::jsonb,
  '["veli_ad_soyad","ogrenci_ad_soyad","sinif","kitap_seti","telefon","adres","ilce","il","siparis_notu"]'::jsonb,
  'whatsapp',
  true,
  'kitap_siparisi',
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
  meta_named_body_parameters = EXCLUDED.meta_named_body_parameters,
  whatsapp_template_status = EXCLUDED.whatsapp_template_status,
  updated_at = NOW();

NOTIFY pgrst, 'reload schema';
