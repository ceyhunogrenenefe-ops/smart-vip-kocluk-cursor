-- Meta BM onaylı şablon: kitap_siparisi · Turkish (tr) · 9 adlandırılmış parametre
-- Supabase type: kitap_siparis_bildirim

UPDATE message_templates
SET
  name = 'kitap_siparisi (Meta)',
  content = E'📚 YENİ KİTAP SİPARİŞİ
Veli Ad Soyad:
{{veli_ad_soyad}}
Öğrenci Ad Soyad:
{{ogrenci_ad_soyad}}
Sınıf:
{{sinif}}
📦 Gönderilecek Kitap Seti:
{{kitap_seti}}
Telefon:
{{telefon}}
Adres:
{{adres}}
İlçe:
{{ilce}}
İl:
{{il}}
Sipariş Notu:
{{siparis_notu}}
────────────────────────
Online VIP Dershane tarafından oluşturulan kitap siparişidir.
Kargo işlemi tamamlandıktan sonra aşağıdaki bilgilerin paylaşılması rica olunur:
🚚 Kargo Firması:
🚚 Takip Numarası:
Teşekkür ederiz.
Online VIP Dershane',
  variables = '["veli_ad_soyad","ogrenci_ad_soyad","sinif","kitap_seti","telefon","adres","ilce","il","siparis_notu"]'::jsonb,
  twilio_variable_bindings = '["veli_ad_soyad","ogrenci_ad_soyad","sinif","kitap_seti","telefon","adres","ilce","il","siparis_notu"]'::jsonb,
  is_active = true,
  whatsapp_template_status = 'APPROVED',
  meta_template_name = 'kitap_siparisi',
  meta_template_language = 'tr',
  meta_named_body_parameters = true,
  channel = 'whatsapp',
  updated_at = NOW()
WHERE type = 'kitap_siparis_bildirim';

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
SELECT
  'kitap_siparisi (Meta)',
  'kitap_siparis_bildirim',
  E'📚 YENİ KİTAP SİPARİŞİ
Veli Ad Soyad:
{{veli_ad_soyad}}
Öğrenci Ad Soyad:
{{ogrenci_ad_soyad}}
Sınıf:
{{sinif}}
📦 Gönderilecek Kitap Seti:
{{kitap_seti}}
Telefon:
{{telefon}}
Adres:
{{adres}}
İlçe:
{{ilce}}
İl:
{{il}}
Sipariş Notu:
{{siparis_notu}}
────────────────────────
Online VIP Dershane tarafından oluşturulan kitap siparişidir.
Kargo işlemi tamamlandıktan sonra aşağıdaki bilgilerin paylaşılması rica olunur:
🚚 Kargo Firması:
🚚 Takip Numarası:
Teşekkür ederiz.
Online VIP Dershane',
  '["veli_ad_soyad","ogrenci_ad_soyad","sinif","kitap_seti","telefon","adres","ilce","il","siparis_notu"]'::jsonb,
  '["veli_ad_soyad","ogrenci_ad_soyad","sinif","kitap_seti","telefon","adres","ilce","il","siparis_notu"]'::jsonb,
  'whatsapp',
  true,
  'kitap_siparisi',
  'tr',
  true,
  'APPROVED',
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM message_templates WHERE type = 'kitap_siparis_bildirim'
);

NOTIFY pgrst, 'reload schema';
